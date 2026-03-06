import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ZAxis
} from "recharts";

// ── Config ──────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── Utils ────────────────────────────────────────────────────────────────────
const km = (m) => ((m || 0) / 1000).toFixed(1);
const hms = (s) => {
  if (!s) return "–";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};
const pace = (ms, distM) => {
  if (!ms || !distM) return "–";
  const secPerKm = ms / (distM / 1000);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")} /km`;
};
const paceVal = (ms, distM) => {
  if (!ms || !distM) return 0;
  return ms / (distM / 1000);
};
const formatPaceSeconds = (secPerKm) => {
  if (!secPerKm) return "–";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};
const formatDate = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
};

// Calculate half split from km splits array
const calcHalfSplit = (splits) => {
  if (!splits || splits.length < 2) return null;
  const totalDist = splits.reduce((sum, s) => sum + (s.distance || 0), 0);
  if (totalDist < 1000) return null;
  const halfDist = totalDist / 2;
  let accumulated = 0;
  let firstTime = 0;
  let firstDist = 0;
  let secondTime = 0;
  let secondDist = 0;
  for (const s of splits) {
    const remaining = halfDist - accumulated;
    if (accumulated < halfDist) {
      if (accumulated + s.distance <= halfDist) {
        firstTime += s.moving_time;
        firstDist += s.distance;
      } else {
        // Partially in first half
        const fraction = remaining / s.distance;
        firstTime += Math.round(s.moving_time * fraction);
        firstDist += remaining;
        secondTime += Math.round(s.moving_time * (1 - fraction));
        secondDist += s.distance - remaining;
      }
    } else {
      secondTime += s.moving_time;
      secondDist += s.distance;
    }
    accumulated += s.distance;
  }
  if (!firstTime || !secondTime || !firstDist || !secondDist) return null;
  const firstPace = firstTime / (firstDist / 1000);
  const secondPace = secondTime / (secondDist / 1000);
  const diffSec = Math.round(secondPace - firstPace);
  return { firstPace, secondPace, diffSec, firstTime, secondTime };
};
const isRun = (type = "") => type.toLowerCase().includes("run");
const sportIcon = (type = "") => {
  const t = type.toLowerCase();
  if (t.includes("ride") || t.includes("cycling")) return "🚴";
  if (t.includes("run")) return "🏃";
  if (t.includes("swim")) return "🏊";
  if (t.includes("walk") || t.includes("hike")) return "🥾";
  if (t.includes("ski")) return "⛷️";
  if (t.includes("yoga")) return "🧘";
  if (t.includes("weight")) return "🏋️";
  return "🏅";
};
const sportColor = (type = "") => {
  const t = type.toLowerCase();
  if (t.includes("run")) return "#00D4AA";
  if (t.includes("ride")) return "#FF6B2B";
  if (t.includes("swim")) return "#3B82F6";
  return "#8B5CF6";
};

// Distance presets
const DISTANCE_PRESETS = [
  { label: "5K",       min: 4.5,  max: 5.5  },
  { label: "10K",      min: 9.5,  max: 10.5 },
  { label: "Half",     min: 20,   max: 22.5 },
  { label: "Marathon", min: 41.5, max: 43   },
  { label: "Ultra",    min: 43,   max: 9999 },
];

const RACE_DISTANCES = [
  { label: "5K",       minKm: 4.8,  maxKm: 5.3,  targetKm: 5    },
  { label: "10K",      minKm: 9.8,  maxKm: 10.3, targetKm: 10   },
  { label: "Half Marathon", minKm: 20.9, maxKm: 21.5, targetKm: 21.0975 },
  { label: "Marathon", minKm: 41.8, maxKm: 42.6, targetKm: 42.195 },
  { label: "Ultra",    minKm: 43,   maxKm: 9999, targetKm: null },
];

