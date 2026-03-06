<div align="center">

# 🏃 Athletiq

**Self-hosted Strava analytics for every sport, on your own hardware**

A privacy-first alternative to Veloviewer — all your training data, owned by you, forever.

![License](https://img.shields.io/badge/license-MIT-green)
![Docker](https://img.shields.io/badge/docker-compose-blue)
![Python](https://img.shields.io/badge/python-3.11-blue)
![React](https://img.shields.io/badge/react-18-61dafb)

</div>

---

## ✨ Features

| Page | What you get |
|---|---|
| 📊 **Dashboard** | Running-first stats, weekly volume chart, personal bests table, sport breakdown |
| 📅 **Calendar** | GitHub-style activity heatmap by year, monthly breakdown grid |
| 📉 **Progression** | Scatter plot of pace over time, multi-route map overlay, time period filtering |
| 🏅 **Race History** | Filter by distance preset or custom range, count summary, best pace highlighting |
| 📋 **Activities** | Paginated activity log with year/sport filters |
| 🗺️ **Activity detail** | Route map, tabbed km splits, best efforts, segments with map highlighting and history delta, activity description, GPX download |
| ⬇ **Export** | Full CSV export of all activities |

**Everything runs on your own hardware.** No third-party servers, no subscriptions, no ads.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────┐
│  Synology NAS                                │
│                                              │
│  ┌──────────────┐    ┌──────────────────┐   │
│  │   Frontend   │    │     Backend      │   │
│  │  React/Nginx │    │  FastAPI/Python  │   │
│  │  Port 3000   │◄──►│  Port 8000+      │   │
│  └──────────────┘    └────────┬─────────┘   │
│                               │              │
│                      ┌────────▼─────────┐   │
│                      │    PostgreSQL     │   │
│                      │   Port 5432      │   │
│                      └──────────────────┘   │
│                               │              │
└───────────────────────────────┼─────────────┘
                                │ Strava API
                                ▼
                      strava.com/api/v3
```

- **Frontend**: React 18 + Vite + Recharts + Leaflet, served by Nginx
- **Backend**: FastAPI (Python 3.11) with SQLAlchemy + httpx
- **Database**: PostgreSQL 15 with persistent volume
- **Networking**: Backend uses host networking for reliable outbound API access on Synology

---

## 📋 Requirements

- Synology NAS running **DSM 7+**
- **Container Manager** package installed (formerly Docker)
- Strava account with API access

---

## 🚀 Quick Start

### 1. Create a Strava API Application

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api)
2. Create an app — name and description can be anything
3. Set **Authorization Callback Domain** to your NAS's local IP (e.g. `192.168.1.100`)
4. Note your **Client ID** and **Client Secret**

### 2. Clone and Configure

```bash
# SSH into your NAS
ssh admin@192.168.1.100

# Clone the repo
git clone https://github.com/yourusername/athletiq.git /volume1/docker/athletiq
cd /volume1/docker/athletiq

# Copy and edit the environment file
cp .env.example .env
vi .env
```

Fill in your `.env`:

```env
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
NAS_IP=192.168.1.100
APP_URL=http://192.168.1.100:3000
BACKEND_URL=http://192.168.1.100:8000
FRONTEND_PORT=3000
BACKEND_PORT=8000
DB_PASSWORD=choose_a_strong_password
```

### 3. Build and Run

```bash
docker compose up -d --build
```

### 4. Connect Strava

Open `http://YOUR_NAS_IP:3000` in your browser and click **Connect with Strava**. Your activities will begin syncing immediately — this may take a few minutes if you have years of history.

---

## ⚙️ Configuration

| Variable | Description | Example |
|---|---|---|
| `STRAVA_CLIENT_ID` | Your Strava API client ID | `12345` |
| `STRAVA_CLIENT_SECRET` | Your Strava API client secret | `abc123...` |
| `NAS_IP` | Your NAS local IP address | `192.168.1.100` |
| `APP_URL` | Full URL to the frontend | `http://192.168.1.100:3000` |
| `BACKEND_URL` | Full URL to the backend API | `http://192.168.1.100:8000` |
| `FRONTEND_PORT` | Port for the web UI | `3000` |
| `BACKEND_PORT` | Port for the API | `8000` |
| `DB_PASSWORD` | PostgreSQL password | `something_strong` |

---

## 🔄 Keeping Activities in Sync

### Manual sync
Click **⟳ Sync Strava** in the sidebar at any time.

### Automatic nightly sync
Set up a scheduled task in **DSM → Control Panel → Task Scheduler**:

- **Type**: User-defined script
- **Schedule**: Daily at 02:00
- **Command**:
  ```bash
  curl -s -X POST http://localhost:YOUR_BACKEND_PORT/api/sync/YOUR_ATHLETE_ID
  ```

Your athlete ID appears in the URL after you first connect — or find it at `strava.com/athletes/XXXXXX`.

---

## ⚠️ Strava API Limitations

Athletiq is built on Strava's **free API tier**. This is intentional — no subscription required — but it does mean certain things work differently from paid tools like Veloviewer or Strava Summit.

### What works fully

| Feature | How it works |
|---|---|
| Activity sync | Full history via paginated API — no restrictions |
| Km splits | Fetched from activity detail endpoint, cached locally |
| Best efforts | Fetched from activity detail endpoint, cached locally |
| Segment efforts per activity | Included in the activity detail response |
| Segment map highlighting | Derived from route GPS + segment start/end coordinates — no extra API call |
| Segment history delta | Scanned from locally cached activity details |
| Backfill scan | Progressively fetches un-cached activities in the background |

### What is restricted by Strava

| Feature | Reason | Workaround |
|---|---|---|
| Full segment effort history | `/segment_efforts` requires Strava Summit (paid) — returns HTTP 402 on free accounts | History builds automatically as you open activities; use "Find previous efforts" to scan the backlog |
| Segment leaderboards | Restricted endpoint | Not implemented |
| Athlete heart rate zones | Restricted endpoint | Not implemented |

### Segment history depth

The Δ vs PR column in the Segments tab is powered by scanning your **locally cached activity data**. This means:

- The more activities you have opened in Athletiq, the richer the history becomes
- Every time you open an activity modal, its detail is fetched and cached automatically — even on the Overview tab
- Use the **🔍 Find previous efforts** button on any segment to scan all remaining un-fetched activities in the background
- A segment marked `🥇 PR` by Strava but showing `–` delta simply means the previous effort hasn't been cached yet — it is a genuine PR

### Rate limits

Strava imposes a limit of **200 requests per 15 minutes** and **2,000 per day** on the free tier. Athletiq manages this carefully:

- Normal browsing uses very few requests (one per activity opened)
- The backfill scan runs at ~10 requests/min with automatic backoff if limits are approached
- A full backfill of a large history (e.g. 500 un-fetched activities) takes ~50 minutes and should be left running in a background tab
- If rate limited mid-backfill, a Retry button appears and the scan resumes from where it left off next time

---

## 📡 API Endpoints

The backend exposes a REST API at `http://NAS_IP:BACKEND_PORT`:

| Endpoint | Description |
|---|---|
| `GET /docs` | Interactive API documentation |
| `GET /api/athlete/{id}` | Athlete profile |
| `GET /api/activities/{id}` | Paginated activity list |
| `GET /api/stats/{id}` | Aggregate statistics |
| `GET /api/fitness/{id}` | CTL/ATL/TSB fitness data |
| `POST /api/sync/{id}` | Trigger activity sync |
| `GET /api/status/{id}` | Sync status |
| `GET /api/activity/{id}/{activity_id}/detail` | Km splits, best efforts, segments, description (cached) |
| `GET /api/segments/{id}/{segment_id}/history` | Scan cached activities for efforts on a segment |
| `GET /api/segments/{id}/{segment_id}/backfill` | SSE stream — progressively fetch un-cached activity details |
| `GET /api/activity/{id}/{activity_id}/gpx` | Download GPX file |
| `GET /api/export/{id}/csv` | Export all activities as CSV |

---

## 🔒 Security Notes

- Athletiq is designed for **local network use**. If you expose it to the internet, consider putting it behind a reverse proxy with authentication.
- Your Strava tokens are stored in the local PostgreSQL database — they never leave your network.
- Use a strong `DB_PASSWORD` — even on a local network.
- Never commit your `.env` file — it's in `.gitignore` by default.

---

## 🗺 External Access

If you want to access Athletiq outside your home network:

1. Forward both `FRONTEND_PORT` and `BACKEND_PORT` on your router to your NAS IP
2. Update `APP_URL` and `BACKEND_URL` in `.env` to use your external IP or domain
3. Update the **Authorization Callback Domain** in your Strava API settings to match
4. Rebuild the frontend: `docker compose up -d --build frontend`

For best security, use Synology's built-in **Reverse Proxy** (Control Panel → Login Portal → Advanced) with a domain and HTTPS certificate.

---

## 🛠 Troubleshooting

**Backend can't reach Strava API**
The backend uses `network_mode: host` for this reason. If you're still having issues, check DSM's firewall settings under Control Panel → Security → Firewall.

**Activities not syncing**
Check the backend logs: `docker compose logs -f backend`
Verify your access token is valid: `docker exec -it athletiq-db psql -U velosyno -d athletiq -c "SELECT athlete_id, expires_at FROM tokens;"`

**Frontend shows blank page**
The `VITE_API_URL` is baked in at build time. If you change `BACKEND_URL` in `.env`, rebuild the frontend: `docker compose up -d --build frontend`

**Port conflicts**
Change `FRONTEND_PORT` and/or `BACKEND_PORT` in `.env` and rebuild.

---

## 📁 Project Structure

```
athletiq/
├── backend/
│   ├── main.py          # FastAPI application
│   ├── requirements.txt
│   ├── Dockerfile
│   └── entrypoint.sh    # Reads BACKEND_PORT at runtime
├── frontend/
│   ├── src/
│   │   ├── App.jsx      # Main React application
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf
│   └── Dockerfile       # Multi-stage: node build → nginx serve
├── scripts/
│   ├── setup.sh         # Interactive first-time setup
│   └── update.sh        # Pull latest and rebuild
├── docker-compose.yml
├── .env.example
├── .gitignore
├── CHANGELOG.md
└── README.md
```

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for details and [CHANGELOG.md](CHANGELOG.md) for what's changed.

Ideas for future features:

- 🎯 Annual distance goal tracker
- 👟 Shoe/gear mileage tracker
- 📊 Year vs year comparison
- 🏆 Age grade calculator
- 📧 Weekly summary email digest
- 🗺 Full heatmap of all routes

Please open an issue before starting significant work so we can discuss approach.

---

## 📄 License

MIT — do whatever you like with it.

---

<div align="center">
Built with ❤️ for athletes who want to own their data.
</div>
