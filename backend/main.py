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
                    # Fetch Global Data (No bounding box)
                    response = await client.get(OPENSKY_URL, timeout=15.0)
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
                                    "altitude": s[7] or 0,
                                    "velocity": s[9] or 0,
                                    "true_track": s[10] or 0,
                                    "squawk": str(s[14]) if s[14] is not None else ""
                                }
                                processed.append(flight_data)
                        
                        # Detect anomalies globally
                        emergencies = [f for f in processed if f["squawk"] in ["7700", "7600", "7500"]]
                        
                        # Calculate highest altitude and fastest flight globally
                        valid_altitudes = [f for f in processed if f["altitude"]]
                        valid_velocities = [f for f in processed if f["velocity"]]
                        
                        highest_flight = max(valid_altitudes, key=lambda x: x["altitude"]) if valid_altitudes else None
                        fastest_flight = max(valid_velocities, key=lambda x: x["velocity"]) if valid_velocities else None
                        
                        # --- DATA DECIMATION ENGINE ---
                        # Rendering 15,000 global flights crashes most browsers.
                        # We calculate stats on ALL 15k, but only send ~1,000 to the UI.
                        guaranteed_icao = {f["icao24"] for f in emergencies}
                        if highest_flight: guaranteed_icao.add(highest_flight["icao24"])
                        if fastest_flight: guaranteed_icao.add(fastest_flight["icao24"])
                        
                        guaranteed_flights = [f for f in processed if f["icao24"] in guaranteed_icao]
                        other_flights = [f for f in processed if f["icao24"] not in guaranteed_icao]
                        import hashlib
                        
                        def get_stable_id(f):
                            # Stable hash allows us to consistently pick the exact same flights globally
                            # without geographical bias, completely eliminating map flickering.
                            return int(hashlib.md5(f["icao24"].encode()).hexdigest(), 16)
                            
                        other_flights.sort(key=get_stable_id)
                        sampled_others = other_flights[:min(1000 - len(guaranteed_flights), len(other_flights))]
                        final_flights = guaranteed_flights + sampled_others
                        
                        payload = {
                            "total_flights": len(processed), # The true global count
                            "emergencies": emergencies,
                            "stats": {
                                "highest": highest_flight,
                                "fastest": fastest_flight
                            },
                            "flights": final_flights
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
