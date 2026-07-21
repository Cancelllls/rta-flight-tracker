import asyncio
import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import math
import uuid
import random
import json
import os

app = FastAPI(title="Flight Tracker RTA")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENSKY_URL = "https://opensky-network.org/api/states/all"
OPENSKY_AUTH_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"

CLIENT_ID = "cancellls-api-client"
CLIENT_SECRET = "IIK7MQDvxugLeyn7y1zYn4rT2Adh7xST"

class TokenManager:
    def __init__(self):
        self.token = None
        self.lock = asyncio.Lock()

    async def get_token(self, force_refresh=False):
        async with self.lock:
            if self.token and not force_refresh:
                return self.token
                
            async with httpx.AsyncClient() as client:
                try:
                    res = await client.post(
                        OPENSKY_AUTH_URL,
                        data={
                            "grant_type": "client_credentials",
                            "client_id": CLIENT_ID,
                            "client_secret": CLIENT_SECRET
                        },
                        headers={"Content-Type": "application/x-www-form-urlencoded"}
                    )
                    if res.status_code == 200:
                        self.token = res.json().get("access_token")
                        print("Successfully authenticated with OpenSky OAuth2!")
                        return self.token
                    else:
                        print(f"Failed to fetch token: {res.status_code} {res.text}")
                except Exception as e:
                    print(f"Auth error: {e}")
            return None

token_manager = TokenManager()

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

# --- MOCK SIMULATION ENGINE ---
# When OpenSky blocks the IP for high polling, we fall back to a seamless local 
# simulation of 15,000 global aircraft that actually move physically correctly.
mock_flights = []
def init_mock_flights():
    if mock_flights: return
    for _ in range(15000):
        mock_flights.append({
            "icao24": uuid.uuid4().hex[:6].upper(),
            "callsign": f"SIM{random.randint(100, 9999)}",
            "origin_country": random.choice(["United States", "Germany", "Japan", "Brazil", "Australia"]),
            "longitude": random.uniform(-180, 180),
            "latitude": random.uniform(-80, 80),
            "altitude": random.uniform(5000, 13000),
            "geo_altitude": random.uniform(5200, 13200),
            "velocity": random.uniform(200, 280), # m/s
            "true_track": random.uniform(0, 360),
            "vertical_rate": random.uniform(-15, 15),
            "on_ground": False,
            "position_source": 0,
            "squawk": "1200" if random.random() > 0.005 else random.choice(["7700", "7600", "7500"])
        })

def update_mock_flights():
    init_mock_flights()
    
    # Simulate planes landing / exiting airspace
    for _ in range(random.randint(20, 80)):
        if mock_flights:
            mock_flights.pop(random.randint(0, len(mock_flights)-1))
            
    # Simulate planes taking off
    for _ in range(random.randint(20, 80)):
        mock_flights.append({
            "icao24": uuid.uuid4().hex[:6].upper(),
            "callsign": f"SIM{random.randint(100, 9999)}",
            "origin_country": random.choice(["United States", "Germany", "Japan", "Brazil", "Australia"]),
            "longitude": random.uniform(-180, 180),
            "latitude": random.uniform(-80, 80),
            "altitude": random.uniform(5000, 13500), # Altitude naturally fluctuates
            "geo_altitude": random.uniform(5200, 13700),
            "velocity": random.uniform(200, 295), # Up to 1062 km/h
            "true_track": random.uniform(0, 360),
            "vertical_rate": random.uniform(-15, 15),
            "on_ground": False,
            "position_source": 0,
            "squawk": "1200" if random.random() > 0.005 else random.choice(["7700", "7600", "7500"])
        })
        
    for f in mock_flights:
        # Move planes based on their real velocity and heading for 3 seconds (matched to WS poll rate)
        distance_m = f["velocity"] * 3
        dist_deg = distance_m / 111000.0
        rad = math.radians(f["true_track"])
        f["latitude"] += math.cos(rad) * dist_deg
        f["longitude"] += math.sin(rad) * dist_deg
        
        # World wrapping
        if f["longitude"] > 180: f["longitude"] -= 360
        if f["longitude"] < -180: f["longitude"] += 360
        if f["latitude"] > 90: f["latitude"] = 180 - f["latitude"]; f["true_track"] = (f["true_track"] + 180) % 360
        if f["latitude"] < -90: f["latitude"] = -180 - f["latitude"]; f["true_track"] = (f["true_track"] + 180) % 360
    return mock_flights

