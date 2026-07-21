import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plane, AlertTriangle, Activity, Mountain, Gauge, X, Crosshair } from 'lucide-react';

const planeSvg = (color: string) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}">
  <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
</svg>`;

const createIcon = (color: string, track: number, scale: number = 1) => L.divIcon({
  html: `<div style="transform: rotate(${track}deg) scale(${scale}); width: 24px; height: 24px; transition: transform 0.3s ease;">${planeSvg(color)}</div>`,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

interface Flight {
  icao24: string;
  callsign: string;
  origin_country: string;
  longitude: number;
  latitude: number;
  altitude: number;
  velocity: number;
  true_track: number;
  squawk: string;
}

interface FlightData {
  total_flights: number;
  emergencies: Flight[];
  stats: {
    highest: Flight | null;
    fastest: Flight | null;
  };
  flights: Flight[];
}

function FlyToTracker({ selectedFlight }: { selectedFlight: Flight | null }) {
  const map = useMap();
  useEffect(() => {
    if (selectedFlight) {
      map.flyTo([selectedFlight.latitude, selectedFlight.longitude], 7, { animate: true, duration: 1.5 });
    }
  }, [selectedFlight, map]);
  return null;
}

function App() {
  const [data, setData] = useState<FlightData>({ 
    total_flights: 0, 
    emergencies: [], 
    stats: { highest: null, fastest: null }, 
    flights: [] 
  });
  const [connected, setConnected] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.port === '5173' ? `${window.location.hostname}:9876/ws` : `${window.location.host}/ws`;
    const ws = new WebSocket(`${protocol}//${wsHost}`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setData(payload);
        // Update selected flight live data if selected
        if (selectedFlight) {
          const updated = payload.flights.find((f: Flight) => f.icao24 === selectedFlight.icao24);
          if (updated) setSelectedFlight(updated);
        }
      } catch (err) {
        console.error("Error parsing WS message", err);
      }
    };

    return () => ws.close();
  }, [selectedFlight]);

  return (
    <div className="relative w-full h-screen bg-[#0a0a0a] font-sans text-slate-100 overflow-hidden flex">
      {/* Sidebar - Left */}
      <div className="w-96 h-full bg-[#111]/80 backdrop-blur-xl border-r border-[#222] z-20 flex flex-col shadow-2xl relative">
        <div className="p-6 border-b border-[#222]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
                <rect width="100" height="100" rx="20" className="fill-[#111] border border-[#333]"></rect>
                <path d="M65 35C55 25 35 25 35 50C35 75 55 75 65 65" stroke="currentColor" className="text-white" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"></path>
                <circle cx="75" cy="65" r="8" fill="#3b82f6"></circle>
              </svg>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Flight View
              </h1>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest ${connected ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              <Activity size={12} className={connected ? "animate-pulse" : ""} />
              {connected ? "LIVE" : "OFFLINE"}
            </div>
          </div>
          <p className="text-xs text-gray-500 uppercase tracking-widest font-medium">Global Airspace Monitoring</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Main Stat */}
          <div className="bg-[#111] border border-[#222] p-5 rounded-3xl shadow-lg relative overflow-hidden group hover:border-blue-500/50 transition-colors">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl -mr-10 -mt-10 rounded-full group-hover:bg-blue-500/20 transition-colors"></div>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
               <Plane size={20} className="text-blue-500" />
            </div>
            <p className="text-5xl font-black tracking-tighter text-white">{data.total_flights.toLocaleString()}</p>
            <p className="text-xs text-gray-400 font-medium mt-1">Active Targets</p>
          </div>

          {/* Grid Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div 
              onClick={() => data.stats.highest && setSelectedFlight(data.stats.highest)}
              className="bg-[#111] border border-[#222] hover:border-purple-500/50 cursor-pointer transition-all hover:-translate-y-1 shadow-lg p-4 rounded-3xl flex flex-col group"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center mb-3">
                 <Mountain size={14} className="text-purple-500" />
              </div>
              <p className="text-2xl font-bold text-white">{data.stats.highest ? Math.round(data.stats.highest.altitude) : 0}</p>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Peak Alt (m)</p>
            </div>

            <div 
              onClick={() => data.stats.fastest && setSelectedFlight(data.stats.fastest)}
              className="bg-[#111] border border-[#222] hover:border-blue-500/50 cursor-pointer transition-all hover:-translate-y-1 shadow-lg p-4 rounded-3xl flex flex-col group"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mb-3">
                 <Gauge size={14} className="text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-white">{data.stats.fastest ? Math.round(data.stats.fastest.velocity * 3.6) : 0}</p>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Top Spd (km/h)</p>
            </div>
          </div>
          
          {/* Emergencies */}
          <div className="relative">
            {data.emergencies.length > 0 && <div className="absolute -inset-1 bg-red-500/20 blur-xl rounded-full"></div>}
            <div className={`border ${data.emergencies.length > 0 ? 'bg-red-950/40 border-red-500/50' : 'bg-[#111] border-[#222]'} p-5 rounded-3xl relative transition-all shadow-lg`}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} className={data.emergencies.length > 0 ? "text-red-500 animate-pulse" : "text-gray-600"} />
                <h3 className={`text-[11px] font-bold uppercase tracking-widest ${data.emergencies.length > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  Critical Squawks
                </h3>
              </div>
              
              {data.emergencies.length === 0 ? (
                <p className="text-sm text-gray-500 font-medium">No active emergencies detected.</p>
              ) : (
                <div className="space-y-2">
                  {data.emergencies.map(e => (
                    <div 
                      key={e.icao24} 
                      onClick={() => setSelectedFlight(e)}
                      className="group flex items-center justify-between p-3 bg-red-950/60 border border-red-900/50 rounded-2xl cursor-pointer hover:bg-red-900/40 transition-colors"
                    >
                      <div>
                        <p className="font-mono font-bold text-red-100 group-hover:text-white transition-colors">{e.callsign}</p>
                        <p className="text-[10px] text-red-400 uppercase">{e.origin_country}</p>
                      </div>
                      <div className="bg-red-500/20 px-2 py-1 rounded-lg text-red-400 font-black font-mono text-xs border border-red-500/30">
                        {e.squawk}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[#222] text-center">
           <p className="text-[10px] text-gray-600 font-medium">© 2026 Cancellls. All rights reserved.</p>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative bg-[#0a0a0a]">
        <MapContainer 
          center={[39.8283, -98.5795]} 
          zoom={5} 
          style={{ width: '100%', height: '100%', zIndex: 10, background: '#0a0a0a' }}
          zoomControl={false}
        >
          <FlyToTracker selectedFlight={selectedFlight} />
          
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
            attribution='&copy; CARTO'
          />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
            attribution='&copy; CARTO'
            pane="markerPane"
          />
          
          {data.flights.map((flight) => {
            const isEmergency = ["7700", "7600", "7500"].includes(flight.squawk);
            const isSelected = selectedFlight?.icao24 === flight.icao24;
            
            let color = "#4b5563"; // gray-600
            let scale = 1;

            if (isEmergency) {
              color = "#ef4444"; // red-500
              scale = 1.3;
            } else if (isSelected) {
              color = "#3b82f6"; // blue-500 (Cancellls brand)
              scale = 1.5;
            } else if (flight.altitude > 10000) {
              color = "#a855f7"; // purple-500 (Cancellls brand)
            }

            return (
              <Marker 
                key={flight.icao24} 
                position={[flight.latitude, flight.longitude]}
                icon={createIcon(color, flight.true_track || 0, scale)}
                eventHandlers={{ click: () => setSelectedFlight(flight) }}
              />
            )
          })}
        </MapContainer>

        {/* Selected Flight Floating Panel */}
        {selectedFlight && (
          <div className="absolute top-6 right-6 z-20 w-80 bg-[#111]/90 backdrop-blur-2xl border border-blue-500/30 p-1 rounded-3xl shadow-2xl shadow-blue-500/20 animate-in fade-in slide-in-from-right-4 duration-300">
             <div className="bg-[#0a0a0a]/50 rounded-2xl p-5">
               <div className="flex items-start justify-between mb-4">
                 <div>
                   <div className="flex items-center gap-2 mb-1">
                     <Plane size={16} className={["7700", "7600", "7500"].includes(selectedFlight.squawk) ? "text-red-500" : "text-blue-500"} />
                     <h2 className="text-2xl font-black font-mono tracking-tight text-white">{selectedFlight.callsign}</h2>
                   </div>
                   <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{selectedFlight.origin_country}</p>
                 </div>
                 <button 
                   onClick={() => setSelectedFlight(null)}
                   className="p-1.5 hover:bg-[#222] rounded-full text-gray-400 hover:text-white transition-colors"
                 >
                   <X size={16} />
                 </button>
               </div>

               {/* Emergency Banner */}
               {["7700", "7600", "7500"].includes(selectedFlight.squawk) && (
                 <div className="mb-4 bg-red-950/60 border border-red-500/50 rounded-xl p-3">
                   <div className="flex items-center gap-2 mb-1">
                     <AlertTriangle size={14} className="text-red-500 animate-pulse" />
                     <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Active Emergency</span>
                   </div>
                   <p className="text-[10px] text-red-200 leading-relaxed mt-1">
                     {selectedFlight.squawk === "7700" && "Squawk 7700: General Emergency. Aircraft is in distress and requires immediate ATC priority."}
                     {selectedFlight.squawk === "7600" && "Squawk 7600: Radio Failure. Aircraft has lost communication with Air Traffic Control."}
                     {selectedFlight.squawk === "7500" && "Squawk 7500: Hijacking/Unlawful Interference. Aircraft is under duress."}
                   </p>
                 </div>
               )}

               <div className="space-y-4">
                 <div className="bg-[#111] border border-[#222] rounded-2xl p-3 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                     <Gauge size={14} className="text-blue-500" />
                     <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Velocity</span>
                   </div>
                   <span className="font-mono font-bold text-blue-100">{Math.round(selectedFlight.velocity * 3.6)} km/h</span>
                 </div>

                 <div className="bg-[#111] border border-[#222] rounded-2xl p-3 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                     <Mountain size={14} className="text-purple-500" />
                     <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Altitude</span>
                   </div>
                   <span className="font-mono font-bold text-purple-100">{Math.round(selectedFlight.altitude)} m</span>
                 </div>

                 {/* Manifest Info (Radar Only) */}
                 <div className="bg-[#111] border border-[#222] rounded-2xl p-3 space-y-2">
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Route</span>
                     <span className="text-[10px] font-bold text-gray-600 bg-[#222] px-2 py-0.5 rounded">RADAR ONLY</span>
                   </div>
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Takeoff</span>
                     <span className="text-[10px] font-bold text-gray-600 bg-[#222] px-2 py-0.5 rounded">UNAVAILABLE</span>
                   </div>
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">ETA</span>
                     <span className="text-[10px] font-bold text-gray-600 bg-[#222] px-2 py-0.5 rounded">UNKNOWN</span>
                   </div>
                 </div>

                 <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#222]">
                    <Crosshair size={14} className="text-gray-500" />
                    <span className="font-mono text-xs text-gray-500">HEX: {selectedFlight.icao24.toUpperCase()}</span>
                 </div>
               </div>
             </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
