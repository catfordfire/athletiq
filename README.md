# 🏃 Athletiq

**Self-hosted Strava analytics on your Synology NAS — a Veloviewer alternative you own.**

No subscription fees. No third parties. Your data stays on your hardware.

---

## Features

- 📊 **Dashboard** — total distance, elevation, time, PRs, activity breakdowns
- 📈 **Fitness/Form Curves** — CTL, ATL, TSB (like TrainingPeaks)
- 📋 **Activity Log** — paginated, searchable, filterable by sport & year
- 🗓️ **Year-on-Year Analytics** — monthly bars, yearly progression
- 🏅 **Personal Records** — best paces by distance
- 🔄 **Auto-sync** — pull all historical + new activities from Strava
- 🔒 **100% Private** — runs on your LAN, no cloud dependencies

---

## Quick Start

### Prerequisites

- Synology NAS running DSM 7+
- **Docker** and **Container Manager** installed via Package Center
- A Strava API application (free): https://www.strava.com/settings/api

### Step 1 — Create a Strava API App

1. Go to https://www.strava.com/settings/api
2. Create a new application (name it "Athletiq" or similar)
3. Note your **Client ID** and **Client Secret**
4. Set **Authorization Callback Domain** to your NAS's local IP (e.g. `192.168.1.100`)

### Step 2 — Deploy on Synology

**Option A: SSH (recommended)**

```bash
# SSH into your NAS
ssh admin@192.168.1.100

# Clone or copy the athletiq folder to your NAS
# e.g. into /volume1/docker/athletiq

cd /volume1/docker/athletiq
chmod +x scripts/*.sh
./scripts/setup.sh
```

**Option B: Manual via Container Manager**

1. Copy the `athletiq` folder to your NAS (e.g. via File Station to `/volume1/docker/athletiq`)
2. Copy `.env.example` to `.env` and fill in your values
3. Open Container Manager → Project → Create
4. Set path to `/volume1/docker/athletiq`
5. Click Build & Run

### Step 3 — Connect Strava

1. Open `http://your-nas-ip:3000` in your browser
2. Click **Connect with Strava**
3. Authorize the app — it will redirect back and begin syncing
4. Wait for the sync to complete (progress shown in the UI)

---

## Configuration (`.env`)

| Variable | Description | Default |
|---|---|---|
| `STRAVA_CLIENT_ID` | Your Strava app Client ID | *required* |
| `STRAVA_CLIENT_SECRET` | Your Strava app Client Secret | *required* |
| `NAS_IP` | Your NAS local IP address | `192.168.1.100` |
| `APP_URL` | Full URL to the frontend | `http://NAS_IP:3000` |
| `BACKEND_URL` | Full URL to the backend API | `http://NAS_IP:8000` |
| `FRONTEND_PORT` | Port for the dashboard | `3000` |
| `BACKEND_PORT` | Port for the API | `8000` |
| `DB_PASSWORD` | PostgreSQL password | `athletiq_pass` |

---

## Project Structure

```
athletiq/
├── backend/
│   ├── main.py           # FastAPI app (OAuth, sync, analytics API)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Main React dashboard
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf
│   └── Dockerfile
├── data/                 # Created on first run (gitignored)
│   ├── postgres/         # Database files
│   └── uploads/          # Any uploaded files
├── scripts/
│   ├── setup.sh          # First-time setup
│   └── update.sh         # Update script
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API Reference

Once running, full API docs are available at:  
`http://your-nas-ip:8000/docs`

Key endpoints:

| Endpoint | Description |
|---|---|
| `GET /auth/login` | Start Strava OAuth flow |
| `GET /auth/callback` | OAuth callback (Strava calls this) |
| `GET /api/athlete/{id}` | Athlete profile |
| `GET /api/stats/{id}` | Aggregate statistics |
| `GET /api/activities/{id}` | Paginated activity list |
| `GET /api/fitness/{id}` | CTL/ATL/TSB fitness curve |
| `GET /api/heatmap/{id}` | Polylines for map rendering |
| `GET /api/records/{id}` | Personal records by distance |
| `POST /api/sync/{id}` | Trigger manual sync |

---

## Updating

```bash
cd /volume1/docker/athletiq
./scripts/update.sh
```

---

## Adding HTTPS (Optional but Recommended)

Use **Synology's built-in reverse proxy** or **Nginx Proxy Manager** (also available as a Docker container):

1. In DSM: Control Panel → Login Portal → Advanced → Reverse Proxy
2. Create a rule:
   - Source: `https://athletiq.your-domain.com`
   - Destination: `http://localhost:3000`
3. Update `APP_URL` in `.env` to your HTTPS domain
4. Rebuild: `./scripts/update.sh`

---

## Troubleshooting

**"Cannot connect to API"**
- Check that both containers are running: `docker compose ps`
- Ensure `BACKEND_URL` in `.env` uses your NAS's actual local IP, not `localhost`

**Strava OAuth redirect fails**
- Make sure the Authorization Callback Domain in Strava matches your NAS IP
- The callback URL must be `http://NAS_IP:8000/auth/callback`

**Sync stops early**
- Strava API rate limit is 1000 requests/15 min. The sync will auto-pause and resume.
- Very large accounts (5000+ activities) may take 30+ minutes

**Check logs**
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

---

## Security Notes

- Athletiq is designed for **local network use**
- Never expose port 8000 (backend) directly to the internet
- If using HTTPS/reverse proxy, only expose port 443
- Your Strava tokens are stored in the local PostgreSQL database
- Add firewall rules in DSM to restrict access if needed

---

## License

MIT — build, modify, self-host freely.
