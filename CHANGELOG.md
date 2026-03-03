# Changelog

All notable changes to Athletiq will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [1.1.0] - 2026-02-27

### Added
- **Activity detail: km splits** — per-kilometre pace table, colour coded green→red relative to your average pace
- **Activity detail: best efforts** — 400m, 1km, 1 mile, 5km, 10km etc. with PR medals (🥇🥈🥉)
- **Activity detail: description** — your Strava activity notes displayed in the modal and detail page
- **Full activity detail page** — dedicated two-column layout with map + splits/efforts side by side, accessed via "Full Page ↗" in the modal
- **Tabbed activity modal** — Overview / Splits / Best Efforts tabs; detail data fetched on demand and cached locally
- New backend endpoint `GET /api/activity/{athlete_id}/{activity_id}/detail` — fetches from Strava and caches in DB

### Changed
- Activity modal now includes a "Full Page ↗" button to open the dedicated detail page

---

## [1.0.0] - 2026-02-24

### Added
- Initial release
- Strava OAuth login and full activity sync
- **Dashboard** — running stats, weekly volume chart, personal bests table, sport breakdown
- **Calendar** — GitHub-style activity heatmap by year, monthly breakdown grid
- **Progression** — scatter plot of pace over time, multi-route map overlay, time period and distance filtering
- **Race History** — filter by distance preset or custom range, best pace highlighting
- **All Activities** — paginated activity log with year/sport filters
- **Activity modal** — Leaflet route map, stats grid, GPX download
- CSV export of all activities
- Nightly auto-sync support via DSM Task Scheduler
- Docker Compose setup with FastAPI backend, React/Nginx frontend, PostgreSQL
- Host networking for reliable Strava API access on Synology
EOF