// ── Components ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, highlight }) {
  return (
    <div style={{
      background: highlight ? "rgba(0,212,170,0.07)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${highlight ? "rgba(0,212,170,0.3)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 16, padding: "24px 28px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: accent || "#00D4AA", borderRadius: "16px 16px 0 0"
      }} />
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: highlight ? "#00D4AA" : "#fff", lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function ActivityRow({ act, onClick }) {
  const running = isRun(act.sport_type);
  return (
    <div
      onClick={() => onClick(act)}
      style={{
        display: "grid",
        gridTemplateColumns: "36px 1fr 90px 80px 70px 110px 70px",
        alignItems: "center",
        padding: "12px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        cursor: "pointer",
        borderRadius: 8,
        transition: "background 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      <div style={{ fontSize: 18 }}>{sportIcon(act.sport_type)}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: running ? "#fff" : "rgba(255,255,255,0.6)" }}>{act.name}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{formatDate(act.start_date)}</div>
      </div>
      <div style={{ textAlign: "right", fontWeight: 700, color: sportColor(act.sport_type) }}>
        {km(act.distance)} <span style={{ fontWeight: 400, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>km</span>
      </div>
      <div style={{ textAlign: "right", color: "rgba(255,255,255,0.55)", fontSize: 13 }}>{hms(act.moving_time)}</div>
      <div style={{ textAlign: "right", color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
        {act.total_elevation_gain ? `↑${Math.round(act.total_elevation_gain)}m` : "–"}
      </div>
      <div style={{ textAlign: "right", color: running ? "#00D4AA" : "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: running ? 600 : 400 }}>
        {running ? pace(act.moving_time, act.distance) : "–"}
      </div>
      <div style={{ textAlign: "right", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
        {act.average_heartrate ? `♥ ${Math.round(act.average_heartrate)}` : "–"}
      </div>
    </div>
  );
}

// ── Polyline decoder (Google encoded polyline format) ──────────────────────
function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, b;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

// ── Leaflet map component ───────────────────────────────────────────────────
function ActivityMap({ polyline, activityId }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!polyline || !mapRef.current) return;

    // Load Leaflet CSS if not already loaded
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }

    const initMap = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const L = window.L;
      const points = decodePolyline(polyline);
      if (!points.length) return;

      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false });
      mapInstanceRef.current = map;

      // Dark tile layer
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Route polyline in teal
      const route = L.polyline(points, {
        color: "#00D4AA",
        weight: 3,
        opacity: 0.9,
      }).addTo(map);

      // Start marker (green dot)
      L.circleMarker(points[0], {
        radius: 6, fillColor: "#00D4AA", color: "#fff",
        weight: 2, fillOpacity: 1,
      }).addTo(map);

      // End marker (red dot)
      L.circleMarker(points[points.length - 1], {
        radius: 6, fillColor: "#FF3B6B", color: "#fff",
        weight: 2, fillOpacity: 1,
      }).addTo(map);

      map.fitBounds(route.getBounds(), { padding: [16, 16] });
    };

    if (window.L) {
      initMap();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      script.onload = initMap;
      document.head.appendChild(script);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [polyline]);

  if (!polyline) return (
    <div style={{ height: 200, borderRadius: 12, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
      No GPS data available
    </div>
  );

  return <div ref={mapRef} style={{ height: 240, borderRadius: 12, overflow: "hidden", marginBottom: 20 }} />;
}

// ── Map with optional segment highlight ────────────────────────────────────
// Finds the nearest points on the decoded route to the segment's
// start_latlng and end_latlng, then highlights that slice in orange.
function distSq(a, b) {
  const dlat = a[0] - b[0], dlng = a[1] - b[1];
  return dlat * dlat + dlng * dlng;
}
function nearestIdx(points, target) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = distSq(points[i], target);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function ActivityMapWithSegment({ polyline, activityId, height = 240, segment }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const segmentLayerRef = useRef(null);
  const routePointsRef = useRef([]);

  // Init map once
  useEffect(() => {
    if (!polyline || !mapRef.current) return;

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css"; link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }

    const initMap = () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      const L = window.L;
      const points = decodePolyline(polyline);
      if (!points.length) return;
      routePointsRef.current = points;

      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false });
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(map);

      const route = L.polyline(points, { color: "#00D4AA", weight: 3, opacity: 0.7 }).addTo(map);
      L.circleMarker(points[0], { radius: 6, fillColor: "#00D4AA", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(map);
      L.circleMarker(points[points.length - 1], { radius: 6, fillColor: "#FF3B6B", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(map);

      map.fitBounds(route.getBounds(), { padding: [16, 16] });
    };

    if (window.L) { initMap(); }
    else {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      script.onload = initMap;
      document.head.appendChild(script);
    }

    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [polyline]);

  // Update segment overlay whenever selected segment changes
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;

    if (segmentLayerRef.current) {
      mapInstanceRef.current.removeLayer(segmentLayerRef.current);
      segmentLayerRef.current = null;
    }

    if (!segment) return;

    const points = routePointsRef.current;
    if (!points.length) return;

    const startLL = segment.start_latlng;
    const endLL = segment.end_latlng;
    if (!startLL || !endLL) return;

    // Find closest points on route to segment start/end
    let startIdx = nearestIdx(points, startLL);
    let endIdx = nearestIdx(points, endLL);
    if (startIdx > endIdx) [startIdx, endIdx] = [endIdx, startIdx];

    // Need at least 2 points
    const segSlice = points.slice(startIdx, endIdx + 1);
    if (segSlice.length < 2) return;

    const segLayer = L.layerGroup();
    L.polyline(segSlice, { color: "#FF6B2B", weight: 6, opacity: 0.9 }).addTo(segLayer);
    L.circleMarker(segSlice[0], { radius: 7, fillColor: "#FF6B2B", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(segLayer);
    L.circleMarker(segSlice[segSlice.length - 1], { radius: 7, fillColor: "#FFD700", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(segLayer);

    segLayer.addTo(mapInstanceRef.current);
    segmentLayerRef.current = segLayer;

    try {
      const bounds = L.latLngBounds(segSlice);
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    } catch (e) {}
  }, [segment]);

  if (!polyline) return (
    <div style={{ height, borderRadius: 12, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
      No GPS data available
    </div>
  );

  return <div ref={mapRef} style={{ height, borderRadius: 12, overflow: "hidden" }} />;
}

// ── Backfill control component ───────────────────────────────────────────────
function BackfillControl({ segmentId, backfill, onStart, stravaSummit = false }) {
  if (stravaSummit) return null; // Summit users get history directly from Strava
  const isRunning = backfill && (backfill.status === "start" || backfill.status === "progress");
  const isDone = backfill?.status === "done";
  const isRateLimit = backfill?.status === "rate_limit";
  const isError = backfill?.status === "error";
  const pct = backfill?.total > 0 ? Math.round((backfill.checked / backfill.total) * 100) : 0;

  if (isDone && backfill.total === 0) return (
    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>All activities already fetched.</div>
  );

  return (
    <div style={{ marginTop: 4 }}>
      {!isRunning && !isDone && !isRateLimit && !isError && (
        <div>
          <button
            onClick={() => onStart(segmentId)}
            style={{ background: "rgba(0,212,170,0.1)", border: "1px solid rgba(0,212,170,0.3)", borderRadius: 8, padding: "6px 14px", color: "#00D4AA", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            🔍 Find previous efforts
          </button>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 5, lineHeight: 1.5 }}>
            Scans un-fetched activities for this segment. Strava's free API allows ~10 requests/min,
            so this may take a while if you have a large backlog — you can leave it running in the background.
          </div>
        </div>
      )}
      {isRunning && (
        <div style={{ minWidth: 220 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 5 }}>
            Checking activities… {backfill.checked}/{backfill.total} — {backfill.found} found
            <span style={{ color: "rgba(255,255,255,0.25)", marginLeft: 8 }}>
              (~{Math.ceil((backfill.total - backfill.checked) * 6 / 60)}min remaining)
            </span>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "#00D4AA", borderRadius: 4, transition: "width 0.4s ease" }} />
          </div>
        </div>
      )}
      {isDone && (
        <div style={{ fontSize: 12, color: backfill.found > 0 ? "#00D4AA" : "rgba(255,255,255,0.3)" }}>
          {backfill.found > 0
            ? `✓ Found ${backfill.found} effort${backfill.found > 1 ? "s" : ""} across ${backfill.checked} activities`
            : `✓ Checked ${backfill.checked} activities — no additional efforts found`}
        </div>
      )}
      {isRateLimit && (
        <div style={{ fontSize: 12, color: "#FFB347" }}>
          ⏱ Strava rate limit reached after {backfill.checked}/{backfill.total} activities.
          <button onClick={() => onStart(segmentId)} style={{ marginLeft: 8, background: "none", border: "1px solid #FFB347", borderRadius: 6, padding: "2px 8px", color: "#FFB347", fontSize: 11, cursor: "pointer" }}>Retry</button>
        </div>
      )}
      {isError && (
        <div style={{ fontSize: 12, color: "#FF6B6B" }}>
          Something went wrong.
          <button onClick={() => onStart(segmentId)} style={{ marginLeft: 8, background: "none", border: "1px solid #FF6B6B", borderRadius: 6, padding: "2px 8px", color: "#FF6B6B", fontSize: 11, cursor: "pointer" }}>Retry</button>
        </div>
      )}
    </div>
  );
}

// ── Segments Panel (shared by modal and detail page) ─────────────────────────
function formatDelta(diffSec) {
  if (diffSec === 0) return "New ✨";
  const abs = Math.abs(diffSec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const sign = diffSec < 0 ? "-" : "+";
  return m > 0
    ? `${sign}${m}:${s.toString().padStart(2, "0")}`
    : `${sign}${s}s`;
}

function SegmentsPanel({ segments, loading, error, routePolyline, activityId, athleteId, stravaSummit = false, selectedSegment, onSelectSegment, mapHeight = 200, compact = false }) {
  const [segHistory, setSegHistory] = useState({});
  const [historyLoading, setHistoryLoading] = useState({});
  const [backfill, setBackfill] = useState(null);
  const backfillRef = useRef(null);
  const pad = compact ? "9px 10px" : "10px 12px";

  // Fetch history when a segment is selected — Summit uses Strava direct, free uses local cache
  useEffect(() => {
    if (!selectedSegment?.segment_id) return;
    const sid = selectedSegment.segment_id;
    if (segHistory[sid] !== undefined || historyLoading[sid]) return;
    setHistoryLoading(h => ({ ...h, [sid]: true }));
    const endpoint = stravaSummit
      ? `${API}/api/segments/${athleteId}/${sid}/strava_history`
      : `${API}/api/segments/${athleteId}/${sid}/history`;
    fetch(endpoint)
      .then(r => r.json())
      .then(d => setSegHistory(h => ({ ...h, [sid]: d.efforts || [] })))
      .catch(() => setSegHistory(h => ({ ...h, [sid]: [] })))
      .finally(() => setHistoryLoading(h => ({ ...h, [sid]: false })));
  }, [selectedSegment, athleteId, stravaSummit]);

  const startBackfill = (segmentId) => {
    if (backfillRef.current) backfillRef.current.close();
    setBackfill({ status: "start", checked: 0, total: 0, found: 0 });

    const es = new EventSource(`${API}/api/segments/${athleteId}/${segmentId}/backfill`);
    backfillRef.current = es;

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setBackfill(data);
      if (data.status === "done" || data.status === "rate_limit") {
        es.close();
        // Refresh history for this segment
        setHistoryLoading(h => ({ ...h, [segmentId]: true }));
        fetch(`${API}/api/segments/${athleteId}/${segmentId}/history`)
          .then(r => r.json())
          .then(d => setSegHistory(h => ({ ...h, [segmentId]: d.efforts || [] })))
          .catch(() => {})
          .finally(() => setHistoryLoading(h => ({ ...h, [segmentId]: false })));
      }
    };
    es.onerror = () => {
      setBackfill(b => ({ ...b, status: "error" }));
      es.close();
    };
  };

  // Cleanup SSE on unmount
  useEffect(() => () => { if (backfillRef.current) backfillRef.current.close(); }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Loading segments...</div>;
  if (error) return <div style={{ textAlign: "center", padding: 40, color: "#FF6B6B" }}>Could not load segments from Strava.</div>;

  const safeSegments = Array.isArray(segments) ? segments : [];
  if (!safeSegments.length) return <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>No segments recorded for this activity.</div>;

  return (
    <div>
      {/* Map */}
      {routePolyline && mapHeight && (
        <div style={{ marginBottom: 14 }}>
          <ActivityMapWithSegment polyline={routePolyline} activityId={activityId} height={mapHeight} segment={selectedSegment || null} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "center", marginTop: 6 }}>
            {selectedSegment
              ? <><span style={{ color: "#FF6B2B" }}>{selectedSegment.name}</span> — click again to clear</>
              : "Click a segment row to highlight it on the map"}
          </div>
        </div>
      )}

      {/* History panel for selected segment */}
      {selectedSegment?.segment_id && (
        <div style={{ background: "rgba(255,107,43,0.07)", border: "1px solid rgba(255,107,43,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#FF6B2B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            All efforts on "{selectedSegment.name}"
          </div>
          {historyLoading[selectedSegment.segment_id] && (
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading history...</div>
          )}
          {!historyLoading[selectedSegment.segment_id] && segHistory[selectedSegment.segment_id] && (
            (() => {
              const hist = segHistory[selectedSegment.segment_id];
              if (hist === "rate_limit") return (
                <div style={{ color: "#FFB347", fontSize: 13 }}>⏱ Strava rate limit reached — try again in a minute.</div>
              );
              const safeHist = Array.isArray(hist) ? hist : [];
              return safeHist.length > 0 ? (
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {safeHist.map((e, i) => {
                    const isBest = i === 0;
                    const bestTime = safeHist[0].elapsed_time;
                    const delta = e.elapsed_time - bestTime;
                    return (
                      <div key={i} style={{
                        background: isBest ? "rgba(255,215,0,0.1)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${isBest ? "rgba(255,215,0,0.3)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: 8, padding: "8px 12px", minWidth: 120,
                      }}>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 3 }}>
                          {new Date(e.date).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "2-digit" })}
                          {isBest && <span style={{ color: "#FFD700", marginLeft: 6 }}>🥇 Best</span>}
                        </div>
                        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: isBest ? "#FFD700" : "#fff" }}>
                          {hms(e.elapsed_time)}
                        </div>
                        {!isBest && (
                          <div style={{ fontSize: 11, color: "#FF6B6B", marginTop: 2 }}>{formatDelta(delta)} off best</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <BackfillControl segmentId={selectedSegment.segment_id} backfill={backfill} onStart={startBackfill} stravaSummit={stravaSummit} />
              </div>
              ) : (
                <div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginBottom: 10 }}>No history yet in cache.</div>
                  <BackfillControl segmentId={selectedSegment.segment_id} backfill={backfill} onStart={startBackfill} stravaSummit={stravaSummit} />
                  {!stravaSummit && (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", marginTop: 8 }}>
                      Strava Summit subscriber? Your subscription is detected at login —
                      <span
                        style={{ color: "rgba(0,212,170,0.5)", cursor: "pointer", marginLeft: 4, textDecoration: "underline" }}
                        onClick={() => window.location.href = `${API}/auth/login`}
                      >re-connect with Strava</span> to enable full history.
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Segments table */}
      <div style={{ overflowY: "auto", maxHeight: compact ? 240 : 320, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ position: "sticky", top: 0, background: "#161b22", zIndex: 1 }}>
            <tr style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <th style={{ textAlign: "left", padding: pad }}>Segment</th>
              <th style={{ textAlign: "right", padding: pad }}>Dist</th>
              <th style={{ textAlign: "right", padding: pad }}>Grade</th>
              <th style={{ textAlign: "right", padding: pad }}>Time</th>
              <th style={{ textAlign: "right", padding: pad }}>Rank</th>
              <th style={{ textAlign: "right", padding: pad }}>Δ vs PR</th>
            </tr>
          </thead>
          <tbody>
            {safeSegments.map((s, i) => {
              const isSelected = selectedSegment?.segment_id === s.segment_id && selectedSegment?.name === s.name;
              const history = s.segment_id ? (Array.isArray(segHistory[s.segment_id]) ? segHistory[s.segment_id] : (segHistory[s.segment_id] === "rate_limit" ? "rate_limit" : null)) : null;
              const isPR = s.pr_rank === 1;
              const safeHistory = Array.isArray(history) ? history : [];
              const prevBest = isPR ? safeHistory[1]?.elapsed_time : safeHistory[0]?.elapsed_time;
              const delta = prevBest && s.elapsed_time ? s.elapsed_time - prevBest : null;

              return (
                <tr key={i}
                  onClick={() => onSelectSegment(isSelected ? null : s)}
                  style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: isSelected ? "rgba(255,107,43,0.12)" : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)", cursor: "pointer", transition: "background 0.15s" }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSelected ? "rgba(255,107,43,0.12)" : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)"; }}
                >
                  <td style={{ padding: pad, fontWeight: 600, maxWidth: 180 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isSelected ? "#FF6B2B" : "#fff" }}>{s.name}</div>
                  </td>
                  <td style={{ padding: pad, textAlign: "right", color: "rgba(255,255,255,0.5)" }}>
                    {s.distance ? `${(s.distance / 1000).toFixed(2)}km` : "–"}
                  </td>
                  <td style={{ padding: pad, textAlign: "right", color: s.average_grade > 0 ? "#FFB347" : s.average_grade < 0 ? "#7AE8D0" : "rgba(255,255,255,0.3)" }}>
                    {s.average_grade != null ? `${s.average_grade > 0 ? "+" : ""}${s.average_grade.toFixed(1)}%` : "–"}
                  </td>
                  <td style={{ padding: pad, textAlign: "right", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700 }}>
                    {hms(s.elapsed_time)}
                  </td>
                  <td style={{ padding: pad, textAlign: "right" }}>
                    {isPR ? <span style={{ color: "#FFD700", fontWeight: 700 }}>🥇 PR</span>
                     : s.pr_rank === 2 ? <span style={{ color: "#C0C0C0" }}>🥈 2nd</span>
                     : s.pr_rank === 3 ? <span style={{ color: "#CD7F32" }}>🥉 3rd</span>
                     : s.pr_rank ? <span style={{ color: "rgba(255,255,255,0.4)" }}>#{s.pr_rank}</span>
                     : <span style={{ color: "rgba(255,255,255,0.2)" }}>–</span>}
                  </td>
                  <td style={{ padding: pad, textAlign: "right", fontSize: 12 }}>
                    {historyLoading[s.segment_id]
                      ? <span style={{ color: "rgba(255,255,255,0.2)" }}>...</span>
                      : history === null
                        ? <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>click row</span>
                      : history === "rate_limit"
                        ? <span style={{ color: "#FFB347", fontSize: 11 }}>⏱ retry</span>
                        : !s.pr_rank && history.length <= 1
                          ? <span style={{ color: "#7AE8D0", fontWeight: 600 }}>New ✨</span>
                          : delta !== null
                            ? <span style={{ color: delta < 0 ? "#00D4AA" : "#FF6B6B", fontWeight: 600 }}>{formatDelta(delta)}</span>
                            : <span style={{ color: "rgba(255,255,255,0.15)" }}>–</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActivityModal({ act, athleteId, stravaSummit, onClose, onOpenDetail }) {
  const [gpxLoading, setGpxLoading] = useState(false);
  const [tab, setTab] = useState("overview");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState(null);

  useEffect(() => {
    setTab("overview");
    setDetail(null);
    setSelectedSegment(null);
  }, [act?.id]);

  // Fetch detail immediately on open (silent background fetch)
  // so splits/segments are ready when tabs are clicked, and older
  // activities get cached even if the user only views the overview.
  useEffect(() => {
    if (!act) return;
    setDetailLoading(true);
    fetch(`${API}/api/activity/${athleteId}/${act.id}/detail`)
      .then(r => r.json())
      .then(d => setDetail(d))
      .catch(() => setDetail({ error: true }))
      .finally(() => setDetailLoading(false));
  }, [act?.id, athleteId]);

  if (!act) return null;
  const running = isRun(act.sport_type);

  const handleGpxDownload = async () => {
    setGpxLoading(true);
    try {
      const resp = await fetch(`${API}/api/activity/${athleteId}/${act.id}/gpx`);
      if (!resp.ok) throw new Error("Failed to fetch GPX");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${act.name?.replace(/[^a-z0-9]/gi, "_") || "activity"}_${act.id}.gpx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Could not download GPX: " + e.message);
    } finally {
      setGpxLoading(false);
    }
  };

  // Pace colour: green = fast, red = slow relative to average
  const avgPaceSec = act.moving_time && act.distance ? act.moving_time / (act.distance / 1000) : null;
  const splitPaceColor = (movingTime, distanceM) => {
    if (!avgPaceSec || !movingTime || !distanceM) return "rgba(255,255,255,0.7)";
    const splitPace = movingTime / (distanceM / 1000);
    const diff = splitPace - avgPaceSec;
    if (diff < -15) return "#00D4AA";
    if (diff < 0) return "#7AE8D0";
    if (diff < 15) return "#FFB347";
    return "#FF6B6B";
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "splits",   label: "Splits" },
    { id: "efforts",  label: "Best Efforts" },
    { id: "segments", label: "Segments" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(8px)", overflowY: "auto", padding: "20px 0",
    }} onClick={onClose}>
      <div style={{
        background: "#161b22", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 24, padding: 32, maxWidth: 660, width: "90%", position: "relative",
      }} onClick={e => e.stopPropagation()}>

        {/* Close */}
        <button onClick={onClose} style={{
          position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.08)",
          border: "none", color: "#fff", borderRadius: 8, width: 32, height: 32,
          cursor: "pointer", fontSize: 16, zIndex: 10,
        }}>×</button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 28 }}>{sportIcon(act.sport_type)}</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>{act.name}</h2>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>
              {formatDate(act.start_date)} · {act.sport_type}
              {act.commute && " · 🚦 Commute"}
              {act.trainer && " · 🏠 Indoor"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {act.map_summary_polyline && (
              <button onClick={handleGpxDownload} disabled={gpxLoading} style={{
                padding: "8px 14px", borderRadius: 10,
                background: gpxLoading ? "rgba(255,255,255,0.05)" : "rgba(0,212,170,0.15)",
                border: "1px solid rgba(0,212,170,0.3)", color: "#00D4AA",
                cursor: gpxLoading ? "default" : "pointer", fontSize: 13, fontWeight: 600,
              }}>{gpxLoading ? "⟳" : "⬇ GPX"}</button>
            )}
            <button onClick={() => { onClose(); onOpenDetail(act); }} style={{
              padding: "8px 14px", borderRadius: 10,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}>Full Page ↗</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "8px 18px", borderRadius: "8px 8px 0 0", border: "none",
              background: tab === t.id ? "rgba(0,212,170,0.12)" : "transparent",
              borderBottom: tab === t.id ? "2px solid #00D4AA" : "2px solid transparent",
              color: tab === t.id ? "#00D4AA" : "rgba(255,255,255,0.4)",
              cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {tab === "overview" && (
          <>
            {act.map_summary_polyline && (
              <ActivityMapWithSegment polyline={act.map_summary_polyline} activityId={act.id} height={240} segment={null} />
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                ["Distance", `${km(act.distance)} km`],
                ["Moving Time", hms(act.moving_time)],
                ["Elevation", act.total_elevation_gain ? `${Math.round(act.total_elevation_gain)} m` : "–"],
                running ? ["Avg Pace", pace(act.moving_time, act.distance)] : ["Avg Speed", `${((act.average_speed||0)*3.6).toFixed(1)} km/h`],
                ["Avg HR", act.average_heartrate ? `${Math.round(act.average_heartrate)} bpm` : "–"],
                ["Max HR", act.max_heartrate ? `${Math.round(act.max_heartrate)} bpm` : "–"],
                ["Avg Power", act.average_watts ? `${Math.round(act.average_watts)} W` : "–"],
                ["Energy", act.kilojoules ? `${Math.round(act.kilojoules)} kJ` : "–"],
                ["Suffer Score", act.suffer_score ? Math.round(act.suffer_score) : "–"],
                ["PRs 🏅", act.pr_count || 0],
                ["Kudos 👍", act.kudos_count || 0],
                ["Achievements 🏆", act.achievement_count || 0],
              ].map(([label, val]) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{val}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── SPLITS TAB ── */}
        {tab === "splits" && (
          <div>
            {detailLoading && <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Loading splits...</div>}
            {detail?.error && <div style={{ textAlign: "center", padding: 40, color: "#FF6B6B" }}>Could not load splits from Strava.</div>}
            {detail && !detail.error && (
              <>
                {detail.description && (
                  <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "14px 16px", marginBottom: 16, color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 1.6, fontStyle: "italic" }}>
                    "{detail.description}"
                  </div>
                )}
                {detail.splits_metric?.length > 0 ? (
                  <>
                    {(() => {
                      const hs = calcHalfSplit(detail.splits_metric);
                      if (!hs) return null;
                      const isNeg = hs.diffSec < 0;
                      const isEven = Math.abs(hs.diffSec) <= 3;
                      const label = isEven ? "Even split 👌" : isNeg ? "Negative split 🔥" : "Positive split 😬";
                      const color = isEven ? "#00D4AA" : isNeg ? "#00D4AA" : "#FFB347";
                      const diffStr = isEven ? "±0s" : `${isNeg ? "" : "+"}${hs.diffSec}s /km`;
                      return (
                        <div style={{ display: "flex", gap: 10, marginBottom: 14, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "12px 16px", alignItems: "center", border: `1px solid ${color}33` }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>First Half</div>
                            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700 }}>{formatPaceSeconds(hs.firstPace)}<span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "Inter" }}> /km</span></div>
                          </div>
                          <div style={{ textAlign: "center", padding: "0 12px" }}>
                            <div style={{ fontSize: 18, marginBottom: 2 }}>{isEven ? "=" : isNeg ? "↗" : "↘"}</div>
                            <div style={{ fontSize: 11, color, fontWeight: 700 }}>{diffStr}</div>
                          </div>
                          <div style={{ flex: 1, textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Second Half</div>
                            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700 }}>{formatPaceSeconds(hs.secondPace)}<span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "Inter" }}> /km</span></div>
                          </div>
                          <div style={{ marginLeft: 12, padding: "6px 12px", borderRadius: 8, background: `${color}22`, color, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</div>
                        </div>
                      );
                    })()}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        <th style={{ textAlign: "left", padding: "8px 12px" }}>KM</th>
                        <th style={{ textAlign: "right", padding: "8px 12px" }}>Pace</th>
                        <th style={{ textAlign: "right", padding: "8px 12px" }}>Time</th>
                        <th style={{ textAlign: "right", padding: "8px 12px" }}>Elev</th>
                        <th style={{ textAlign: "right", padding: "8px 12px" }}>HR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.splits_metric.map((s, i) => {
                        const paceColor = splitPaceColor(s.moving_time, s.distance);
                        const paceStr = s.moving_time && s.distance ? formatPaceSeconds(s.moving_time / (s.distance / 1000)) : "–";
                        const isLast = i === detail.splits_metric.length - 1;
                        const distLabel = isLast && s.distance < 950 ? `${(s.distance).toFixed(0)}m` : `${s.split}`;
                        return (
                          <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                            <td style={{ padding: "10px 12px", fontWeight: 600 }}>{distLabel}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: paceColor, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16 }}>{paceStr}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: "rgba(255,255,255,0.5)" }}>{hms(s.moving_time)}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: s.elevation_difference > 0 ? "#FFB347" : s.elevation_difference < 0 ? "#7AE8D0" : "rgba(255,255,255,0.3)" }}>
                              {s.elevation_difference != null ? `${s.elevation_difference > 0 ? "+" : ""}${Math.round(s.elevation_difference)}m` : "–"}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: "rgba(255,255,255,0.5)" }}>
                              {s.average_heartrate ? `${Math.round(s.average_heartrate)}` : "–"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>No splits data available for this activity.</div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── BEST EFFORTS TAB ── */}
        {tab === "efforts" && (
          <div>
            {detailLoading && <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Loading best efforts...</div>}
            {detail?.error && <div style={{ textAlign: "center", padding: 40, color: "#FF6B6B" }}>Could not load best efforts from Strava.</div>}
            {detail && !detail.error && (
              <>
                {detail.description && (
                  <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "14px 16px", marginBottom: 16, color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 1.6, fontStyle: "italic" }}>
                    "{detail.description}"
                  </div>
                )}
                {detail.best_efforts?.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        <th style={{ textAlign: "left", padding: "8px 12px" }}>Distance</th>
                        <th style={{ textAlign: "right", padding: "8px 12px" }}>Time</th>
                        <th style={{ textAlign: "right", padding: "8px 12px" }}>Pace</th>
                        <th style={{ textAlign: "right", padding: "8px 12px" }}>Rank</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.best_efforts.map((b, i) => (
                        <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                          <td style={{ padding: "10px 12px", fontWeight: 600 }}>{b.name}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700 }}>{hms(b.elapsed_time)}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: "rgba(255,255,255,0.5)" }}>
                            {b.elapsed_time && b.distance ? formatPaceSeconds(b.elapsed_time / (b.distance / 1000)) : "–"}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right" }}>
                            {b.pr_rank === 1 ? <span style={{ color: "#FFD700", fontWeight: 700 }}>🥇 PR</span>
                             : b.pr_rank === 2 ? <span style={{ color: "#C0C0C0" }}>🥈 2nd</span>
                             : b.pr_rank === 3 ? <span style={{ color: "#CD7F32" }}>🥉 3rd</span>
                             : b.pr_rank ? <span style={{ color: "rgba(255,255,255,0.4)" }}>#{b.pr_rank}</span>
                             : <span style={{ color: "rgba(255,255,255,0.2)" }}>–</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>No best efforts recorded for this activity.</div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── SEGMENTS TAB ── */}
        {tab === "segments" && (
          <SegmentsPanel
            segments={detail?.segment_efforts}
            loading={detailLoading}
            error={detail?.error}
            routePolyline={act.map_summary_polyline}
            activityId={act.id}
            athleteId={athleteId}
            stravaSummit={stravaSummit}
            selectedSegment={selectedSegment}
            onSelectSegment={setSelectedSegment}
            mapHeight={200}
          />
        )}
      </div>
    </div>
  );
}

// ── Full Activity Detail Page ─────────────────────────────────────────────────
function ActivityDetailPage({ act, athleteId, stravaSummit, onBack }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("splits");
  const [selectedSegment, setSelectedSegment] = useState(null);

  useEffect(() => {
    if (!act) return;
    setLoading(true);
    fetch(`${API}/api/activity/${athleteId}/${act.id}/detail`)
      .then(r => r.json())
      .then(d => setDetail(d))
      .catch(() => setDetail({ error: true }))
      .finally(() => setLoading(false));
  }, [act, athleteId]);

  if (!act) return null;
  const running = isRun(act.sport_type);

  const avgPaceSec = act.moving_time && act.distance ? act.moving_time / (act.distance / 1000) : null;
  const splitPaceColor = (movingTime, distanceM) => {
    if (!avgPaceSec || !movingTime || !distanceM) return "rgba(255,255,255,0.7)";
    const splitPace = movingTime / (distanceM / 1000);
    const diff = splitPace - avgPaceSec;
    if (diff < -15) return "#00D4AA";
    if (diff < 0) return "#7AE8D0";
    if (diff < 15) return "#FFB347";
    return "#FF6B6B";
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#fff", fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Inter:wght@400;500;600&display=swap');`}</style>

      {/* Top bar */}
      <div style={{ background: "#0a0e14", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "16px 32px", display: "flex", alignItems: "center", gap: 16, position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", padding: "8px 16px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{sportIcon(act.sport_type)} {act.name}</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 2 }}>{formatDate(act.start_date)} · {act.sport_type}</div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px" }}>
        {/* Description */}
        {detail?.description && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "20px 24px", marginBottom: 28, color: "rgba(255,255,255,0.6)", fontSize: 15, lineHeight: 1.7, fontStyle: "italic" }}>
            "{detail.description}"
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            ["Distance", `${km(act.distance)} km`],
            ["Time", hms(act.moving_time)],
            ["Elevation", `${Math.round(act.total_elevation_gain || 0)}m`],
            running ? ["Avg Pace", pace(act.moving_time, act.distance)] : ["Speed", `${((act.average_speed||0)*3.6).toFixed(1)}`],
            ["Avg HR", act.average_heartrate ? `${Math.round(act.average_heartrate)} bpm` : "–"],
            ["Kudos", act.kudos_count || 0],
          ].map(([label, val]) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Two column: map + tabs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

          {/* Map */}
          <div>
            {act.map_summary_polyline
              ? <ActivityMapWithSegment polyline={act.map_summary_polyline} activityId={act.id} height={400} segment={selectedSegment || null} />
              : <div style={{ height: 400, background: "rgba(255,255,255,0.03)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)" }}>No GPS data</div>
            }
            {selectedSegment && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#FF6B2B", textAlign: "center" }}>
                📍 {selectedSegment.name}
              </div>
            )}
            {!selectedSegment && act.map_summary_polyline && detail?.segment_efforts?.length > 0 && tab === "segments" && (
              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "center" }}>Click a segment to highlight it</div>
            )}
          </div>

          {/* Splits / Best Efforts */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20, overflow: "hidden" }}>
            {/* Tab bar */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 0 }}>
              {[{ id: "splits", label: "Km Splits" }, { id: "efforts", label: "Best Efforts" }, { id: "segments", label: "Segments" }].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  padding: "7px 16px", borderRadius: "6px 6px 0 0", border: "none",
                  background: tab === t.id ? "rgba(0,212,170,0.12)" : "transparent",
                  borderBottom: tab === t.id ? "2px solid #00D4AA" : "2px solid transparent",
                  color: tab === t.id ? "#00D4AA" : "rgba(255,255,255,0.4)",
                  cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
                }}>{t.label}</button>
              ))}
            </div>

            {loading && <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Loading...</div>}

            {!loading && detail?.error && <div style={{ textAlign: "center", padding: 40, color: "#FF6B6B" }}>Could not load from Strava.</div>}

            {!loading && detail && !detail.error && tab === "splits" && (
              <div style={{ overflowY: "auto", maxHeight: 340 }}>
                {detail.splits_metric?.length > 0 ? (
                  <>
                    {(() => {
                      const hs = calcHalfSplit(detail.splits_metric);
                      if (!hs) return null;
                      const isNeg = hs.diffSec < 0;
                      const isEven = Math.abs(hs.diffSec) <= 3;
                      const label = isEven ? "Even split 👌" : isNeg ? "Negative split 🔥" : "Positive split 😬";
                      const color = isEven ? "#00D4AA" : isNeg ? "#00D4AA" : "#FFB347";
                      const diffStr = isEven ? "±0s" : `${isNeg ? "" : "+"}${hs.diffSec}s /km`;
                      return (
                        <div style={{ display: "flex", gap: 10, marginBottom: 14, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "12px 16px", alignItems: "center", border: `1px solid ${color}33` }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>First Half</div>
                            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700 }}>{formatPaceSeconds(hs.firstPace)}<span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "Inter" }}> /km</span></div>
                          </div>
                          <div style={{ textAlign: "center", padding: "0 12px" }}>
                            <div style={{ fontSize: 18, marginBottom: 2 }}>{isEven ? "=" : isNeg ? "↗" : "↘"}</div>
                            <div style={{ fontSize: 11, color, fontWeight: 700 }}>{diffStr}</div>
                          </div>
                          <div style={{ flex: 1, textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Second Half</div>
                            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700 }}>{formatPaceSeconds(hs.secondPace)}<span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "Inter" }}> /km</span></div>
                          </div>
                          <div style={{ marginLeft: 12, padding: "6px 12px", borderRadius: 8, background: `${color}22`, color, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</div>
                        </div>
                      );
                    })()}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead style={{ position: "sticky", top: 0, background: "#161b22" }}>
                      <tr style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        <th style={{ textAlign: "left", padding: "8px 10px" }}>KM</th>
                        <th style={{ textAlign: "right", padding: "8px 10px" }}>Pace</th>
                        <th style={{ textAlign: "right", padding: "8px 10px" }}>Elev</th>
                        <th style={{ textAlign: "right", padding: "8px 10px" }}>HR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.splits_metric.map((s, i) => {
                        const paceColor = splitPaceColor(s.moving_time, s.distance);
                        const paceStr = s.moving_time && s.distance ? formatPaceSeconds(s.moving_time / (s.distance / 1000)) : "–";
                        const isLast = i === detail.splits_metric.length - 1;
                        const distLabel = isLast && s.distance < 950 ? `${(s.distance).toFixed(0)}m` : `${s.split}`;
                        return (
                          <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                            <td style={{ padding: "9px 10px", fontWeight: 600 }}>{distLabel}</td>
                            <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, color: paceColor, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16 }}>{paceStr}</td>
                            <td style={{ padding: "9px 10px", textAlign: "right", color: s.elevation_difference > 0 ? "#FFB347" : "#7AE8D0" }}>
                              {s.elevation_difference != null ? `${s.elevation_difference > 0 ? "+" : ""}${Math.round(s.elevation_difference)}m` : "–"}
                            </td>
                            <td style={{ padding: "9px 10px", textAlign: "right", color: "rgba(255,255,255,0.5)" }}>
                              {s.average_heartrate ? `${Math.round(s.average_heartrate)}` : "–"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </> ) : <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>No splits available.</div>}
              </div>
            )}

            {!loading && detail && !detail.error && tab === "efforts" && (
              <div style={{ overflowY: "auto", maxHeight: 340 }}>
                {detail.best_efforts?.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead style={{ position: "sticky", top: 0, background: "#161b22" }}>
                      <tr style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        <th style={{ textAlign: "left", padding: "8px 10px" }}>Distance</th>
                        <th style={{ textAlign: "right", padding: "8px 10px" }}>Time</th>
                        <th style={{ textAlign: "right", padding: "8px 10px" }}>Rank</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.best_efforts.map((b, i) => (
                        <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                          <td style={{ padding: "9px 10px", fontWeight: 600 }}>{b.name}</td>
                          <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700 }}>{hms(b.elapsed_time)}</td>
                          <td style={{ padding: "9px 10px", textAlign: "right" }}>
                            {b.pr_rank === 1 ? <span style={{ color: "#FFD700" }}>🥇 PR</span>
                             : b.pr_rank === 2 ? <span style={{ color: "#C0C0C0" }}>🥈</span>
                             : b.pr_rank === 3 ? <span style={{ color: "#CD7F32" }}>🥉</span>
                             : b.pr_rank ? <span style={{ color: "rgba(255,255,255,0.4)" }}>#{b.pr_rank}</span>
                             : "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>No best efforts recorded.</div>}
              </div>
            )}

            {!loading && detail && !detail.error && tab === "segments" && (
              <SegmentsPanel
                segments={detail?.segment_efforts}
                loading={false}
                error={detail?.error}
                routePolyline={act.map_summary_polyline}
                activityId={act.id}
                athleteId={athleteId}
                stravaSummit={stravaSummit}
                selectedSegment={selectedSegment}
                onSelectSegment={setSelectedSegment}
                mapHeight={null}
                compact={true}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WeeklyChart({ activities }) {
  // Build weekly km totals for runs, last 52 weeks
  const weeks = {};
  const now = new Date();
  for (let i = 51; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const key = d.toISOString().slice(0, 10);
    weeks[key] = { week: key, km: 0, runs: 0 };
  }
  const weekKeys = Object.keys(weeks).sort();

  activities.filter(a => isRun(a.sport_type)).forEach(a => {
    if (!a.start_date) return;
    const d = new Date(a.start_date);
    // Find which week bucket this belongs to
    for (let i = weekKeys.length - 1; i >= 0; i--) {
      if (d >= new Date(weekKeys[i])) {
        weeks[weekKeys[i]].km += (a.distance || 0) / 1000;
        weeks[weekKeys[i]].runs += 1;
        break;
      }
    }
  });

  const data = weekKeys.map(k => ({
    week: k.slice(5),
    km: parseFloat(weeks[k].km.toFixed(1)),
    runs: weeks[k].runs,
  }));

  const maxKm = Math.max(...data.map(d => d.km));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Weekly Running Volume — Last 52 Weeks
        </h3>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Peak: {maxKm.toFixed(0)} km</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="week" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9 }} interval={7} />
          <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
            formatter={(v, n) => [n === "km" ? `${v} km` : v, n === "km" ? "Distance" : "Runs"]}
          />
          <Bar dataKey="km" name="km" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <rect key={i} fill={entry.km > maxKm * 0.8 ? "#00D4AA" : entry.km > maxKm * 0.5 ? "#00D4AA99" : "#00D4AA44"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PBTable({ activities }) {
  const runs = activities.filter(a => isRun(a.sport_type) && a.distance && a.moving_time);

  const pbs = RACE_DISTANCES.map(({ label, minKm, maxKm, targetKm }) => {
    const matching = runs.filter(a => {
      const d = a.distance / 1000;
      return d >= minKm && d <= maxKm;
    });
    if (!matching.length) return { label, count: 0, best: null, bestDate: null, bestId: null };

    const best = matching.reduce((prev, curr) => {
      const prevP = paceVal(prev.moving_time, prev.distance);
      const currP = paceVal(curr.moving_time, curr.distance);
      return currP < prevP ? curr : prev;
    });

    return {
      label,
      count: matching.length,
      best,
      bestPace: paceVal(best.moving_time, best.distance),
      bestTime: hms(best.moving_time),
      bestDate: formatDate(best.start_date),
      bestName: best.name,
    };
  });

  return (
    <div>
      <h3 style={{ margin: "0 0 20px", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Personal Bests by Distance
      </h3>
      <div style={{ display: "grid", gap: 10 }}>
        {pbs.map(pb => (
          <div key={pb.label} style={{
            display: "grid", gridTemplateColumns: "90px 70px 1fr 100px 120px",
            alignItems: "center", padding: "14px 20px",
            background: "rgba(255,255,255,0.03)", borderRadius: 12,
            border: pb.best ? "1px solid rgba(0,212,170,0.15)" : "1px solid rgba(255,255,255,0.05)",
          }}>
            <div style={{ fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, color: "#00D4AA" }}>{pb.label}</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{pb.count} {pb.count === 1 ? "run" : "runs"}</div>
            {pb.best ? <>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{pb.bestName}</div>
              <div style={{ textAlign: "right", color: "#00D4AA", fontWeight: 700, fontSize: 15 }}>{pb.bestTime}</div>
              <div style={{ textAlign: "right", color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{pb.bestDate}</div>
            </> : <>
              <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 13 }}>No activities at this distance</div>
              <div /><div />
            </>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RaceHistory({ activities, onSelectActivity }) {
  const [preset, setPreset] = useState(null);
  const [minKm, setMinKm] = useState("");
  const [maxKm, setMaxKm] = useState("");

  const runs = activities.filter(a => isRun(a.sport_type) && a.distance);

  const filtered = runs.filter(a => {
    const d = a.distance / 1000;
    if (preset) return d >= preset.min && d <= preset.max;
    const lo = parseFloat(minKm) || 0;
    const hi = parseFloat(maxKm) || 99999;
    return d >= lo && d <= hi;
  }).sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

  // Count summary
  const counts = RACE_DISTANCES.map(({ label, minKm: lo, maxKm: hi }) => ({
    label,
    count: runs.filter(a => { const d = a.distance / 1000; return d >= lo && d <= hi; }).length,
  }));

  const bestPaceInFiltered = filtered.length
    ? Math.min(...filtered.map(a => paceVal(a.moving_time, a.distance)).filter(Boolean))
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800, margin: 0 }}>
          Race History
        </h2>
      </div>

      {/* Count summary pills */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {counts.map(({ label, count }) => (
          <div key={label} style={{
            padding: "10px 20px", borderRadius: 50,
            background: count > 0 ? "rgba(0,212,170,0.1)" : "rgba(255,255,255,0.04)",
            border: count > 0 ? "1px solid rgba(0,212,170,0.3)" : "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, color: count > 0 ? "#00D4AA" : "rgba(255,255,255,0.2)" }}>
              {count}
            </span>
            <span style={{ fontSize: 13, color: count > 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)" }}>
              {label}{count !== 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>

      {/* Preset buttons */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>Filter:</span>
        <button
          onClick={() => { setPreset(null); setMinKm(""); setMaxKm(""); }}
          style={{
            padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: !preset && !minKm && !maxKm ? "rgba(0,212,170,0.2)" : "rgba(255,255,255,0.06)",
            border: !preset && !minKm && !maxKm ? "1px solid rgba(0,212,170,0.4)" : "1px solid rgba(255,255,255,0.1)",
            color: !preset && !minKm && !maxKm ? "#00D4AA" : "rgba(255,255,255,0.6)",
          }}
        >All Runs</button>
        {DISTANCE_PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => { setPreset(preset?.label === p.label ? null : p); setMinKm(""); setMaxKm(""); }}
            style={{
              padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: preset?.label === p.label ? "rgba(0,212,170,0.2)" : "rgba(255,255,255,0.06)",
              border: preset?.label === p.label ? "1px solid rgba(0,212,170,0.4)" : "1px solid rgba(255,255,255,0.1)",
              color: preset?.label === p.label ? "#00D4AA" : "rgba(255,255,255,0.6)",
            }}
          >{p.label}</button>
        ))}
        {/* Custom range */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 8 }}>
          <input
            type="number" placeholder="Min km" value={minKm}
            onChange={e => { setMinKm(e.target.value); setPreset(null); }}
            style={{ width: 80, padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 13 }}
          />
          <span style={{ color: "rgba(255,255,255,0.3)" }}>–</span>
          <input
            type="number" placeholder="Max km" value={maxKm}
            onChange={e => { setMaxKm(e.target.value); setPreset(null); }}
            style={{ width: 80, padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 13 }}
          />
        </div>
      </div>

      {/* Results header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{filtered.length} activities</span>
        {bestPaceInFiltered && (
          <span style={{ color: "#00D4AA", fontSize: 13, fontWeight: 600 }}>
            Best pace: {formatPaceSeconds(bestPaceInFiltered)} /km
          </span>
        )}
      </div>

      {/* Activity list */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 90px 80px 110px 70px",
          padding: "10px 20px", fontSize: 11, color: "rgba(255,255,255,0.25)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}>
          <span>Activity</span><span style={{ textAlign: "right" }}>Distance</span>
          <span style={{ textAlign: "right" }}>Time</span>
          <span style={{ textAlign: "right" }}>Pace</span>
          <span style={{ textAlign: "right" }}>HR</span>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.25)" }}>No activities match this filter</div>
        )}
        {filtered.map(a => {
          const isBest = bestPaceInFiltered && paceVal(a.moving_time, a.distance) === bestPaceInFiltered;
          return (
            <div
              key={a.id}
              onClick={() => onSelectActivity(a)}
              style={{
                display: "grid", gridTemplateColumns: "1fr 90px 80px 110px 70px",
                alignItems: "center", padding: "13px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                cursor: "pointer", transition: "background 0.15s",
                background: isBest ? "rgba(0,212,170,0.05)" : "transparent",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              onMouseLeave={e => e.currentTarget.style.background = isBest ? "rgba(0,212,170,0.05)" : "transparent"}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                  {a.name}
                  {isBest && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(0,212,170,0.2)", color: "#00D4AA", fontWeight: 700, letterSpacing: "0.05em" }}>BEST</span>}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{formatDate(a.start_date)}</div>
              </div>
              <div style={{ textAlign: "right", fontWeight: 700, color: "#00D4AA" }}>{km(a.distance)} km</div>
              <div style={{ textAlign: "right", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{hms(a.moving_time)}</div>
              <div style={{ textAlign: "right", color: "#00D4AA", fontSize: 13, fontWeight: 600 }}>{pace(a.moving_time, a.distance)}</div>
              <div style={{ textAlign: "right", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                {a.average_heartrate ? `♥ ${Math.round(a.average_heartrate)}` : "–"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FitnessChart({ data }) {
  const recent = data.slice(-180);
  return (
    <div>
      <h3 style={{ margin: "0 0 20px", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Fitness · Fatigue · Form — Last 6 Months
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={recent}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
            tickFormatter={d => d ? d.slice(5) : ""} interval={21} />
          <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
          <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} labelStyle={{ color: "rgba(255,255,255,0.5)" }} />
          <Legend />
          <Line type="monotone" dataKey="ctl" name="Fitness (CTL)" stroke="#00D4AA" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="atl" name="Fatigue (ATL)" stroke="#FF3B6B" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="tsb" name="Form (TSB)" stroke="#FFB347" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SportBreakdown({ by_sport }) {
  const entries = Object.entries(by_sport || {}).sort((a, b) => b[1].count - a[1].count);
  const total = entries.reduce((s, [, v]) => s + v.count, 0);
  return (
    <div>
      <h3 style={{ margin: "0 0 20px", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Sport Breakdown</h3>
      {entries.map(([sport, v]) => {
        const pct = ((v.count / total) * 100).toFixed(0);
        const running = isRun(sport);
        return (
          <div key={sport} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
              <span style={{ fontWeight: running ? 600 : 400, color: running ? "#fff" : "rgba(255,255,255,0.5)" }}>
                {sportIcon(sport)} {sport}
              </span>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>{v.count} · {km(v.distance)} km</span>
            </div>
            <div style={{ height: running ? 8 : 5, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
              <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: `linear-gradient(90deg, ${sportColor(sport)}, ${sportColor(sport)}88)` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ── Heatmap Calendar ─────────────────────────────────────────────────────────
function HeatmapCalendar({ activities, year }) {
  const targetYear = year || new Date().getFullYear();

  // Build a map of date -> { km, count, topSport }
  const dayMap = {};
  activities.forEach(a => {
    if (!a.start_date) return;
    const d = new Date(a.start_date);
    if (d.getFullYear() !== targetYear) return;
    const key = d.toISOString().slice(0, 10);
    if (!dayMap[key]) dayMap[key] = { km: 0, count: 0, sports: {} };
    dayMap[key].km += (a.distance || 0) / 1000;
    dayMap[key].count += 1;
    const sport = a.sport_type || "Other";
    dayMap[key].sports[sport] = (dayMap[key].sports[sport] || 0) + 1;
  });

  // Find max km for colour scaling
  const maxKm = Math.max(...Object.values(dayMap).map(d => d.km), 1);

  // Build grid: Jan 1 to Dec 31
  const start = new Date(targetYear, 0, 1);
  const end = new Date(targetYear, 11, 31);

  // Pad to start on Monday
  const startDow = (start.getDay() + 6) % 7; // 0=Mon
  const weeks = [];
  let week = new Array(startDow).fill(null);

  const cur = new Date(start);
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 10);
    week.push({ date: key, data: dayMap[key] || null });
    if (week.length === 7) { weeks.push(week); week = []; }
    cur.setDate(cur.getDate() + 1);
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const getColor = (data) => {
    if (!data || data.count === 0) return "rgba(255,255,255,0.05)";
    const intensity = Math.min(data.km / (maxKm * 0.8), 1);
    // Check dominant sport
    const topSport = Object.entries(data.sports).sort((a,b) => b[1]-a[1])[0]?.[0] || "";
    const base = isRun(topSport) ? [0, 212, 170] : [255, 107, 43]; // teal for run, orange for other
    return `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${0.15 + intensity * 0.85})`;
  };

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const days = ["M","T","W","T","F","S","S"];

  // Month label positions (which week index does each month start)
  const monthPositions = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    week.forEach(day => {
      if (day) {
        const m = new Date(day.date).getMonth();
        if (m !== lastMonth) { monthPositions.push({ month: m, week: wi }); lastMonth = m; }
      }
    });
  });

  const [tooltip, setTooltip] = useState(null);
  const totalDays = Object.keys(dayMap).length;
  const totalKm = Object.values(dayMap).reduce((s, d) => s + d.km, 0);
  const totalRuns = activities.filter(a => isRun(a.sport_type) && new Date(a.start_date||0).getFullYear() === targetYear).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Activity Calendar — {targetYear}
        </h3>
        <div style={{ display: "flex", gap: 20, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
          <span>🏃 {totalRuns} runs</span>
          <span>📅 {totalDays} active days</span>
          <span>📍 {totalKm.toFixed(0)} km</span>
        </div>
      </div>

      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <div style={{ position: "relative", minWidth: weeks.length * 14 + 28 }}>
          {/* Month labels */}
          <div style={{ display: "flex", marginLeft: 28, marginBottom: 4, position: "relative", height: 16 }}>
            {monthPositions.map(({ month, week }) => (
              <div key={month} style={{
                position: "absolute", left: week * 14,
                fontSize: 10, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap",
              }}>{months[month]}</div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 0 }}>
            {/* Day labels */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginRight: 4, paddingTop: 0 }}>
              {days.map((d, i) => (
                <div key={i} style={{ height: 11, fontSize: 9, color: "rgba(255,255,255,0.2)", lineHeight: "11px", width: 12 }}>
                  {i % 2 === 0 ? d : ""}
                </div>
              ))}
            </div>

            {/* Weeks */}
            <div style={{ display: "flex", gap: 2 }}>
              {weeks.map((week, wi) => (
                <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {week.map((day, di) => (
                    <div
                      key={di}
                      style={{
                        width: 11, height: 11, borderRadius: 2,
                        background: day ? getColor(day.data) : "transparent",
                        cursor: day?.data ? "pointer" : "default",
                        position: "relative",
                        transition: "transform 0.1s",
                      }}
                      onMouseEnter={e => {
                        if (day?.data) {
                          e.currentTarget.style.transform = "scale(1.4)";
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltip({ data: day.data, date: day.date, x: rect.left, y: rect.top });
                        }
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = "scale(1)";
                        setTooltip(null);
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
            <span>Less</span>
            {[0.1, 0.3, 0.5, 0.75, 1.0].map(i => (
              <div key={i} style={{ width: 11, height: 11, borderRadius: 2, background: `rgba(0,212,170,${0.1 + i * 0.85})` }} />
            ))}
            <span>More</span>
            <div style={{ width: 11, height: 11, borderRadius: 2, background: "rgba(255,107,43,0.7)", marginLeft: 8 }} />
            <span>Other sport</span>
          </div>
        </div>
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div style={{
          position: "fixed", zIndex: 9999, pointerEvents: "none",
          left: tooltip.x + 16, top: tooltip.y - 60,
          background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 10, padding: "10px 14px", fontSize: 12,
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{tooltip.date}</div>
          <div style={{ color: "#00D4AA" }}>{tooltip.data.count} {tooltip.data.count === 1 ? "activity" : "activities"}</div>
          <div style={{ color: "rgba(255,255,255,0.6)" }}>{tooltip.data.km.toFixed(1)} km</div>
        </div>
      )}
    </div>
  );
}


// ── Colours for overlaid routes ──────────────────────────────────────────────
const ROUTE_COLORS = [
  "#00D4AA", "#FF6B2B", "#3B82F6", "#F59E0B", "#EC4899",
  "#8B5CF6", "#10B981", "#EF4444", "#06B6D4", "#84CC16",
];

// ── Multi-route overlay map ───────────────────────────────────────────────────
function OverlayMap({ runs }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!runs?.length || !mapRef.current) return;

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }

    const initMap = () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      const L = window.L;
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false });
      mapInstanceRef.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(map);

      const allBounds = [];
      runs.forEach((run, i) => {
        if (!run.map_summary_polyline) return;
        const points = decodePolyline(run.map_summary_polyline);
        if (!points.length) return;
        const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
        const line = L.polyline(points, { color, weight: 2.5, opacity: 0.85 }).addTo(map);
        line.bindTooltip(`${run.name}<br/>${formatDate(run.start_date)}<br/>${km(run.distance)} km`, { sticky: true });
        allBounds.push(...points);
      });

      if (allBounds.length) {
        map.fitBounds(L.latLngBounds(allBounds), { padding: [20, 20] });
      }
    };

    if (window.L) initMap();
    else {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      script.onload = initMap;
      document.head.appendChild(script);
    }
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [runs]);

  if (!runs?.some(r => r.map_summary_polyline)) return (
    <div style={{ height: 300, borderRadius: 16, background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
      No GPS data available for selected runs
    </div>
  );
  return <div ref={mapRef} style={{ height: 380, borderRadius: 16, overflow: "hidden" }} />;
}

// ── Progression Page ──────────────────────────────────────────────────────────
function ProgressionPage({ activities, onSelectActivity }) {
  const [activePreset, setActivePreset] = useState("Half Marathon");
  const [customMin, setCustomMin] = useState("");
  const [customMax, setCustomMax] = useState("");
  const [selectedRuns, setSelectedRuns] = useState(new Set());
  const [showMap, setShowMap] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [timePreset, setTimePreset] = useState("All time");

  const TIME_PRESETS = [
    { label: "All time",    from: null,  to: null  },
    { label: "This year",   from: `${new Date().getFullYear()}-01-01`, to: null },
    { label: "Last year",   from: `${new Date().getFullYear()-1}-01-01`, to: `${new Date().getFullYear()-1}-12-31` },
    { label: "Last 6mo",    from: (() => { const d = new Date(); d.setMonth(d.getMonth()-6); return d.toISOString().slice(0,10); })(), to: null },
    { label: "Last 3mo",    from: (() => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().slice(0,10); })(), to: null },
    { label: "Last month",  from: (() => { const d = new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,10); })(), to: null },
    { label: "Custom",      from: null,  to: null  },
  ];

  const applyTimePreset = (label) => {
    setTimePreset(label);
    const p = TIME_PRESETS.find(t => t.label === label);
    if (label !== "Custom") {
      setDateFrom(p.from || "");
      setDateTo(p.to || "");
    }
  };

  const PRESETS = [
    { label: "5K",           minKm: 4.8,  maxKm: 5.3  },
    { label: "10K",          minKm: 9.8,  maxKm: 10.3 },
    { label: "Half Marathon",minKm: 20.9, maxKm: 21.5 },
    { label: "Marathon",     minKm: 41.8, maxKm: 42.6 },
    { label: "Custom",       minKm: null, maxKm: null  },
  ];

  const preset = PRESETS.find(p => p.label === activePreset);
  const minKm = activePreset === "Custom" ? parseFloat(customMin) || 0   : preset.minKm;
  const maxKm = activePreset === "Custom" ? parseFloat(customMax) || 9999 : preset.maxKm;

  const effectiveDateFrom = dateFrom || "";
  const effectiveDateTo = dateTo || "";

  const runs = activities
    .filter(a => isRun(a.sport_type) && a.distance && a.moving_time)
    .filter(a => { const d = a.distance / 1000; return d >= minKm && d <= maxKm; })
    .filter(a => {
      if (!a.start_date) return false;
      const dateStr = a.start_date.slice(0, 10);
      if (effectiveDateFrom && dateStr < effectiveDateFrom) return false;
      if (effectiveDateTo && dateStr > effectiveDateTo) return false;
      return true;
    })
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  // Scatter data: x = date (timestamp), y = pace (sec/km)
  const scatterData = runs.map((r, i) => ({
    x: new Date(r.start_date).getTime(),
    y: paceVal(r.moving_time, r.distance),
    id: r.id,
    name: r.name,
    date: formatDate(r.start_date),
    paceStr: formatPaceSeconds(paceVal(r.moving_time, r.distance)),
    distKm: km(r.distance),
    time: hms(r.moving_time),
    hr: r.average_heartrate ? Math.round(r.average_heartrate) : null,
    color: ROUTE_COLORS[i % ROUTE_COLORS.length],
    index: i,
  }));

  // Best, worst, trend
  const bestPace = scatterData.length ? Math.min(...scatterData.map(d => d.y)) : null;
  const worstPace = scatterData.length ? Math.max(...scatterData.map(d => d.y)) : null;
  const improvement = bestPace && worstPace ? ((worstPace - bestPace) / worstPace * 100).toFixed(1) : null;

  // Trend line (simple linear regression)
  let trendData = [];
  if (scatterData.length >= 2) {
    const n = scatterData.length;
    const xs = scatterData.map(d => d.index);
    const ys = scatterData.map(d => d.y);
    const xMean = xs.reduce((a,b) => a+b,0)/n;
    const yMean = ys.reduce((a,b) => a+b,0)/n;
    const slope = xs.reduce((s,x,i) => s + (x-xMean)*(ys[i]-yMean), 0) /
                  xs.reduce((s,x) => s + (x-xMean)**2, 0);
    const intercept = yMean - slope * xMean;
    trendData = [
      { index: 0, trend: intercept },
      { index: n-1, trend: slope*(n-1)+intercept },
    ];
  }

  const toggleRun = (id) => {
    setSelectedRuns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedRuns(new Set(runs.map(r => r.id)));
  const selectNone = () => setSelectedRuns(new Set());

  const mapRuns = runs.filter(r => selectedRuns.has(r.id));

  // Custom tooltip for scatter
  const ScatterTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: "12px 16px", fontSize: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, color: d.color }}>{d.name}</div>
        <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{d.date}</div>
        <div style={{ color: "#00D4AA", fontWeight: 700 }}>⚡ {d.paceStr} /km</div>
        <div style={{ color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{d.distKm} km · {d.time}</div>
        {d.hr && <div style={{ color: "rgba(255,255,255,0.5)", marginTop: 2 }}>♥ {d.hr} bpm</div>}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800 }}>Progression</h2>

      {/* Filters */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Distance */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", width: 60 }}>Distance</span>
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => setActivePreset(p.label)} style={{
              padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: activePreset === p.label ? "rgba(0,212,170,0.2)" : "rgba(255,255,255,0.06)",
              border: activePreset === p.label ? "1px solid rgba(0,212,170,0.4)" : "1px solid rgba(255,255,255,0.1)",
              color: activePreset === p.label ? "#00D4AA" : "rgba(255,255,255,0.6)",
            }}>{p.label}</button>
          ))}
          {activePreset === "Custom" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" placeholder="Min km" value={customMin} onChange={e => setCustomMin(e.target.value)}
                style={{ width: 80, padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 13 }} />
              <span style={{ color: "rgba(255,255,255,0.3)" }}>–</span>
              <input type="number" placeholder="Max km" value={customMax} onChange={e => setCustomMax(e.target.value)}
                style={{ width: 80, padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 13 }} />
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }} />

        {/* Time range */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", width: 60 }}>Period</span>
          {TIME_PRESETS.filter(t => t.label !== "Custom").map(t => (
            <button key={t.label} onClick={() => applyTimePreset(t.label)} style={{
              padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: timePreset === t.label ? "rgba(0,212,170,0.2)" : "rgba(255,255,255,0.06)",
              border: timePreset === t.label ? "1px solid rgba(0,212,170,0.4)" : "1px solid rgba(255,255,255,0.1)",
              color: timePreset === t.label ? "#00D4AA" : "rgba(255,255,255,0.6)",
            }}>{t.label}</button>
          ))}
          {/* Custom date pickers always visible */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 4 }}>
            <input
              type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setTimePreset("Custom"); }}
              style={{ padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: dateFrom ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 13, cursor: "pointer" }}
            />
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>→</span>
            <input
              type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setTimePreset("Custom"); }}
              style={{ padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: dateTo ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 13, cursor: "pointer" }}
            />
            {(dateFrom || dateTo) && timePreset !== "All time" && (
              <button onClick={() => applyTimePreset("All time")} style={{ padding: "7px 12px", borderRadius: 8, background: "rgba(255,107,43,0.1)", border: "1px solid rgba(255,107,43,0.3)", color: "#FF6B2B", cursor: "pointer", fontSize: 12 }}>Clear ×</button>
            )}
          </div>
        </div>

        {/* Run count */}
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", paddingTop: 4 }}>
          {runs.length} run{runs.length !== 1 ? "s" : ""} found
          {(effectiveDateFrom || effectiveDateTo) && (
            <span style={{ color: "rgba(0,212,170,0.6)", marginLeft: 8 }}>
              {effectiveDateFrom ? effectiveDateFrom.slice(0,7) : "start"} → {effectiveDateTo ? effectiveDateTo.slice(0,7) : "now"}
            </span>
          )}
        </div>
      </div>

      {runs.length === 0 && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 60, textAlign: "center", color: "rgba(255,255,255,0.25)" }}>
          No runs found at this distance
        </div>
      )}

      {runs.length > 0 && <>
        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
          <StatCard label="Total Runs" value={runs.length} accent="#00D4AA" />
          <StatCard label="Best Pace" value={bestPace ? formatPaceSeconds(bestPace) : "–"} accent="#00D4AA" sub="/km" highlight />
          <StatCard label="First Pace" value={scatterData.length ? scatterData[0].paceStr : "–"} accent="#8B5CF6" sub="/km" />
          <StatCard label="Latest Pace" value={scatterData.length ? scatterData[scatterData.length-1].paceStr : "–"} accent="#3B82F6" sub="/km" />
          {improvement && <StatCard label="Improvement" value={`${improvement}%`} accent="#F59E0B" sub="first → best" />}
        </div>

        {/* Scatter plot */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 28 }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Pace Over Time — lower is faster
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="x" type="number" domain={["auto","auto"]} name="Date"
                tickFormatter={v => new Date(v).getFullYear()}
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
              />
              <YAxis
                dataKey="y" type="number" domain={["auto","auto"]} name="Pace"
                tickFormatter={v => formatPaceSeconds(v)}
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
                reversed
              />
              <ZAxis range={[60, 60]} />
              <Tooltip content={<ScatterTooltip />} />
              <Scatter
                data={scatterData}
                shape={(props) => {
                  const { cx, cy, payload } = props;
                  const isBest = payload.y === bestPace;
                  return (
                    <circle
                      cx={cx} cy={cy}
                      r={isBest ? 8 : 6}
                      fill={payload.color}
                      fillOpacity={0.85}
                      stroke={isBest ? "#fff" : "transparent"}
                      strokeWidth={2}
                      style={{ cursor: "pointer" }}
                      onClick={() => onSelectActivity(runs[payload.index])}
                    />
                  );
                }}
              />
              {/* Trend line */}
              {trendData.length > 0 && (
                <Line
                  data={trendData.map((d,i) => ({ x: scatterData[d.index]?.x, y: d.trend }))}
                  dataKey="y" dot={false} strokeDasharray="6 3"
                  stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} type="linear"
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", marginTop: 8 }}>
            Click any dot to open activity detail · ⭐ = personal best
          </div>
        </div>

        {/* Map overlay */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Route Overlay — {mapRuns.length} selected
            </h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={selectAll} style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(0,212,170,0.1)", border: "1px solid rgba(0,212,170,0.3)", color: "#00D4AA", cursor: "pointer", fontSize: 12 }}>All</button>
              <button onClick={selectNone} style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12 }}>None</button>
            </div>
          </div>

          {/* Run selection chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {runs.map((r, i) => {
              const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
              const selected = selectedRuns.has(r.id);
              const isBest = paceVal(r.moving_time, r.distance) === bestPace;
              return (
                <button key={r.id} onClick={() => toggleRun(r.id)} style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "6px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12,
                  background: selected ? `${color}22` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${selected ? color : "rgba(255,255,255,0.1)"}`,
                  color: selected ? color : "rgba(255,255,255,0.4)",
                  transition: "all 0.15s",
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: selected ? color : "rgba(255,255,255,0.2)" }} />
                  {isBest && <span>⭐</span>}
                  <span style={{ fontWeight: selected ? 600 : 400 }}>
                    {new Date(r.start_date).getFullYear()} · {formatPaceSeconds(paceVal(r.moving_time, r.distance))}/km
                  </span>
                </button>
              );
            })}
          </div>

          <OverlayMap runs={mapRuns} />
        </div>

        {/* Run list */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "16px 1fr 90px 80px 110px 70px", padding: "12px 20px", fontSize: 11, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <span/><span>Run</span><span style={{textAlign:"right"}}>Dist</span><span style={{textAlign:"right"}}>Time</span><span style={{textAlign:"right"}}>Pace</span><span style={{textAlign:"right"}}>HR</span>
          </div>
          {[...runs].reverse().map((r, i) => {
            const isBest = paceVal(r.moving_time, r.distance) === bestPace;
            const color = ROUTE_COLORS[(runs.length - 1 - i) % ROUTE_COLORS.length];
            return (
              <div key={r.id} onClick={() => onSelectActivity(r)} style={{
                display: "grid", gridTemplateColumns: "16px 1fr 90px 80px 110px 70px",
                alignItems: "center", padding: "12px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                cursor: "pointer", transition: "background 0.15s",
                background: isBest ? "rgba(0,212,170,0.05)" : "transparent",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={e => e.currentTarget.style.background = isBest ? "rgba(0,212,170,0.05)" : "transparent"}
              >
                <div style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                    {r.name}
                    {isBest && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(0,212,170,0.2)", color: "#00D4AA", fontWeight: 700 }}>PB</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{formatDate(r.start_date)}</div>
                </div>
                <div style={{ textAlign: "right", fontWeight: 700, color: "#00D4AA", fontSize: 13 }}>{km(r.distance)} km</div>
                <div style={{ textAlign: "right", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{hms(r.moving_time)}</div>
                <div style={{ textAlign: "right", color: isBest ? "#00D4AA" : "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: isBest ? 700 : 400 }}>{formatPaceSeconds(paceVal(r.moving_time, r.distance))} /km</div>
                <div style={{ textAlign: "right", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{r.average_heartrate ? `♥ ${Math.round(r.average_heartrate)}` : "–"}</div>
              </div>
            );
          })}
        </div>
      </>}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [athleteId, setAthleteId] = useState(() => localStorage.getItem("athlete_id") || null);
  const [athlete, setAthlete] = useState(null);
  const [stats, setStats] = useState(null);
  const [allActivities, setAllActivities] = useState([]);
  const [activities, setActivities] = useState([]);
  const [fitness, setFitness] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedSport, setSelectedSport] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [detailActivity, setDetailActivity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actPage, setActPage] = useState(0);
  const [totalActs, setTotalActs] = useState(0);
  const [stravaSummit, setStravaSummit] = useState(false);

  // Fetch runtime config — Summit auto-detected from athlete profile
  useEffect(() => {
    if (!athleteId) return;
    fetch(`${API}/api/config?athlete_id=${athleteId}`)
      .then(r => r.json())
      .then(d => setStravaSummit(d.strava_summit || false))
      .catch(() => {});
  }, [athleteId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("athlete_id");
    const syncing = params.get("syncing");
    if (id) {
      setAthleteId(id);
      localStorage.setItem("athlete_id", id);
      if (syncing) setSyncStatus({ status: "syncing", count: 0 });
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    if (!athleteId || !syncStatus || syncStatus.status === "complete") return;
    const iv = setInterval(async () => {
      const r = await fetch(`${API}/api/status/${athleteId}`);
      const s = await r.json();
      setSyncStatus(s);
      if (s.status === "complete") { loadData(); clearInterval(iv); }
    }, 2000);
    return () => clearInterval(iv);
  }, [athleteId, syncStatus]);

  const loadData = useCallback(async () => {
    if (!athleteId) return;
    setLoading(true);
    try {
      const [athRes, statsRes, fitRes, actsRes, allRunsRes] = await Promise.all([
        fetch(`${API}/api/athlete/${athleteId}`).then(r => r.json()),
        fetch(`${API}/api/stats/${athleteId}${selectedYear ? `?year=${selectedYear}` : ""}`).then(r => r.json()),
        fetch(`${API}/api/fitness/${athleteId}`).then(r => r.json()),
        fetch(`${API}/api/activities/${athleteId}?limit=50&offset=${actPage * 50}${selectedSport ? `&sport_type=${selectedSport}` : ""}${selectedYear ? `&year=${selectedYear}` : ""}`).then(r => r.json()),
        // Fetch up to 2000 activities for client-side race/PB analysis
        fetch(`${API}/api/activities/${athleteId}?limit=1000&offset=0`).then(r => r.json()),
      ]);
      setAthlete(athRes);
      setStats(statsRes);
      setFitness(fitRes);
      setActivities(actsRes.activities || []);
      setTotalActs(actsRes.total || 0);
      setAllActivities(allRunsRes.activities || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [athleteId, selectedYear, selectedSport, actPage]);

  useEffect(() => { if (athleteId) loadData(); }, [loadData]);

  const handleSync = async () => {
    setSyncStatus({ status: "syncing", count: 0 });
    await fetch(`${API}/api/sync/${athleteId}`, { method: "POST" });
  };

  const years = stats?.yearly ? Object.keys(stats.yearly).sort((a, b) => b - a) : [];
  const sports = stats?.by_sport ? Object.keys(stats.by_sport) : [];

  // Running-focused stats
  const runStats = stats?.by_sport
    ? Object.entries(stats.by_sport).filter(([k]) => isRun(k)).reduce((acc, [, v]) => ({
        count: acc.count + v.count,
        distance: acc.distance + v.distance,
        elevation: acc.elevation + v.elevation,
        time: acc.time + v.time,
      }), { count: 0, distance: 0, elevation: 0, time: 0 })
    : null;

  // ── Landing ──────────────────────────────────────────────────────────────
  if (!athleteId) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0d1117", color: "#fff",
        fontFamily: "'Inter', sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 32,
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&family=Inter:wght@400;500;600&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #0d1117; }
          input:focus { outline: none; border-color: rgba(0,212,170,0.5) !important; }
        `}</style>
        <div style={{ position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)", width: 600, height: 400, background: "radial-gradient(ellipse, rgba(0,212,170,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ textAlign: "center", position: "relative" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🏃</div>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(56px, 10vw, 96px)", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.02em", background: "linear-gradient(135deg, #00D4AA, #00A87D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            ATHLETIQ
          </h1>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 16, marginTop: 16 }}>Your self-hosted Strava analytics, on your own hardware.</p>
        </div>
        <a href={`${API}/auth/login`} style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "16px 40px", borderRadius: 14, background: "#FC4C02", color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: 16, boxShadow: "0 0 40px rgba(252,76,2,0.4)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></svg>
          Connect with Strava
        </a>
      </div>
    );
  }

  // ── Main Dashboard ────────────────────────────────────────────────────────
  const navItems = [
    { id: "dashboard",   icon: "📊", label: "Dashboard" },
    { id: "calendar",    icon: "📅", label: "Calendar" },
    { id: "progression", icon: "📉", label: "Progression" },
    { id: "races",       icon: "🏅", label: "Race History" },
    { id: "activities",  icon: "📋", label: "All Activities" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#fff", fontFamily: "'Inter', sans-serif", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d1117; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
        input { color-scheme: dark; }
        select option { background: #1a1f2e; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 220, background: "#0a0e14", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", padding: "24px 0", flexShrink: 0, position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "0 24px 28px" }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 900, background: "linear-gradient(135deg, #00D4AA, #00A87D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            🏃 ATHLETIQ
          </div>
        </div>

        {athlete && (
          <div style={{ padding: "0 24px 24px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <img src={athlete.profile_medium} alt="" style={{ width: 40, height: 40, borderRadius: 20, marginBottom: 8 }} onError={e => e.target.style.display='none'} />
            <div style={{ fontWeight: 600, fontSize: 14 }}>{athlete.firstname} {athlete.lastname}</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 2 }}>{athlete.state}, {athlete.country}</div>
          </div>
        )}

        <nav style={{ flex: 1, padding: "16px 12px" }}>
          {navItems.map(({ id, icon, label }) => (
            <button key={id} onClick={() => setPage(id)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12,
              padding: "11px 16px", borderRadius: 10, marginBottom: 4,
              background: page === id ? "rgba(0,212,170,0.12)" : "transparent",
              border: page === id ? "1px solid rgba(0,212,170,0.25)" : "1px solid transparent",
              color: page === id ? "#00D4AA" : "rgba(255,255,255,0.5)",
              cursor: "pointer", fontSize: 14, fontWeight: page === id ? 600 : 400,
              textAlign: "left", transition: "all 0.15s",
            }}>
              <span>{icon}</span> {label}
            </button>
          ))}
        </nav>

        <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <button onClick={handleSync} disabled={syncStatus?.status === "syncing"} style={{
            width: "100%", padding: "10px 16px", borderRadius: 10,
            background: syncStatus?.status === "syncing" ? "rgba(255,255,255,0.05)" : "rgba(0,212,170,0.15)",
            border: "1px solid rgba(0,212,170,0.3)", color: "#00D4AA",
            cursor: syncStatus?.status === "syncing" ? "default" : "pointer", fontSize: 13, fontWeight: 600,
          }}>
            {syncStatus?.status === "syncing" ? `⟳ Syncing... ${syncStatus.count || 0}` : "⟳ Sync Strava"}
          </button>
          <a
            href={`${API}/api/export/${athleteId}/csv`}
            download
            style={{
              display: "block", width: "100%", marginTop: 8, padding: "10px 16px",
              borderRadius: 10, background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)",
              cursor: "pointer", fontSize: 13, fontWeight: 600,
              textDecoration: "none", textAlign: "center", boxSizing: "border-box",
            }}
          >
            ⬇ Export CSV
          </a>
          <button onClick={() => { localStorage.removeItem("athlete_id"); setAthleteId(null); }} style={{
            width: "100%", marginTop: 8, padding: "8px", borderRadius: 10,
            background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 12,
          }}>Sign Out</button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Filter bar — only show on dashboard/activities */}
        {(page === "dashboard" || page === "activities") && (
          <div style={{
            padding: "14px 32px", borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex", gap: 12, alignItems: "center",
            background: "rgba(0,0,0,0.2)", position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(12px)",
          }}>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>Filter:</span>
            <select value={selectedYear || ""} onChange={e => { setSelectedYear(e.target.value || null); setActPage(0); }} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>
              <option value="">All Years</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={selectedSport || ""} onChange={e => { setSelectedSport(e.target.value || null); setActPage(0); }} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>
              <option value="">All Sports</option>
              {sports.map(s => <option key={s} value={s}>{sportIcon(s)} {s}</option>)}
            </select>
            {(selectedYear || selectedSport) && (
              <button onClick={() => { setSelectedYear(null); setSelectedSport(null); setActPage(0); }} style={{ background: "rgba(0,212,170,0.1)", border: "1px solid rgba(0,212,170,0.3)", color: "#00D4AA", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13 }}>Clear ×</button>
            )}
            {loading && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginLeft: "auto" }}>Loading...</span>}
          </div>
        )}

        <div style={{ padding: "32px" }}>
          {/* Sync banner */}
          {syncStatus?.status === "syncing" && (
            <div style={{ marginBottom: 24, padding: "16px 24px", borderRadius: 12, background: "rgba(0,212,170,0.08)", border: "1px solid rgba(0,212,170,0.25)", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 20 }}>⟳</div>
              <div>
                <div style={{ fontWeight: 600, color: "#00D4AA" }}>Syncing your Strava activities...</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 2 }}>{syncStatus.count || 0} activities imported so far.</div>
              </div>
            </div>
          )}

          {/* ── DASHBOARD ──────────────────────────────────────────────────── */}
          {page === "dashboard" && stats && (
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

              {/* Running highlight row */}
              {runStats && runStats.count > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: "rgba(0,212,170,0.7)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12, fontWeight: 600 }}>
                    🏃 Running Stats {selectedYear ? `· ${selectedYear}` : "· All Time"}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
                    <StatCard label="Runs" value={runStats.count.toLocaleString()} highlight accent="#00D4AA" />
                    <StatCard label="Run Distance" value={`${km(runStats.distance)} km`} highlight accent="#00D4AA" />
                    <StatCard label="Run Elevation" value={`${Math.round((runStats.elevation||0)/1000)} km`} highlight accent="#00D4AA" sub="vertical gain" />
                    <StatCard label="Run Time" value={hms(runStats.time)} highlight accent="#00D4AA" />
                    <StatCard label="Marathons" value={allActivities.filter(a => isRun(a.sport_type) && a.distance >= 41500 && a.distance <= 43000).length} highlight accent="#00D4AA" sub="42–43 km" />
                    <StatCard label="Half Marathons" value={allActivities.filter(a => isRun(a.sport_type) && a.distance >= 20900 && a.distance <= 21500).length} highlight accent="#00D4AA" sub="20.9–21.5 km" />
                  </div>
                </div>
              )}

              {/* All sports totals */}
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12, fontWeight: 600 }}>All Sports</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
                  <StatCard label="Total Activities" value={stats.total_activities?.toLocaleString()} accent="#8B5CF6" />
                  <StatCard label="Total Distance" value={`${km(stats.total_distance)} km`} accent="#FF6B2B" />
                  <StatCard label="Total Elevation" value={`${Math.round((stats.total_elevation||0)/1000)} km`} accent="#FFB347" />
                  <StatCard label="Total Time" value={hms(stats.total_time)} accent="#3B82F6" />
                  <StatCard label="PRs Earned" value={stats.total_prs?.toLocaleString() || 0} accent="#F59E0B" />
                </div>
              </div>

              {/* Charts */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 28 }}>
                  <WeeklyChart activities={allActivities} />
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 28 }}>
                  <SportBreakdown by_sport={stats.by_sport} />
                </div>
              </div>

              {/* PB Table */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 28 }}>
                <PBTable activities={allActivities} />
              </div>

              {/* Recent activities */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 28 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Recent Activities</h3>
                  <button onClick={() => setPage("activities")} style={{ background: "transparent", border: "none", color: "#00D4AA", cursor: "pointer", fontSize: 13 }}>View all →</button>
                </div>
                <div style={{ fontSize: 11, display: "grid", gridTemplateColumns: "36px 1fr 90px 80px 70px 110px 70px", color: "rgba(255,255,255,0.25)", padding: "0 20px 8px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  <span/><span>Activity</span><span style={{textAlign:"right"}}>Dist</span><span style={{textAlign:"right"}}>Time</span><span style={{textAlign:"right"}}>Elev</span><span style={{textAlign:"right"}}>Pace</span><span style={{textAlign:"right"}}>HR</span>
                </div>
                {activities.slice(0, 8).map(a => <ActivityRow key={a.id} act={a} onClick={setSelectedActivity} />)}
              </div>
            </div>
          )}

          {/* ── RACE HISTORY ──────────────────────────────────────────────── */}
          {page === "races" && (
            <RaceHistory activities={allActivities} onSelectActivity={setSelectedActivity} />
          )}

          {/* ── ALL ACTIVITIES ────────────────────────────────────────────── */}
          {page === "activities" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800 }}>
                  Activities <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 20 }}>({totalActs.toLocaleString()})</span>
                </h2>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, overflow: "hidden" }}>
                <div style={{ fontSize: 11, display: "grid", gridTemplateColumns: "36px 1fr 90px 80px 70px 110px 70px", color: "rgba(255,255,255,0.25)", padding: "12px 20px", letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <span/><span>Activity</span><span style={{textAlign:"right"}}>Dist</span><span style={{textAlign:"right"}}>Time</span><span style={{textAlign:"right"}}>Elev</span><span style={{textAlign:"right"}}>Pace</span><span style={{textAlign:"right"}}>HR</span>
                </div>
                {activities.map(a => <ActivityRow key={a.id} act={a} onClick={setSelectedActivity} />)}
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 24 }}>
                <button disabled={actPage === 0} onClick={() => setActPage(p => p - 1)} style={{ padding: "8px 20px", borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", cursor: actPage === 0 ? "default" : "pointer", opacity: actPage === 0 ? 0.4 : 1 }}>← Prev</button>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, display: "flex", alignItems: "center" }}>Page {actPage + 1} of {Math.ceil(totalActs / 50)}</span>
                <button disabled={(actPage + 1) * 50 >= totalActs} onClick={() => setActPage(p => p + 1)} style={{ padding: "8px 20px", borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", cursor: (actPage + 1) * 50 >= totalActs ? "default" : "pointer", opacity: (actPage + 1) * 50 >= totalActs ? 0.4 : 1 }}>Next →</button>
              </div>
            </div>
          )}

          {/* ── CALENDAR ─────────────────────────────────────────────────── */}
          {page === "calendar" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800 }}>Activity Calendar</h2>
              </div>

              {/* Year tabs */}
              {stats?.yearly && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Object.keys(stats.yearly).sort((a,b) => b-a).map(y => (
                    <button
                      key={y}
                      onClick={() => setSelectedYear(selectedYear === y ? null : y)}
                      style={{
                        padding: "7px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                        background: (selectedYear === y || (!selectedYear && y === String(new Date().getFullYear()))) ? "rgba(0,212,170,0.2)" : "rgba(255,255,255,0.06)",
                        border: (selectedYear === y || (!selectedYear && y === String(new Date().getFullYear()))) ? "1px solid rgba(0,212,170,0.4)" : "1px solid rgba(255,255,255,0.1)",
                        color: (selectedYear === y || (!selectedYear && y === String(new Date().getFullYear()))) ? "#00D4AA" : "rgba(255,255,255,0.6)",
                      }}
                    >{y}</button>
                  ))}
                </div>
              )}

              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 28 }}>
                <HeatmapCalendar
                  activities={allActivities}
                  year={parseInt(selectedYear) || new Date().getFullYear()}
                />
              </div>

              {/* Monthly breakdown for selected year */}
              {stats?.monthly && (
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 28 }}>
                  <h3 style={{ margin: "0 0 20px", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Monthly Breakdown — {selectedYear || new Date().getFullYear()}
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
                    {Array.from({length: 12}, (_, i) => {
                      const yr = selectedYear || new Date().getFullYear();
                      const key = `${yr}-${String(i+1).padStart(2,"0")}`;
                      const d = stats.monthly[key];
                      const monthName = new Date(yr, i, 1).toLocaleString("en-IE", {month: "short"});
                      return (
                        <div key={i} style={{ background: d ? "rgba(0,212,170,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${d ? "rgba(0,212,170,0.2)" : "rgba(255,255,255,0.05)"}`, borderRadius: 12, padding: "14px 16px" }}>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>{monthName}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: d ? "#00D4AA" : "rgba(255,255,255,0.15)" }}>
                            {d ? `${(d.distance/1000).toFixed(0)}` : "0"}<span style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.3)" }}> km</span>
                          </div>
                          {d && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{d.count} activities</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PROGRESSION ──────────────────────────────────────────────── */}
          {page === "progression" && (
            <ProgressionPage activities={allActivities} onSelectActivity={setSelectedActivity} />
          )}

        </div>
      </div>

      <ActivityModal act={selectedActivity} athleteId={athleteId} stravaSummit={stravaSummit} onClose={() => setSelectedActivity(null)} onOpenDetail={(act) => { setSelectedActivity(null); setDetailActivity(act); }} />
      {detailActivity && <ActivityDetailPage act={detailActivity} athleteId={athleteId} stravaSummit={stravaSummit} onBack={() => setDetailActivity(null)} />}
    </div>
  );
}
