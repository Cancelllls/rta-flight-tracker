import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plane, AlertTriangle, Activity, Navigation, Mountain, Gauge, X, Crosshair, ArrowUp, ArrowDown, Radio, BarChart3, Globe, Radar, Briefcase, Menu } from 'lucide-react';

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
  vertical_rate: number;
  on_ground: boolean;
  geo_altitude: number;
  position_source: number;
}

interface FlightData {
  is_simulated?: boolean;
  total_flights: number;
  emergencies: Flight[];
  stats: {
    highest: Flight | null;
    fastest: Flight | null;
    phases: {
      climbing: number;
      descending: number;
      cruising: number;
      ground: number;
    };
    top_countries: { country: string; count: number }[];
    radar_networks: {
      adsb: number;
      asterix: number;
      mlat: number;
      flarm: number;
    };
    top_airlines: { airline: string; count: number }[];
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
    stats: { 
      highest: null, 
      fastest: null,
      phases: { climbing: 0, descending: 0, cruising: 0, ground: 0 },
      top_countries: [],
      radar_networks: { adsb: 0, asterix: 0, mlat: 0, flarm: 0 },
      top_airlines: []
    }, 
    flights: [] 
  });
  const [connected, setConnected] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<{origin: string, destination: string} | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Fetch route when a new flight is selected
  useEffect(() => {
    if (selectedFlight && selectedFlight.callsign && selectedFlight.callsign !== "UNKNOWN") {
      setRouteLoading(true);
      fetch(`/api/route/${selectedFlight.callsign}`)
        .then(res => res.json())
        .then(data => {
          setSelectedRoute(data);
          setRouteLoading(false);
        })
        .catch(err => {
          console.error("Failed to fetch route", err);
          setSelectedRoute(null);
          setRouteLoading(false);
        });
    } else {
      setSelectedRoute(null);
      setRouteLoading(false);
    }
  }, [selectedFlight?.callsign]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use the actual Traefik host (e.g. rta.cancellls.com) so the Nginx proxy_pass works
    const wsHost = window.location.port === '5173' ? 'localhost:9876' : window.location.host;
    const ws = new WebSocket(`${protocol}//${wsHost}/ws`);

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
    <div className="relative w-full h-screen bg-[#0a0a0a] font-sans text-slate-100 overflow-hidden flex flex-col">
      <div className="flex-1 flex overflow-hidden relative">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Left */}
      <div className={`fixed md:relative top-0 left-0 h-full w-[85%] max-w-sm md:w-96 bg-[#111]/95 md:bg-[#111]/80 backdrop-blur-xl border-r border-[#222] z-50 md:z-20 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
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
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest ${connected ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                <Activity size={12} className={connected ? "animate-pulse" : ""} />
                {connected ? "LIVE" : "OFFLINE"}
              </div>
              <button 
                className="md:hidden p-1.5 text-gray-400 hover:text-white rounded-full bg-[#222] hover:bg-[#333] transition-colors"
                onClick={() => setIsSidebarOpen(false)}
              >
                <X size={16} />
              </button>
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
              onClick={() => {
                if (data.stats.highest) {
                  setSelectedFlight(data.stats.highest);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }
              }}
              className="bg-[#111] border border-[#222] hover:border-purple-500/50 cursor-pointer transition-all hover:-translate-y-1 shadow-lg p-4 rounded-3xl flex flex-col group"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center mb-3">
                 <Mountain size={14} className="text-purple-500" />
              </div>
              <p className="text-2xl font-bold text-white">{data.stats.highest ? Math.round(data.stats.highest.altitude) : 0}</p>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Peak Alt (m)</p>
            </div>

            <div 
              onClick={() => {
                if (data.stats.fastest) {
                  setSelectedFlight(data.stats.fastest);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }
              }}
              className="bg-[#111] border border-[#222] hover:border-blue-500/50 cursor-pointer transition-all hover:-translate-y-1 shadow-lg p-4 rounded-3xl flex flex-col group"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mb-3">
                 <Gauge size={14} className="text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-white">{data.stats.fastest ? Math.round(data.stats.fastest.velocity * 3.6) : 0}</p>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Top Spd (km/h)</p>
            </div>
          </div>
          
          {/* Global Fleet Breakdown */}
          <div className="bg-[#111] border border-[#222] p-5 rounded-3xl relative shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={16} className="text-blue-500" />
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                Fleet Status Breakdown
              </h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-[#0a0a0a] border border-[#222] px-3 py-2 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5"><ArrowUp size={12} className="text-green-500"/> Climbing</span>
                <span className="font-mono text-sm font-bold text-gray-200">{data.stats.phases?.climbing.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between items-center bg-[#0a0a0a] border border-[#222] px-3 py-2 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5"><Activity size={12} className="text-blue-500"/> Cruising</span>
                <span className="font-mono text-sm font-bold text-gray-200">{data.stats.phases?.cruising.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between items-center bg-[#0a0a0a] border border-[#222] px-3 py-2 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5"><ArrowDown size={12} className="text-orange-500"/> Descending</span>
                <span className="font-mono text-sm font-bold text-gray-200">{data.stats.phases?.descending.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between items-center bg-[#0a0a0a] border border-[#222] px-3 py-2 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5"><Plane size={12} className="text-amber-500"/> On Ground</span>
                <span className="font-mono text-sm font-bold text-gray-200">{data.stats.phases?.ground.toLocaleString() || 0}</span>
              </div>
            </div>
          </div>

          {/* Top Origin Countries */}
          {data.stats.top_countries?.length > 0 && (
            <div className="bg-[#111] border border-[#222] p-5 rounded-3xl relative shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <Globe size={16} className="text-purple-500" />
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Top Origin Territories
                </h3>
              </div>
              
              <div className="space-y-2">
                {data.stats.top_countries.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center group">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-[10px] font-mono text-gray-600 font-bold">{idx + 1}.</span>
                      <span className="text-xs font-bold text-gray-300 truncate">{item.country}</span>
                    </div>
                    <span className="font-mono text-[11px] font-bold text-purple-400 shrink-0 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">{item.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Active Radar Networks */}
          <div className="bg-[#111] border border-[#222] p-5 rounded-3xl relative shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <Radar size={16} className="text-teal-500" />
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                Active Sensor Networks
              </h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-[#0a0a0a] border border-[#222] px-3 py-2 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase">ADS-B Transponders</span>
                <span className="font-mono text-sm font-bold text-teal-300">{data.stats.radar_networks?.adsb.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between items-center bg-[#0a0a0a] border border-[#222] px-3 py-2 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase">MLAT (Multilateration)</span>
                <span className="font-mono text-sm font-bold text-cyan-300">{data.stats.radar_networks?.mlat.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between items-center bg-[#0a0a0a] border border-[#222] px-3 py-2 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase">ASTERIX Radar</span>
                <span className="font-mono text-sm font-bold text-indigo-300">{data.stats.radar_networks?.asterix.toLocaleString() || 0}</span>
              </div>
            </div>
          </div>

          {/* Top Airline Operators */}
          {data.stats.top_airlines?.length > 0 && (
            <div className="bg-[#111] border border-[#222] p-5 rounded-3xl relative shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase size={16} className="text-amber-500" />
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Top Airline Operators
                </h3>
              </div>
              
              <div className="space-y-2">
                {data.stats.top_airlines.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center group">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-[10px] font-mono text-gray-600 font-bold">{idx + 1}.</span>
                      <span className="text-xs font-bold text-gray-300 truncate uppercase">{item.airline}</span>
                    </div>
                    <span className="font-mono text-[11px] font-bold text-amber-400 shrink-0 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">{item.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                      onClick={() => {
                        setSelectedFlight(e);
                        if (window.innerWidth < 768) setIsSidebarOpen(false);
                      }}
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
        {/* Mobile Menu Toggle Button */}
        <button 
          className="md:hidden absolute top-4 left-4 z-30 p-2.5 bg-[#111]/90 rounded-xl border border-[#222] shadow-xl text-white backdrop-blur-xl hover:bg-[#222] transition-colors"
          onClick={() => setIsSidebarOpen(true)}
        >
          <Menu size={20} />
        </button>

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
          <div className="absolute bottom-12 md:bottom-auto md:top-6 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-6 z-40 w-[calc(100%-2rem)] md:w-80 bg-[#111]/95 md:bg-[#111]/90 backdrop-blur-2xl border border-blue-500/30 p-1 rounded-3xl shadow-2xl shadow-blue-500/20 animate-in fade-in md:slide-in-from-right-4 duration-300">
             <div className="bg-[#0a0a0a]/80 md:bg-[#0a0a0a]/50 rounded-2xl p-4 md:p-5 max-h-[60vh] md:max-h-none overflow-y-auto custom-scrollbar">
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

               {/* Route Info */}
               <div className="mb-4 bg-gradient-to-br from-[#1a1a1a] to-[#0f0f0f] border border-[#2a2a2a] rounded-2xl p-4 shadow-inner">
                 <div className="flex items-center justify-between">
                   <div className="text-center flex-1 overflow-hidden">
                     <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-1.5">Origin</p>
                     <p className="font-mono text-xs font-bold text-gray-300 truncate px-1">
                       {routeLoading ? "..." : (selectedRoute?.origin || "Unknown")}
                     </p>
                   </div>
                   <div className="px-3 flex flex-col items-center justify-center">
                     <div className="h-[1px] w-8 bg-gradient-to-r from-transparent via-gray-600 to-transparent mb-1"></div>
                     <Plane size={12} className="text-blue-500/70" />
                   </div>
                   <div className="text-center flex-1 overflow-hidden">
                     <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-1.5">Destination</p>
                     <p className="font-mono text-xs font-bold text-gray-300 truncate px-1">
                       {routeLoading ? "..." : (selectedRoute?.destination || "Unknown")}
                     </p>
                   </div>
                 </div>
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
               <div className="grid grid-cols-2 gap-3">
                 <div className="bg-[#111] border border-[#222] rounded-xl p-3 flex flex-col gap-1 justify-center relative overflow-hidden group">
                   <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                     <Gauge size={12} className="text-blue-500" />
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Velocity</span>
                   </div>
                   <span className="font-mono font-bold text-blue-100">{Math.round(selectedFlight.velocity * 3.6)} km/h</span>
                 </div>

                 <div className="bg-[#111] border border-[#222] rounded-xl p-3 flex flex-col gap-1 justify-center relative overflow-hidden group">
                   <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                     <Mountain size={12} className="text-purple-500" />
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Baro Alt</span>
                   </div>
                   <span className="font-mono font-bold text-purple-100">{Math.round(selectedFlight.altitude)} m</span>
                 </div>

                 <div className="bg-[#111] border border-[#222] rounded-xl p-3 flex flex-col gap-1 justify-center relative overflow-hidden group">
                   <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                     <Navigation size={12} className="text-indigo-400" />
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Track</span>
                   </div>
                   <span className="font-mono font-bold text-indigo-100">{Math.round(selectedFlight.true_track)}°</span>
                 </div>

                 <div className="bg-[#111] border border-[#222] rounded-xl p-3 flex flex-col gap-1 justify-center relative overflow-hidden group">
                   <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                     {selectedFlight.vertical_rate > 0 ? (
                       <ArrowUp size={12} className="text-green-500" />
                     ) : selectedFlight.vertical_rate < 0 ? (
                       <ArrowDown size={12} className="text-orange-500" />
                     ) : (
                       <Activity size={12} className="text-gray-500" />
                     )}
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vert Rate</span>
                   </div>
                   <span className="font-mono font-bold text-gray-200">{selectedFlight.vertical_rate.toFixed(1)} m/s</span>
                 </div>

                 <div className="bg-[#111] border border-[#222] rounded-xl p-3 flex flex-col gap-1 justify-center relative overflow-hidden group">
                   <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                     <Crosshair size={12} className="text-teal-500" />
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Geo Alt</span>
                   </div>
                   <span className="font-mono font-bold text-teal-100">{Math.round(selectedFlight.geo_altitude)} m</span>
                 </div>

                 <div className="bg-[#111] border border-[#222] rounded-xl p-3 flex flex-col gap-1 justify-center relative overflow-hidden group">
                   <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                     <Radio size={12} className="text-yellow-500" />
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Radar</span>
                   </div>
                   <span className="font-mono font-bold text-yellow-100 text-[11px]">
                     {selectedFlight.position_source === 0 ? "ADS-B" : 
                      selectedFlight.position_source === 1 ? "ASTERIX" :
                      selectedFlight.position_source === 2 ? "MLAT" :
                      selectedFlight.position_source === 3 ? "FLARM" : "UAT"}
                   </span>
                 </div>
               </div>

               {selectedFlight.on_ground && (
                 <div className="mt-3 bg-amber-950/40 border border-amber-900/50 p-2 rounded-xl text-center">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Aircraft on Ground (Taxi)</span>
                 </div>
               )}

               <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#222]">
                  <div className="flex items-center gap-2">
                    <Crosshair size={14} className="text-gray-500" />
                    <span className="font-mono text-xs text-gray-500">HEX: {selectedFlight.icao24.toUpperCase()}</span>
                  </div>
               </div>
             </div>
          </div>
        )}
      </div>
      </div>

      {/* Live Telemetry Marquee */}
      <div className="h-8 bg-[#111] border-t border-[#222] flex items-center overflow-hidden shrink-0 w-full relative z-30 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.5)]">
        <div className="animate-marquee flex items-center gap-12 font-mono text-[10px] uppercase font-bold text-blue-500/80">
          
          {/* Ticker Content Chunk */}
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-12 shrink-0">
              {data.is_simulated ? (
                <span className="flex items-center gap-2 text-amber-500"><AlertTriangle size={10} className="animate-pulse" /> API RATE LIMIT EXCEEDED - OFFLINE SIMULATION ENGAGED</span>
              ) : (
                <span className="flex items-center gap-2 text-gray-500"><Activity size={10} className="text-emerald-500" /> SYSTEM STATUS: NOMINAL</span>
              )}
              <span>&gt;&gt;&gt;</span>
              {data.is_simulated ? (
                <span className="text-amber-500/70">GLOBAL DATA LINK: OFFLINE</span>
              ) : (
                <span>GLOBAL DATA LINK: SECURE</span>
              )}
              <span>&gt;&gt;&gt;</span>
              <span className="text-gray-300">ACTIVE TARGETS TRACKED: {data.total_flights.toLocaleString()}</span>
              <span>&gt;&gt;&gt;</span>
              {data.emergencies.length > 0 ? (
                <span className="text-red-400 flex items-center gap-2"><AlertTriangle size={10} className="animate-pulse" /> {data.emergencies.length} EMERGENCY SQUAWKS DETECTED IN AIRSPACE</span>
              ) : (
                <span className="text-gray-500">NO ACTIVE EMERGENCIES DETECTED</span>
              )}
              <span>&gt;&gt;&gt;</span>
              <span>PEAK FLIGHT ALTITUDE: {data.stats.highest ? Math.round(data.stats.highest.altitude) : 0}m</span>
              <span>&gt;&gt;&gt;</span>
              <span>MAX VELOCITY DETECTED: {data.stats.fastest ? Math.round(data.stats.fastest.velocity * 3.6) : 0} km/h</span>
              <span>&gt;&gt;&gt;</span>
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}

export default App;
