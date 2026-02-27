"""
Athletiq - Self-hosted Strava Analytics Platform
FastAPI Backend
"""

import os
import httpx
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, Boolean, Text, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
import json

# ── Config ────────────────────────────────────────────────────────────────────
CLIENT_ID = os.getenv("STRAVA_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("STRAVA_CLIENT_SECRET", "")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./strava.db")

STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API_BASE = "https://www.strava.com/api/v3"

# ── Database ──────────────────────────────────────────────────────────────────
engine_args = {}
if DATABASE_URL.startswith("sqlite"):
    engine_args = {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool}

engine = create_engine(DATABASE_URL, **engine_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class TokenStore(Base):
    __tablename__ = "tokens"
    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, unique=True)
    access_token = Column(String)
    refresh_token = Column(String)
    expires_at = Column(Integer)
    athlete_data = Column(Text)  # JSON


class Activity(Base):
    __tablename__ = "activities"
    id = Column(Integer, primary_key=True)
    athlete_id = Column(Integer)
    name = Column(String)
    sport_type = Column(String)
    start_date = Column(DateTime)
    distance = Column(Float)           # meters
    moving_time = Column(Integer)      # seconds
    elapsed_time = Column(Integer)
    total_elevation_gain = Column(Float)
    average_speed = Column(Float)
    max_speed = Column(Float)
    average_heartrate = Column(Float, nullable=True)
    max_heartrate = Column(Float, nullable=True)
    average_watts = Column(Float, nullable=True)
    weighted_average_watts = Column(Float, nullable=True)
    kilojoules = Column(Float, nullable=True)
    suffer_score = Column(Float, nullable=True)
    kudos_count = Column(Integer, default=0)
    pr_count = Column(Integer, default=0)
    achievement_count = Column(Integer, default=0)
    trainer = Column(Boolean, default=False)
    commute = Column(Boolean, default=False)
    map_summary_polyline = Column(Text, nullable=True)
    raw_data = Column(Text)  # full JSON


Base.metadata.create_all(bind=engine)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Athletiq API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Auth ──────────────────────────────────────────────────────────────────────
@app.get("/auth/login")
def login():
    """Redirect user to Strava OAuth."""
    redirect_uri = f"{BACKEND_URL}/auth/callback"
    url = (
        f"{STRAVA_AUTH_URL}?client_id={CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&approval_prompt=auto"
        f"&scope=read,activity:read_all"
    )
    return RedirectResponse(url)


