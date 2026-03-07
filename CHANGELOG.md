# Changelog

All notable changes to Athletiq will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [1.2.4] - 2026-03-07

### Added
- **Segment history reordered** — history panel now shows: current effort → best (gold, 🥇) → previous efforts by date descending, most recent first
- **Backfill resume button** — appears in the sidebar automatically when the background backfill stalls (no progress for >60s) or errors, allowing one-click restart without SSH
- `POST /api/backfill/resume/{athlete_id}` endpoint resets and restarts a stalled or errored backfill task

### Changed
- Backfill base delay reduced from 6s to 3s (~20 requests/min); dynamic backoff threshold raised to 170/200 — Strava rate limits are per-application, not per-subscription tier
- Stale backfill threshold reduced from 5 minutes to 60 seconds before Resume button appears
- Background backfill now distinguishes between 15-minute and daily rate limits — sleeps until next 15-min boundary on short-term limit, and until midnight UTC on daily cap
- Backfill total calculated dynamically in status endpoint to avoid stale snapshot (fixes `633/616`-style overcount)
- `docker-compose.yml` healthcheck now specifies `-d athletiq` to prevent noisy "database velosyno does not exist" log errors

### Fixed
- `delay` variable undefined when HTTP request threw an exception before rate limit headers were read, causing silent backfill crash
- Activities returning 4xx (deleted/private) now marked as `detail_fetched = True` to prevent infinite retry loop
- Resume endpoint used `asyncio.create_task` in sync context — switched to `BackgroundTasks` for reliable task spawning
- In-memory lock (`backfill_running` set) prevents concurrent backfill tasks from spawning on multiple Resume clicks, which previously caused immediate rate limit cascade
- Fatal backfill exceptions now logged rather than silently swallowed

---

## [1.2.0] - 2026-03-06

### Added
- **Strava segments** — new Segments tab in both the activity modal and full detail page, showing all segments recorded on a run with distance, grade, time, and PR rank
- **Segment map highlighting** — click any segment row to highlight it on the route map in orange, with start/end markers and automatic zoom; click again to clear
- **Segment history & delta** — click a segment row to load all cached efforts on that segment, with a Δ vs PR column showing improvement or decline vs your best cached time
- **"New ✨" indicator** — segments with no prior `pr_rank` from Strava and no cached history are marked as first efforts
- **"Find previous efforts" backfill** — button in the segment history panel that silently scans all un-fetched activities for efforts on the selected segment, with a live progress bar and time remaining estimate
- **Silent detail fetch on modal open** — activity detail (splits, best efforts, segments) is now fetched and cached automatically whenever any activity modal is opened, even on the Overview tab, so browsing older activities builds up history naturally
- All times across the app now display in precise `h:mm:ss` / `m:ss` format
- New backend endpoint `GET /api/segments/{athlete_id}/{segment_id}/history` — scans cached activity detail for efforts on a given segment
- New backend endpoint `GET /api/segments/{athlete_id}/{segment_id}/backfill` — SSE stream that progressively fetches un-cached activity details and reports progress
- New `segment_history` database table for future use

### Changed
- Segment delta column: PRs show improvement vs previous best; non-PRs show gap to best; genuine first efforts show "New ✨"
- Backfill now runs sequentially at ~10 requests/min with dynamic backoff based on Strava rate limit headers, avoiding rate limit errors
- Segments table has a fixed max-height with independent scrolling so map and controls above remain accessible on activities with many segments
- Segment table headers are now sticky when scrolling
- `hms()` helper updated to always return precise `h:mm:ss` or `m:ss`

### Known limitations
- Full segment effort history requires Strava Summit (paid) — the `/segment_efforts` endpoint returns HTTP 402 on free accounts. History is built from locally cached activities instead
- See README for full Strava API limitations

---

## [1.2.3] - 2026-03-07

### Added
- **Background detail backfill** — after initial sync completes, Athletiq automatically fetches full activity detail (splits, best efforts, segments) for all activities in the background, server-side. Runs independently of any browser connection; safe to close the tab
- `backfill_tasks` database table tracks backfill state (`pending` → `running` → `done`) with progress counters
- `/api/backfill/status/{athlete_id}` endpoint exposes live progress
- Sidebar progress indicator: shows fetch count, progress bar, and "safe to close this tab" note while running; dismissable completion message when done
- Server startup hook resumes any interrupted backfill tasks automatically (e.g. after NAS restart)

### Changed
- Backfill rate limit raised from 6s to 3s base delay (~20 requests/min) with dynamic backoff when `X-RateLimit-Usage` exceeds 170/200 — Strava rate limits are per-application, not per-subscription tier

### Notes
- The auto-trigger fires only on first-ever sync. Existing installs can seed the task manually via psql then restart the backend (see README)

---

## [1.2.2] - 2026-03-07

### Changed
- Segment history reverted to cache-based approach for all users — investigation confirmed Strava's `/segment_efforts` endpoint does not return historical efforts retroactively, even with a Summit subscription. The backfill scan remains the correct solution for all users
- `stravaSummit` flag retained in config endpoint for future use, but no longer changes segment history behaviour
- README and limitations docs updated to reflect actual Strava API behaviour

---

## [1.2.1] - 2026-03-06

### Added
- **Strava Summit auto-detection** — Summit subscription status is now read automatically from the stored athlete profile at login. No `.env` flag required. Summit users get full segment history directly from Strava; free users get cache-based history with the backfill scan
- New `GET /api/config` endpoint — returns runtime flags (including `strava_summit`) to the frontend at load time
- Re-auth prompt in the segment history panel for free users, with a direct link to re-connect with Strava if their subscription status has changed

### Changed
- `STRAVA_SUMMIT` in `.env` is now an optional manual override only — auto-detection handles it in all normal cases
- Summit detection refreshes on every login — upgrading or downgrading Strava just requires clicking "Connect with Strava" again

---

## [1.1.0] - 2026-02-27

### Added
- **Activity detail: km splits** — per-kilometre pace table, colour coded green→red relative to your average pace
- **Activity detail: best efforts** — 400m, 1km, 1 mile, 5km, 10km etc. with PR medals (🥇🥈🥉)
- **Activity detail: description** — your Strava activity notes displayed in the modal and detail page
- **Full activity detail page** — dedicated two-column layout with map + splits/efforts side by side, accessed via "Full Page ↗" in the modal
- **Tabbed activity modal** — Overview / Splits / Best Efforts tabs; detail data fetched on demand and cached locally
- **Half split indicator** — first vs second half pace comparison on the splits view, with positive/negative/even split label and colour coding
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
