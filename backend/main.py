import asyncio
import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List

app = FastAPI(title="Flight Tracker RTA")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENSKY_URL = "https://opensky-network.org/api/states/all"

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

async def fetch_flight_data():
    """Background task to fetch data from OpenSky and broadcast it"""
    async with httpx.AsyncClient() as client:
        while True:
            if manager.active_connections:
                try:
                    # Bounding box for Europe/US or globally. Global is huge, let's limit to a bounding box for performance.
                    # Bounding box covering contiguous USA: lamin=24.396308&lomin=-124.848974&lamax=49.384358&lomax=-66.93457
                    params = {
                        "lamin": 24.39,
                        "lomin": -124.84,
                        "lamax": 49.38,
                        "lomax": -66.93
                    }
                    response = await client.get(OPENSKY_URL, params=params, timeout=10.0)
                    if response.status_code == 200:
                        data = response.json()
                        states = data.get("states", [])
                        
                        # Process and map data
                        processed = []
                        for s in (states or []):
                            # Ensure we have valid lat/lon
                            if s[5] is not None and s[6] is not None:
                                flight_data = {
                                    "icao24": s[0],
                                    "callsign": s[1].strip() if s[1] else "UNKNOWN",
                                    "origin_country": s[2],
                                    "longitude": s[5],
                                    "latitude": s[6],
                                    "altitude": s[7], # Baro altitude
                                    "velocity": s[9],
                                    "true_track": s[10], # Heading
                                    "squawk": s[14]
                                }
                                processed.append(flight_data)
                        
                        # Detect anomalies
                        emergencies = [f for f in processed if f["squawk"] in ["7700", "7600", "7500"]]
                        
                        # Calculate highest altitude and fastest flight
                        valid_altitudes = [f for f in processed if f["altitude"] is not None]
                        valid_velocities = [f for f in processed if f["velocity"] is not None]
                        
                        highest_flight = max(valid_altitudes, key=lambda x: x["altitude"]) if valid_altitudes else None
                        fastest_flight = max(valid_velocities, key=lambda x: x["velocity"]) if valid_velocities else None
                        
                        payload = {
                            "total_flights": len(processed),
                            "emergencies": emergencies,
                            "stats": {
                                "highest": highest_flight,
                                "fastest": fastest_flight
                            },
                            "flights": processed
                        }
                        
                        await manager.broadcast(payload)
                except Exception as e:
                    print(f"Error fetching data: {e}")
            
            # OpenSky allows unauthenticated requests every 10 seconds
            await asyncio.sleep(10)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(fetch_flight_data())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We just keep the connection open, frontend doesn't need to send anything
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Flight Tracker RTA Backend Running"}