@app.get("/auth/callback")
async def callback(code: str, background_tasks: BackgroundTasks):
    """Handle Strava OAuth callback."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(STRAVA_TOKEN_URL, data={
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
        })
    if resp.status_code != 200:
        raise HTTPException(400, f"Token exchange failed: {resp.text}")

    data = resp.json()
    db = SessionLocal()
    try:
        athlete_id = data["athlete"]["id"]
        token = db.query(TokenStore).filter_by(athlete_id=athlete_id).first()
        if not token:
            token = TokenStore(athlete_id=athlete_id)
            db.add(token)
        token.access_token = data["access_token"]
        token.refresh_token = data["refresh_token"]
        token.expires_at = data["expires_at"]
        token.athlete_data = json.dumps(data["athlete"])
        db.commit()
    finally:
        db.close()

    # Kick off background sync
    background_tasks.add_task(sync_all_activities, athlete_id)
    return RedirectResponse(f"{APP_URL}?syncing=true&athlete_id={athlete_id}")


async def get_valid_token(athlete_id: int, db: Session) -> str:
    """Get a valid access token, refreshing if needed."""
    token = db.query(TokenStore).filter_by(athlete_id=athlete_id).first()
    if not token:
        raise HTTPException(401, "Not authenticated")

    if token.expires_at < datetime.utcnow().timestamp() + 300:
        async with httpx.AsyncClient() as client:
            resp = await client.post(STRAVA_TOKEN_URL, data={
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "refresh_token": token.refresh_token,
                "grant_type": "refresh_token",
            })
        data = resp.json()
        token.access_token = data["access_token"]
        token.refresh_token = data["refresh_token"]
        token.expires_at = data["expires_at"]
        db.commit()

    return token.access_token


# ── Sync ──────────────────────────────────────────────────────────────────────
sync_progress = {}


async def sync_all_activities(athlete_id: int):
    """Fetch all activities from Strava and store them."""
    sync_progress[athlete_id] = {"status": "syncing", "count": 0, "total": None}
    db = SessionLocal()
    try:
        access_token = await get_valid_token(athlete_id, db)
        page = 1
        per_page = 100
        total = 0

        async with httpx.AsyncClient(timeout=30) as client:
            while True:
                resp = await client.get(
                    f"{STRAVA_API_BASE}/athlete/activities",
                    headers={"Authorization": f"Bearer {access_token}"},
                    params={"page": page, "per_page": per_page},
                )
                if resp.status_code == 429:
                    await asyncio.sleep(60)
                    continue
                activities = resp.json()
                if not activities:
                    break

                for a in activities:
                    existing = db.query(Activity).filter_by(id=a["id"]).first()
                    if existing:
                        continue
                    act = Activity(
                        id=a["id"],
                        athlete_id=athlete_id,
                        name=a.get("name", ""),
                        sport_type=a.get("sport_type", a.get("type", "")),
                        start_date=datetime.fromisoformat(a["start_date"].replace("Z", "")),
                        distance=a.get("distance", 0),
                        moving_time=a.get("moving_time", 0),
                        elapsed_time=a.get("elapsed_time", 0),
                        total_elevation_gain=a.get("total_elevation_gain", 0),
                        average_speed=a.get("average_speed", 0),
                        max_speed=a.get("max_speed", 0),
                        average_heartrate=a.get("average_heartrate"),
                        max_heartrate=a.get("max_heartrate"),
                        average_watts=a.get("average_watts"),
                        weighted_average_watts=a.get("weighted_average_watts"),
                        kilojoules=a.get("kilojoules"),
                        suffer_score=a.get("suffer_score"),
                        kudos_count=a.get("kudos_count", 0),
                        pr_count=a.get("pr_count", 0),
                        achievement_count=a.get("achievement_count", 0),
                        trainer=a.get("trainer", False),
                        commute=a.get("commute", False),
                        map_summary_polyline=a.get("map", {}).get("summary_polyline"),
                        raw_data=json.dumps(a),
                    )
                    db.add(act)
                    total += 1

                db.commit()
                sync_progress[athlete_id]["count"] = total
                page += 1
                await asyncio.sleep(0.5)  # Rate limit courtesy

        sync_progress[athlete_id] = {"status": "complete", "count": total}
    except Exception as e:
        sync_progress[athlete_id] = {"status": "error", "error": str(e)}
    finally:
        db.close()


# ── API Endpoints ─────────────────────────────────────────────────────────────
@app.get("/api/status/{athlete_id}")
def get_sync_status(athlete_id: int):
    return sync_progress.get(athlete_id, {"status": "idle"})


@app.post("/api/sync/{athlete_id}")
async def trigger_sync(athlete_id: int, background_tasks: BackgroundTasks):
    """Manually trigger a sync."""
    sync_progress[athlete_id] = {"status": "syncing", "count": 0}
    background_tasks.add_task(sync_all_activities, athlete_id)
    return {"message": "Sync started"}


@app.get("/api/athlete/{athlete_id}")
def get_athlete(athlete_id: int):
    db = SessionLocal()
    try:
        token = db.query(TokenStore).filter_by(athlete_id=athlete_id).first()
        if not token:
            raise HTTPException(404, "Athlete not found")
        return json.loads(token.athlete_data)
    finally:
        db.close()


@app.get("/api/activities/{athlete_id}")
def get_activities(
    athlete_id: int,
    sport_type: Optional[str] = None,
    year: Optional[int] = None,
    limit: int = Query(100, le=1000),
    offset: int = 0,
):
    db = SessionLocal()
    try:
        q = db.query(Activity).filter_by(athlete_id=athlete_id)
        if sport_type:
            q = q.filter(Activity.sport_type.ilike(f"%{sport_type}%"))
        if year:
            q = q.filter(
                Activity.start_date >= datetime(year, 1, 1),
                Activity.start_date < datetime(year + 1, 1, 1),
            )
        total = q.count()
        acts = q.order_by(Activity.start_date.desc()).offset(offset).limit(limit).all()
        return {
            "total": total,
            "activities": [_activity_to_dict(a) for a in acts],
        }
    finally:
        db.close()


@app.get("/api/stats/{athlete_id}")
def get_stats(athlete_id: int, year: Optional[int] = None):
    """Aggregate statistics."""
    db = SessionLocal()
    try:
        q = db.query(Activity).filter_by(athlete_id=athlete_id)
        if year:
            q = q.filter(
                Activity.start_date >= datetime(year, 1, 1),
                Activity.start_date < datetime(year + 1, 1, 1),
            )
        acts = q.all()
        if not acts:
            return {"total_activities": 0}

        by_sport = {}
        monthly = {}
        yearly_dist = {}
        pr_total = 0
        total_suffer = 0

        for a in acts:
            sport = a.sport_type or "Other"
            if sport not in by_sport:
                by_sport[sport] = {"count": 0, "distance": 0, "elevation": 0, "time": 0}
            by_sport[sport]["count"] += 1
            by_sport[sport]["distance"] += a.distance or 0
            by_sport[sport]["elevation"] += a.total_elevation_gain or 0
            by_sport[sport]["time"] += a.moving_time or 0

            if a.start_date:
                month_key = a.start_date.strftime("%Y-%m")
                if month_key not in monthly:
                    monthly[month_key] = {"distance": 0, "count": 0, "elevation": 0}
                monthly[month_key]["distance"] += a.distance or 0
                monthly[month_key]["count"] += 1
                monthly[month_key]["elevation"] += a.total_elevation_gain or 0

                yr = str(a.start_date.year)
                yearly_dist[yr] = yearly_dist.get(yr, 0) + (a.distance or 0)

            pr_total += a.pr_count or 0
            total_suffer += a.suffer_score or 0

        return {
            "total_activities": len(acts),
            "total_distance": sum(a.distance or 0 for a in acts),
            "total_elevation": sum(a.total_elevation_gain or 0 for a in acts),
            "total_time": sum(a.moving_time or 0 for a in acts),
            "total_prs": pr_total,
            "total_suffer_score": total_suffer,
            "by_sport": by_sport,
            "monthly": monthly,
            "yearly": yearly_dist,
            "longest_ride": max((a.distance or 0 for a in acts if "ride" in (a.sport_type or "").lower()), default=0),
            "longest_run": max((a.distance or 0 for a in acts if "run" in (a.sport_type or "").lower()), default=0),
            "biggest_climb": max((a.total_elevation_gain or 0 for a in acts), default=0),
        }
    finally:
        db.close()


@app.get("/api/heatmap/{athlete_id}")
def get_heatmap_data(athlete_id: int, sport_type: Optional[str] = None):
    """Return polylines for heatmap rendering."""
    db = SessionLocal()
    try:
        q = db.query(Activity.map_summary_polyline, Activity.sport_type).filter_by(athlete_id=athlete_id)
        if sport_type:
            q = q.filter(Activity.sport_type.ilike(f"%{sport_type}%"))
        results = q.filter(Activity.map_summary_polyline.isnot(None)).all()
        return [{"polyline": r[0], "sport_type": r[1]} for r in results if r[0]]
    finally:
        db.close()


@app.get("/api/fitness/{athlete_id}")
def get_fitness_curve(athlete_id: int):
    """CTL/ATL/TSB fitness/freshness curve (requires power or HR data)."""
    db = SessionLocal()
    try:
        acts = db.query(Activity).filter_by(athlete_id=athlete_id).order_by(Activity.start_date).all()
        days = {}
        for a in acts:
            if not a.start_date:
                continue
            day = a.start_date.strftime("%Y-%m-%d")
            # Use suffer score as proxy for TSS if no power
            tss = a.suffer_score or 0
            if a.kilojoules:
                tss = a.kilojoules / 3.6  # rough TSS from kJ
            days[day] = days.get(day, 0) + tss

        if not days:
            return []

        # Calculate CTL (42-day), ATL (7-day), TSB
        all_days = []
        start = min(datetime.strptime(d, "%Y-%m-%d") for d in days)
        end = datetime.utcnow()
        current = start
        ctl = 0.0
        atl = 0.0

        results = []
        while current <= end:
            day_str = current.strftime("%Y-%m-%d")
            tss = days.get(day_str, 0)
            ctl = ctl + (tss - ctl) / 42
            atl = atl + (tss - atl) / 7
            tsb = ctl - atl
            if tss > 0 or (current - end).days > -365:
                results.append({
                    "date": day_str,
                    "ctl": round(ctl, 1),
                    "atl": round(atl, 1),
                    "tsb": round(tsb, 1),
                    "tss": tss,
                })
            current += timedelta(days=1)

        return results[-365:]  # last year
    finally:
        db.close()


@app.get("/api/records/{athlete_id}")
def get_personal_records(athlete_id: int):
    """Best performances by distance/sport."""
    db = SessionLocal()
    try:
        acts = db.query(Activity).filter_by(athlete_id=athlete_id).all()
        records = {"ride": {}, "run": {}}

        for a in acts:
            if not a.distance or not a.moving_time or not a.average_speed:
                continue
            sport = (a.sport_type or "").lower()
            if "ride" in sport:
                cat = "ride"
            elif "run" in sport:
                cat = "run"
            else:
                continue

            # Best speed for various distance buckets
            for dist_km, label in [(5, "5km"), (10, "10km"), (21.1, "Half"), (42.2, "Marathon"),
                                    (100, "100km"), (160, "100mi")]:
                if a.distance >= dist_km * 1000:
                    pace = a.moving_time / (a.distance / 1000)
                    if label not in records[cat] or pace < records[cat][label]["pace"]:
                        records[cat][label] = {
                            "pace": pace,
                            "date": a.start_date.strftime("%Y-%m-%d") if a.start_date else "",
                            "name": a.name,
                            "activity_id": a.id,
                        }

        return records
    finally:
        db.close()


def _activity_to_dict(a: Activity):
    return {
        "id": a.id,
        "name": a.name,
        "sport_type": a.sport_type,
        "start_date": a.start_date.isoformat() if a.start_date else None,
        "distance": a.distance,
        "moving_time": a.moving_time,
        "elapsed_time": a.elapsed_time,
        "total_elevation_gain": a.total_elevation_gain,
        "average_speed": a.average_speed,
        "max_speed": a.max_speed,
        "average_heartrate": a.average_heartrate,
        "max_heartrate": a.max_heartrate,
        "average_watts": a.average_watts,
        "weighted_average_watts": a.weighted_average_watts,
        "kilojoules": a.kilojoules,
        "suffer_score": a.suffer_score,
        "kudos_count": a.kudos_count,
        "pr_count": a.pr_count,
        "achievement_count": a.achievement_count,
        "trainer": a.trainer,
        "commute": a.commute,
        "map_summary_polyline": a.map_summary_polyline,
    }


@app.get("/api/activity/{athlete_id}/{activity_id}/gpx")
async def get_activity_gpx(athlete_id: int, activity_id: int):
    """Fetch full GPS stream from Strava and return as GPX file."""
    from fastapi.responses import Response

    db = SessionLocal()
    try:
        # Get activity metadata from DB
        act = db.query(Activity).filter_by(id=activity_id, athlete_id=athlete_id).first()
        if not act:
            raise HTTPException(404, "Activity not found")

        # Get valid token
        access_token = await get_valid_token(athlete_id, db)

        # Fetch streams from Strava: latlng, altitude, time
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{STRAVA_API_BASE}/activities/{activity_id}/streams",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"keys": "latlng,altitude,time", "key_by_type": "true"},
            )

        if resp.status_code != 200:
            raise HTTPException(502, f"Strava streams API error: {resp.text}")

        streams = resp.json()
        latlng = streams.get("latlng", {}).get("data", [])
        altitudes = streams.get("altitude", {}).get("data", [])
        times = streams.get("time", {}).get("data", [])

        if not latlng:
            raise HTTPException(404, "No GPS data available for this activity")

        # Build GPX XML
        start_iso = act.start_date.strftime("%Y-%m-%dT%H:%M:%SZ") if act.start_date else "1970-01-01T00:00:00Z"
        safe_name = (act.name or "Activity").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        trkpts = []
        for i, (lat, lon) in enumerate(latlng):
            ele = f"<ele>{altitudes[i]:.1f}</ele>" if i < len(altitudes) else ""
            if i < len(times) and act.start_date:
                from datetime import timezone
                t = act.start_date.replace(tzinfo=timezone.utc)
                from datetime import timedelta
                t = t + timedelta(seconds=times[i])
                time_str = f"<time>{t.strftime('%Y-%m-%dT%H:%M:%SZ')}</time>"
            else:
                time_str = ""
            trkpts.append(f'      <trkpt lat="{lat}" lon="{lon}">{ele}{time_str}</trkpt>')

        gpx = f'''<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Athletiq"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>{safe_name}</name>
    <time>{start_iso}</time>
  </metadata>
  <trk>
    <name>{safe_name}</name>
    <trkseg>
{chr(10).join(trkpts)}
    </trkseg>
  </trk>
</gpx>'''

        filename = f"{safe_name.replace(' ', '_')}_{activity_id}.gpx"
        return Response(
            content=gpx,
            media_type="application/gpx+xml",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    finally:
        db.close()


@app.get("/api/export/{athlete_id}/csv")
def export_csv(athlete_id: int):
    """Export all activities as a CSV file."""
    import csv
    import io
    from fastapi.responses import StreamingResponse

    db = SessionLocal()
    try:
        acts = db.query(Activity).filter_by(athlete_id=athlete_id).order_by(Activity.start_date.desc()).all()

        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow([
            "id", "name", "sport_type", "date", "distance_km", "moving_time_s",
            "moving_time_hms", "elapsed_time_s", "elevation_m", "avg_speed_kmh",
            "avg_pace_min_km", "max_speed_kmh", "avg_heartrate", "max_heartrate",
            "avg_watts", "weighted_avg_watts", "kilojoules", "suffer_score",
            "kudos", "prs", "achievements", "trainer", "commute",
        ])

        for a in acts:
            dist_km = (a.distance or 0) / 1000
            avg_speed_kmh = round((a.average_speed or 0) * 3.6, 2)
            # Pace in decimal minutes per km
            if a.moving_time and a.distance and a.distance > 0:
                sec_per_km = a.moving_time / (a.distance / 1000)
                mins = int(sec_per_km // 60)
                secs = int(sec_per_km % 60)
                pace_str = f"{mins}:{secs:02d}"
            else:
                pace_str = ""

            h = (a.moving_time or 0) // 3600
            m = ((a.moving_time or 0) % 3600) // 60
            s = (a.moving_time or 0) % 60
            hms_str = f"{h}:{m:02d}:{s:02d}"

            writer.writerow([
                a.id,
                a.name,
                a.sport_type,
                a.start_date.strftime("%Y-%m-%d %H:%M:%S") if a.start_date else "",
                round(dist_km, 3),
                a.moving_time,
                hms_str,
                a.elapsed_time,
                round(a.total_elevation_gain or 0, 1),
                avg_speed_kmh,
                pace_str,
                round((a.max_speed or 0) * 3.6, 2),
                round(a.average_heartrate, 1) if a.average_heartrate else "",
                round(a.max_heartrate, 0) if a.max_heartrate else "",
                round(a.average_watts, 1) if a.average_watts else "",
                round(a.weighted_average_watts, 1) if a.weighted_average_watts else "",
                round(a.kilojoules, 1) if a.kilojoules else "",
                round(a.suffer_score, 0) if a.suffer_score else "",
                a.kudos_count or 0,
                a.pr_count or 0,
                a.achievement_count or 0,
                a.trainer,
                a.commute,
            ])

        output.seek(0)
        filename = f"athletiq_activities_{athlete_id}.csv"
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    finally:
        db.close()
