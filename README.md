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
| 🗺️ **Activity modal** | Leaflet map of your route, GPX download |
| ⬇ **Export** | Full CSV export of all activities |

**Everything runs on your own hardware.** No third-party servers, no subscriptions, no ads.

---

## 🏗 Architecture
```
┌─────────────────────────────────────────────┐
│  Synology NAS (or any Docker host)           │
│                                              │
│  ┌──────────────┐    ┌──────────────────┐   │
│  │   Frontend   │    │     Backend      │   │
│  │  React/Nginx │    │  FastAPI/Python  │   │
│  │  Port 3000   │◄──►│  Port 8000+      │   │
│  └──────────────┘    └────────┬─────────┘   │
│                               │              │
│                      ┌────────▼─────────┐   │
│                      │    PostgreSQL     │   │
│                      └──────────────────┘   │
│                               │              │
└───────────────────────────────┼─────────────┘
                                ▼
                      strava.com/api/v3
```

- **Frontend**: React 18 + Vite + Recharts + Leaflet, served by Nginx
- **Backend**: FastAPI (Python 3.11) with SQLAlchemy + httpx
- **Database**: PostgreSQL 15 with persistent volume
- **Networking**: Backend uses host networking for reliable outbound API access on Synology

---

## 📋 Requirements

- Synology NAS running **DSM 7+** (or any Linux host with Docker)
- **Container Manager** package installed
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
git clone https://github.com/catfordfire/athletiq.git /volume1/docker/athletiq
cd /volume1/docker/athletiq
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

Open `http://YOUR_NAS_IP:3000` and click **Connect with Strava**. Your activities will begin syncing — this may take a few minutes if you have years of history.

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

Your athlete ID appears in the URL after you first connect: `strava.com/athletes/XXXXXX`

---

## 📡 API Endpoints

The backend exposes a REST API — full interactive docs at `http://NAS_IP:BACKEND_PORT/docs`

| Endpoint | Description |
|---|---|
| `GET /api/athlete/{id}` | Athlete profile |
| `GET /api/activities/{id}` | Paginated activity list |
| `GET /api/stats/{id}` | Aggregate statistics |
| `POST /api/sync/{id}` | Trigger activity sync |
| `GET /api/activity/{id}/{activity_id}/gpx` | Download GPX file |
| `GET /api/export/{id}/csv` | Export all activities as CSV |

---

## 🔒 Security Notes

- Designed for **local network use**. If exposing externally, put it behind a reverse proxy with authentication.
- Strava tokens are stored in local PostgreSQL — they never leave your network.
- Use a strong `DB_PASSWORD`.
- Never commit your `.env` file — it's in `.gitignore`.

---

## 🗺 External Access

1. Forward `FRONTEND_PORT` and `BACKEND_PORT` on your router to your NAS IP
2. Update `APP_URL` and `BACKEND_URL` in `.env` to your external IP or domain
3. Update **Authorization Callback Domain** in Strava API settings
4. Rebuild: `docker compose up -d --build frontend`

For best security, use Synology's built-in **Reverse Proxy** with HTTPS.

---

## 🛠 Troubleshooting

**Backend can't reach Strava API**
The backend uses `network_mode: host`. Check DSM firewall under Control Panel → Security → Firewall.

**Frontend shows blank page**
`VITE_API_URL` is baked in at build time. If you change `BACKEND_URL`, rebuild: `docker compose up -d --build frontend`

**Activities not syncing**
Check logs: `docker compose logs -f backend`

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
│   └── entrypoint.sh
├── frontend/
│   ├── src/
│   │   ├── App.jsx      # Main React application
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf
│   └── Dockerfile
├── scripts/
│   ├── setup.sh
│   └── update.sh
├── docker-compose.yml
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

Ideas for future features:
- 🎯 Annual distance goal tracker
- 👟 Shoe/gear mileage tracker
- 📊 Year vs year comparison
- 🏆 Age grade calculator
- 📧 Weekly summary email digest

---

## 📄 License

MIT — do whatever you like with it.

---

<div align="center">
Built with ❤️ for athletes who want to own their data.
</div>
