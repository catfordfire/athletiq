# Contributing to Athletiq

Thanks for your interest! Athletiq is a self-hosted Strava analytics platform built for athletes who want to own their training data.

## Getting Started

1. **Fork and clone** the repo
2. **Create a Strava API app** at [strava.com/settings/api](https://www.strava.com/settings/api)
3. **Copy `.env.example` to `.env`** and fill in your credentials
4. **Start the stack:**
```bash
   docker compose up -d --build
```
5. Open `http://localhost:3000` and connect your Strava account

## Project Structure
```
athletiq/
├── backend/main.py        # FastAPI — all routes, DB models, Strava OAuth & sync
├── frontend/src/App.jsx   # React — entire frontend in one file
├── scripts/               # Setup and update helpers
├── docker-compose.yml
└── .env.example
```

## How to Contribute

**Reporting bugs** — open an issue with what happened, what you expected, your DSM/Docker versions, and relevant logs from `docker compose logs backend`

**Suggesting features** — open an issue with the `enhancement` label. Ideas on the radar:
- 🎯 Annual distance goal tracker
- 👟 Shoe/gear mileage tracker  
- 📊 Year vs year comparison
- 🏆 Age grade calculator
- 📧 Weekly summary email digest

**Submitting a PR:**
1. Create a branch: `git checkout -b feature/my-feature`
2. Make your changes and test with a real Strava account
3. Open a PR with a clear description of what changed and why

## Code Style
- **Python**: PEP 8, keep functions focused
- **React**: Functional components, inline styles (consistent with existing code)
- Keep dependencies lean — no new packages without discussion

## Security
Never commit credentials or tokens. The `.gitignore` covers `.env` but always double-check before pushing.
