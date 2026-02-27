#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Athletiq Setup Script
#  Run this once on your Synology NAS (or any Linux/Mac)
# ═══════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
ORANGE='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${ORANGE}"
echo "  ██╗   ██╗███████╗██╗      ██████╗ ███████╗██╗   ██╗███╗   ██╗ ██████╗ "
echo "  ██║   ██║██╔════╝██║     ██╔═══██╗██╔════╝╚██╗ ██╔╝████╗  ██║██╔═══██╗"
echo "  ██║   ██║█████╗  ██║     ██║   ██║███████╗ ╚████╔╝ ██╔██╗ ██║██║   ██║"
echo "  ╚██╗ ██╔╝██╔══╝  ██║     ██║   ██║╚════██║  ╚██╔╝  ██║╚██╗██║██║   ██║"
echo "   ╚████╔╝ ███████╗███████╗╚██████╔╝███████║   ██║   ██║ ╚████║╚██████╔╝"
echo "    ╚═══╝  ╚══════╝╚══════╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═══╝ ╚═════╝ "
echo -e "${NC}"
echo -e "  ${BLUE}Self-hosted Strava Analytics for Synology NAS${NC}"
echo ""

# ── Check prerequisites ──────────────────────────────────────────
echo -e "${BLUE}Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not found. Install Docker via Synology Package Center.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker found${NC}"

if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}✗ Docker Compose not found.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker Compose found${NC}"

# ── Setup .env ────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    echo ""
    echo -e "${ORANGE}Setting up environment...${NC}"
    cp .env.example .env

    echo ""
    read -p "  Enter your Strava Client ID: " CLIENT_ID
    read -p "  Enter your Strava Client Secret: " CLIENT_SECRET
    read -p "  Enter your NAS local IP (e.g. 192.168.1.100): " NAS_IP
    read -p "  Enter a database password: " DB_PASS

    # Replace in .env
    sed -i "s/your_client_id_here/$CLIENT_ID/" .env
    sed -i "s/your_client_secret_here/$CLIENT_SECRET/" .env
    sed -i "s/192.168.1.100/$NAS_IP/g" .env
    sed -i "s/change_me_to_something_secure/$DB_PASS/" .env

    echo -e "${GREEN}✓ .env configured${NC}"
else
    echo -e "${GREEN}✓ .env already exists${NC}"
fi

# ── Create data directories ───────────────────────────────────────
echo ""
echo -e "${BLUE}Creating data directories...${NC}"
mkdir -p data/postgres data/uploads
echo -e "${GREEN}✓ Directories created${NC}"

# ── Configure Strava OAuth redirect ──────────────────────────────
source .env
echo ""
echo -e "${ORANGE}══════════════════════════════════════════════${NC}"
echo -e "${ORANGE}  IMPORTANT: Configure Strava API             ${NC}"
echo -e "${ORANGE}══════════════════════════════════════════════${NC}"
echo ""
echo -e "  Go to: ${BLUE}https://www.strava.com/settings/api${NC}"
echo ""
echo -e "  Set your Authorization Callback Domain to:"
echo -e "  ${GREEN}${NAS_IP:-192.168.1.100}${NC}"
echo ""
echo -e "  Your OAuth callback URL will be:"
echo -e "  ${GREEN}${BACKEND_URL:-http://localhost:8000}/auth/callback${NC}"
echo ""
read -p "  Press Enter when you've updated the Strava API settings..."

# ── Build and start ───────────────────────────────────────────────
echo ""
echo -e "${BLUE}Building and starting Athletiq...${NC}"
echo -e "${ORANGE}(This may take 5-10 minutes on first run)${NC}"
echo ""

docker compose up -d --build

# ── Wait for health ───────────────────────────────────────────────
echo ""
echo -e "${BLUE}Waiting for services to start...${NC}"
sleep 5

# Check if backend is up
for i in {1..30}; do
    if curl -sf "http://localhost:${BACKEND_PORT:-8000}/docs" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is running${NC}"
        break
    fi
    sleep 2
done

echo ""
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Athletiq is running! 🏃                     ${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo ""
echo -e "  Dashboard:  ${BLUE}${APP_URL:-http://localhost:3000}${NC}"
echo -e "  API Docs:   ${BLUE}${BACKEND_URL:-http://localhost:8000}/docs${NC}"
echo ""
echo -e "  Click 'Connect with Strava' to begin!"
echo ""
