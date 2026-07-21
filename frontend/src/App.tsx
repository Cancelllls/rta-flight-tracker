import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plane, AlertTriangle, Activity, Navigation, Mountain, Gauge, X, Crosshair } from 'lucide-react';

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
    <div className="relative w-full h-screen bg-[#050505] font-sans text-slate-100 overflow-hidden flex">
      {/* Sidebar - Left */}
      <div className="w-96 h-full bg-slate-950/80 backdrop-blur-xl border-r border-slate-800/50 z-20 flex flex-col shadow-2xl relative">
        <div className="p-6 border-b border-slate-800/50">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-black bg-gradient-to-br from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent uppercase tracking-tight">
              C.<span className="font-light text-slate-400 text-lg ml-1">Real Time Flight View</span>
            </h1>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest ${connected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              <Activity size={12} className={connected ? "animate-pulse" : ""} />
              {connected ? "LIVE" : "OFFLINE"}
            </div>
          </div>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-medium">Global Airspace Monitoring</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Main Stat */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-900/50 border border-slate-800/80 p-5 rounded-2xl shadow-inner relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl -mr-10 -mt-10 rounded-full"></div>
            <Plane size={20} className="text-indigo-400 mb-3" />
            <p className="text-5xl font-black tracking-tighter">{data.total_flights.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Active Targets</p>
          </div>

          {/* Grid Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div 
              onClick={() => data.stats.highest && setSelectedFlight(data.stats.highest)}
              className="bg-slate-900/50 border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition-colors p-4 rounded-2xl flex flex-col"
            >
              <Mountain size={16} className="text-cyan-400 mb-2" />
              <p className="text-xl font-bold">{data.stats.highest ? Math.round(data.stats.highest.altitude) : 0}</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Peak Alt (m)</p>
            </div>

            <div 
              onClick={() => data.stats.fastest && setSelectedFlight(data.stats.fastest)}
              className="bg-slate-900/50 border border-slate-800 hover:border-emerald-500/50 cursor-pointer transition-colors p-4 rounded-2xl flex flex-col"
            >
              <Gauge size={16} className="text-emerald-400 mb-2" />
              <p className="text-xl font-bold">{data.stats.fastest ? Math.round(data.stats.fastest.velocity * 3.6) : 0}</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Top Spd (km/h)</p>
            </div>
          </div>
          
          {/* Emergencies */}
          <div className="relative">
            {data.emergencies.length > 0 && <div className="absolute -inset-1 bg-red-500/20 blur-xl rounded-full"></div>}
            <div className={`border ${data.emergencies.length > 0 ? 'bg-red-950/40 border-red-500/50' : 'bg-slate-900/50 border-slate-800'} p-5 rounded-2xl relative transition-all`}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={16} className={data.emergencies.length > 0 ? "text-red-500 animate-pulse" : "text-slate-600"} />
                <h3 className={`text-[11px] font-bold uppercase tracking-widest ${data.emergencies.length > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                  Critical Squawks
                </h3>
              </div>
              
              {data.emergencies.length === 0 ? (
                <p className="text-sm text-slate-600 font-medium">No active emergencies detected.</p>
              ) : (
                <div className="space-y-2">
                  {data.emergencies.map(e => (
                    <div 
                      key={e.icao24} 
                      onClick={() => setSelectedFlight(e)}
                      className="group flex items-center justify-between p-3 bg-red-950/60 border border-red-900/50 rounded-xl cursor-pointer hover:bg-red-900/40 transition-colors"
                    >
                      <div>
                        <p className="font-mono font-bold text-red-100 group-hover:text-white transition-colors">{e.callsign}</p>
                        <p className="text-[10px] text-red-400 uppercase">{e.origin_country}</p>
                      </div>
                      <div className="bg-red-500/20 px-2 py-1 rounded text-red-400 font-black font-mono text-xs border border-red-500/30">
                        {e.squawk}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800/50 text-center">
           <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Cancellls Portfolio System v2.0</p>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative bg-[#050505]">
        <MapContainer 
          center={[39.8283, -98.5795]} 
          zoom={5} 
          style={{ width: '100%', height: '100%', zIndex: 10 }}
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
            
            let color = "#64748b"; // slate-500
            let scale = 1;

            if (isEmergency) {
              color = "#ef4444"; // red-500
              scale = 1.3;
            } else if (isSelected) {
              color = "#22d3ee"; // cyan-400
              scale = 1.5;
            } else if (flight.altitude > 10000) {
              color = "#818cf8"; // indigo-400
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
          <div className="absolute top-6 right-6 z-20 w-80 bg-slate-900/90 backdrop-blur-2xl border border-cyan-500/30 p-1 rounded-3xl shadow-2xl shadow-cyan-900/20 animate-in fade-in slide-in-from-right-4 duration-300">
             <div className="bg-slate-950/50 rounded-2xl p-5">
               <div className="flex items-start justify-between mb-6">
                 <div>
                   <div className="flex items-center gap-2 mb-1">
                     <Plane size={16} className="text-cyan-400" />
                     <h2 className="text-2xl font-black font-mono tracking-tight">{selectedFlight.callsign}</h2>
                   </div>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedFlight.origin_country}</p>
                 </div>
                 <button 
                   onClick={() => setSelectedFlight(null)}
                   className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                 >
                   <X size={16} />
                 </button>
               </div>

               <div className="space-y-4">
                 <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                     <Gauge size={14} className="text-emerald-400" />
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Velocity</span>
                   </div>
                   <span className="font-mono font-bold text-emerald-100">{Math.round(selectedFlight.velocity * 3.6)} km/h</span>
                 </div>

                 <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                     <Mountain size={14} className="text-indigo-400" />
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Altitude</span>
                   </div>
                   <span className="font-mono font-bold text-indigo-100">{Math.round(selectedFlight.altitude)} m</span>
                 </div>

                 <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                     <Navigation size={14} className="text-cyan-400" />
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Track</span>
                   </div>
                   <span className="font-mono font-bold text-cyan-100">{Math.round(selectedFlight.true_track)}°</span>
                 </div>

                 <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-800">
                    <Crosshair size={14} className="text-slate-500" />
                    <span className="font-mono text-xs text-slate-500">HEX: {selectedFlight.icao24.toUpperCase()}</span>
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