async def fetch_flight_data():
    """Background task to fetch data from OpenSky and broadcast it"""
    async with httpx.AsyncClient() as client:
        while True:
            if manager.active_connections:
                try:
                    is_simulated = False
                    try:
                        token = await token_manager.get_token()
                        headers = {"Authorization": f"Bearer {token}"} if token else {}
                        
                        # Fetch Global Data (No bounding box)
                        response = await client.get(OPENSKY_URL, headers=headers, timeout=15.0)
                        
                        if response.status_code == 401:
                            # Token expired, refresh and retry
                            token = await token_manager.get_token(force_refresh=True)
                            headers = {"Authorization": f"Bearer {token}"} if token else {}
                            response = await client.get(OPENSKY_URL, headers=headers, timeout=15.0)

                        if response.status_code == 200:
                            data = response.json()
                            states = data.get("states", [])
                            
                            # Process and map data
                            processed = []
                            for s in (states or []):
                                if s[5] is not None and s[6] is not None:
                                    flight_data = {
                                        "icao24": s[0],
                                        "callsign": s[1].strip() if s[1] else "UNKNOWN",
                                        "origin_country": s[2],
                                        "longitude": s[5],
                                        "latitude": s[6],
                                        "altitude": s[7] or 0,
                                        "on_ground": s[8] if len(s) > 8 and s[8] is not None else False,
                                        "velocity": s[9] or 0,
                                        "true_track": s[10] or 0,
                                        "vertical_rate": s[11] or 0,
                                        "geo_altitude": s[13] if len(s) > 13 and s[13] is not None else (s[7] or 0),
                                        "squawk": str(s[14]) if len(s) > 14 and s[14] is not None else "",
                                        "position_source": s[16] if len(s) > 16 and s[16] is not None else 0
                                    }
                                    processed.append(flight_data)
                        else:
                            is_simulated = True
                            processed = update_mock_flights()
                    except Exception as req_e:
                        print(f"Request Error: {req_e}")
                        is_simulated = True
                        processed = update_mock_flights()
                        
                    # Detect anomalies globally
                    emergencies = [f for f in processed if f["squawk"] in ["7700", "7600", "7500"]]
                    
                    # Calculate highest altitude and fastest flight globally
                    valid_altitudes = [f for f in processed if f["altitude"]]
                    valid_velocities = [f for f in processed if f["velocity"]]
                    
                    highest_flight = max(valid_altitudes, key=lambda x: x["altitude"]) if valid_altitudes else None
                    fastest_flight = max(valid_velocities, key=lambda x: x["velocity"]) if valid_velocities else None
                    
                    # Calculate flight phases
                    climbing = sum(1 for f in processed if not f["on_ground"] and f["vertical_rate"] > 1.5)
                    descending = sum(1 for f in processed if not f["on_ground"] and f["vertical_rate"] < -1.5)
                    cruising = sum(1 for f in processed if not f["on_ground"] and -1.5 <= f["vertical_rate"] <= 1.5)
                    ground = sum(1 for f in processed if f["on_ground"])
                    
                    # Calculate top countries
                    from collections import Counter
                    country_counts = Counter(f["origin_country"] for f in processed if f["origin_country"])
                    top_countries = [{"country": k, "count": v} for k, v in country_counts.most_common(5)]
                    
                    # Calculate radar networks
                    adsb = sum(1 for f in processed if f.get("position_source") == 0)
                    asterix = sum(1 for f in processed if f.get("position_source") == 1)
                    mlat = sum(1 for f in processed if f.get("position_source") == 2)
                    flarm = sum(1 for f in processed if f.get("position_source") == 3)
                    
                    # Calculate top airlines
                    airline_map = {
                        "AAL": "American", "DAL": "Delta", "UAL": "United",
                        "SWA": "Southwest", "RYR": "Ryanair", "UAE": "Emirates",
                        "AFR": "Air France", "BAW": "British Airways", "DLH": "Lufthansa",
                        "KLM": "KLM", "FDX": "FedEx", "UPS": "UPS", "QFA": "Qantas",
                        "ACA": "Air Canada", "JBU": "JetBlue", "ASA": "Alaska Airlines",
                        "THY": "Turkish Airlines", "QTR": "Qatar Airways", "CPA": "Cathay",
                        "SIA": "Singapore", "ANA": "ANA", "JAL": "Japan Airlines",
                        "EZY": "easyJet", "WZZ": "Wizz Air", "IGO": "IndiGo"
                    }
                    
                    airline_codes = [f["callsign"][:3] for f in processed if f.get("callsign") and len(f["callsign"]) >= 3 and f["callsign"][:3].isalpha()]
                    airline_counts = Counter(airline_codes)
                    top_airlines = [{"airline": airline_map.get(k, k), "count": v} for k, v in airline_counts.most_common(5)]
                    
                    # --- DATA DECIMATION ENGINE ---
                    guaranteed_icao = {f["icao24"] for f in emergencies}
                    if highest_flight: guaranteed_icao.add(highest_flight["icao24"])
                    if fastest_flight: guaranteed_icao.add(fastest_flight["icao24"])
                    
                    guaranteed_flights = [f for f in processed if f["icao24"] in guaranteed_icao]
                    other_flights = [f for f in processed if f["icao24"] not in guaranteed_icao]
                    import hashlib
                    
                    def get_stable_id(f):
                        return int(hashlib.md5(f["icao24"].encode()).hexdigest(), 16)
                        
                    other_flights.sort(key=get_stable_id)
                    sampled_others = other_flights[:min(1000 - len(guaranteed_flights), len(other_flights))]
                    final_flights = guaranteed_flights + sampled_others
                    
                    payload = {
                        "is_simulated": is_simulated,
                        "total_flights": len(processed), # The true global count
                        "emergencies": emergencies,
                        "stats": {
                            "highest": highest_flight,
                            "fastest": fastest_flight,
                            "phases": {
                                "climbing": climbing,
                                "descending": descending,
                                "cruising": cruising,
                                "ground": ground
                            },
                            "top_countries": top_countries,
                            "radar_networks": {
                                "adsb": adsb,
                                "asterix": asterix,
                                "mlat": mlat,
                                "flarm": flarm
                            },
                            "top_airlines": top_airlines
                        },
                        "flights": final_flights
                    }
                    
                    await manager.broadcast(payload)
                except Exception as e:
                    print(f"Critical Error in main loop: {e}")
            
            # Update frequency (hyper-fast 3s tick rate)
            await asyncio.sleep(3)

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

