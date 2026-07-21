# RTA Flight Tracker ✈️

![Architecture](https://img.shields.io/badge/Architecture-FastAPI%20%2B%20React-blue)
![Deployment](https://img.shields.io/badge/Deployment-Docker%20%2B%20Traefik-success)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)

RTA Flight Tracker is a high-performance, real-time aviation monitoring platform. It connects to the **OpenSky Network OIDC API** to pull live ADS-B telemetry data, aggregates the state vectors, and streams the updates to a responsive React/Leaflet dashboard over WebSockets.

---

## 🏗️ System Architecture

The application is split into a robust Python backend and a lightning-fast React frontend, orchestrated seamlessly using Docker Compose.

### Backend (`/backend`)
- **Framework**: FastAPI
- **Data Source**: OpenSky Network API (with automated OIDC token refresh cycles)
- **Streaming**: WebSockets (`/ws`) for low-latency live telemetry broadcasts
- **Concurrency**: Asynchronous tasks utilizing `asyncio` and `httpx` to handle high throughput data ingestion.

### Frontend (`/frontend`)
- **Framework**: React 19 + Vite
- **Mapping Engine**: Leaflet + React-Leaflet
- **Styling**: Tailwind CSS v4 (Stark Monochromatic UI)
- **Features**: Smooth marker interpolation, live trailing paths, radar simulation elements, and dynamic UI panels tracking altitudes and speeds.

---

## 🚀 Deployment (Coolify / Docker)

The project includes a production-ready `docker-compose.yml` pre-configured for Traefik routing.

1. Ensure Docker is installed.
2. In the root directory, run:
   ```bash
   docker-compose up -d --build
   ```
3. **Traefik Configuration**:
   The `rta-frontend` service is pre-labeled to automatically bind to `rta.cancellls.com` via Traefik and automatically requests Let's Encrypt certificates.

---

## 💻 Local Development

### Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```
*The backend will boot up on port `9876`.*

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*The Vite development server will boot on port `5173` or `80`.*

---

## 🔌 API Endpoints & WebSockets

- **WebSocket Stream**: `ws://localhost:9876/ws`
  - *Connect to this endpoint to receive live JSON payloads containing aircraft state vectors (`lat`, `long`, `velocity`, `callsign`, `true_track`).*
- **Healthcheck**: `GET /`
  - *Returns `{ "status": "ok" }` for load balancer probes.*

---

## 🔒 Environment Variables & Security

- `CLIENT_ID`: OpenSky OIDC Client Identity.
- `CLIENT_SECRET`: OpenSky OIDC Secret Key.

*Note: Ensure `.env` is properly populated when developing locally. The production environment injects these dynamically.*

---
*Built with precision for cancellations and live aerial monitoring.*