# Load airports db into memory
AIRPORTS_DB = {}
try:
    with open("airports.json", "r") as f:
        AIRPORTS_DB = json.load(f)
except Exception as e:
    print("Warning: Could not load airports.json", e)

@app.get("/api/route/{callsign}")
async def get_flight_route(callsign: str):
    """Fetches the origin and destination of a specific flight callsign"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"https://opensky-network.org/api/routes?callsign={callsign}", timeout=5.0)
            if response.status_code == 200:
                data = response.json()
                route = data.get("route", [])
                if len(route) >= 2:
                    origin_icao = route[0]
                    dest_icao = route[-1]
                    
                    origin_airport = AIRPORTS_DB.get(origin_icao, {})
                    dest_airport = AIRPORTS_DB.get(dest_icao, {})
                    
                    origin_str = origin_airport.get("city", origin_icao)
                    if origin_airport.get("iata"): origin_str += f" ({origin_airport['iata']})"
                    
                    dest_str = dest_airport.get("city", dest_icao)
                    if dest_airport.get("iata"): dest_str += f" ({dest_airport['iata']})"
                    
                    return {"origin": origin_str, "destination": dest_str}
    except Exception as e:
        print(f"Error fetching route for {callsign}: {e}")
        
    return {"origin": "Unknown", "destination": "Unknown"}
