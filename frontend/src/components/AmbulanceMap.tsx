import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MapProps {
  ambulancePosition: [number, number];
  hospitalPosition: [number, number];
  route: [number, number][];
  isEmergency: boolean;
  rid?: string;
  signals?: Array<{ id: string; name: string; junction: string; color: string; lat: number; lng: number }>;
  simulateMovement?: boolean;
}

// Simulated GPS route coordinates (Delhi area)
const SIMULATED_ROUTE: [number, number][] = [
  [28.6139, 77.2090], // Start - Connaught Place
  [28.6155, 77.2100],
  [28.6170, 77.2115],
  [28.6185, 77.2130],
  [28.6200, 77.2145], // Signal 1
  [28.6215, 77.2160],
  [28.6230, 77.2175],
  [28.6245, 77.2190],
  [28.6260, 77.2205], // Signal 2
  [28.6275, 77.2220],
  [28.6290, 77.2235],
  [28.6305, 77.2250],
  [28.6320, 77.2265], // Signal 3
  [28.6335, 77.2280],
  [28.6350, 77.2295],
  [28.6365, 77.2310],
  [28.6380, 77.2325], // End - Hospital
];

const AmbulanceMap: React.FC<MapProps> = ({
  ambulancePosition,
  hospitalPosition,
  route,
  isEmergency,
  rid,
  signals = [],
  simulateMovement = false,
}) => {
  const [currentPosition, setCurrentPosition] = useState<[number, number]>(ambulancePosition);
  const [positionIndex, setPositionIndex] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const ambulanceMarkerRef = useRef<L.Marker | null>(null);
  const hospitalMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const signalMarkersRef = useRef<L.Marker[]>([]);
  const trailPolylineRef = useRef<L.Polyline | null>(null);
  const trailPointsRef = useRef<[number, number][]>([]);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Simulate ambulance movement
  useEffect(() => {
    if (simulateMovement && isEmergency) {
      setIsSimulating(true);
      setPositionIndex(0);
      
      simulationIntervalRef.current = setInterval(() => {
        setPositionIndex(prev => {
          const next = prev + 1;
          if (next >= SIMULATED_ROUTE.length) {
            if (simulationIntervalRef.current) {
              clearInterval(simulationIntervalRef.current);
            }
            setIsSimulating(false);
            return prev;
          }
          setCurrentPosition(SIMULATED_ROUTE[next]);
          return next;
        });
      }, 2000);
    } else {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
      setIsSimulating(false);
      setPositionIndex(0);
      setCurrentPosition(ambulancePosition);
    }

    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
    };
  }, [simulateMovement, isEmergency]);

  // Update position from props when not simulating
  useEffect(() => {
    if (!isSimulating) {
      setCurrentPosition(ambulancePosition);
    }
  }, [ambulancePosition, isSimulating]);

  useEffect(() => {
    // Initialize map with dark theme
    if (!mapRef.current) {
      mapRef.current = L.map('map', {
        center: ambulancePosition,
        zoom: 13,
        zoomControl: true,
        attributionControl: false,
      });

      // Dark theme tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap, © CARTO',
        maxZoom: 19,
      }).addTo(mapRef.current);

      // Add custom attribution
      L.control.attribution({ position: 'bottomright', prefix: 'AERIS' }).addTo(mapRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update ambulance marker with enhanced animation
  useEffect(() => {
    if (!mapRef.current) return;

    const ambulanceIcon = L.divIcon({
      html: `
        <div style="
          position: relative;
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          ${isEmergency ? `
          <div style="
            position: absolute;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, rgba(239, 68, 68, 0.4) 0%, transparent 70%);
            border-radius: 50%;
            animation: pulse-ring 1.5s infinite;
          "></div>
          <div style="
            position: absolute;
            width: 80%;
            height: 80%;
            background: radial-gradient(circle, rgba(239, 68, 68, 0.3) 0%, transparent 70%);
            border-radius: 50%;
            animation: pulse-ring 1.5s infinite 0.3s;
          "></div>
          ` : ''}
          <div style="
            font-size: 32px;
            z-index: 10;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
            animation: ${isEmergency ? 'bounce 0.6s infinite alternate' : 'none'};
          ">🚑</div>
          ${isEmergency ? `
          <div style="
            position: absolute;
            top: -8px;
            right: -8px;
            width: 16px;
            height: 16px;
            background: #ef4444;
            border-radius: 50%;
            border: 2px solid #0d1526;
            animation: blink 1s infinite;
            box-shadow: 0 0 10px rgba(239, 68, 68, 0.8);
          "></div>
          ` : ''}
        </div>
      `,
      className: 'ambulance-marker',
      iconSize: [50, 50],
      iconAnchor: [25, 25],
    });

    if (ambulanceMarkerRef.current) {
      ambulanceMarkerRef.current.setLatLng(currentPosition);
      ambulanceMarkerRef.current.setIcon(ambulanceIcon);
    } else {
      ambulanceMarkerRef.current = L.marker(currentPosition, { icon: ambulanceIcon, zIndexOffset: 1000 })
        .addTo(mapRef.current)
        .bindPopup(`
          <div style="font-family: Inter, sans-serif; min-width: 180px; background: #0d1526; color: #f0f4ff; padding: 8px; border-radius: 8px;">
            <div style="font-weight: 700; font-size: 1rem; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
              🚑 <span style="color: #3b82f6;">${rid || 'AMB-001'}</span>
            </div>
            <div style="font-size: 0.8rem; color: #8896b0; margin-bottom: 4px;">
              Status: ${isEmergency ? '<span style="color: #ef4444; font-weight: 600;">🚨 EMERGENCY ACTIVE</span>' : '<span style="color: #10b981;">✓ Idle</span>'}
            </div>
            <div style="font-size: 0.75rem; color: #4a5878; font-family: monospace; margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1);">
              📍 ${currentPosition[0].toFixed(5)}, ${currentPosition[1].toFixed(5)}
            </div>
          </div>
        `, { className: 'custom-popup' });
    }

    // Add to trail
    if (isEmergency) {
      trailPointsRef.current.push(currentPosition);
      if (trailPointsRef.current.length > 50) trailPointsRef.current.shift();

      if (trailPolylineRef.current) {
        mapRef.current.removeLayer(trailPolylineRef.current);
      }
      trailPolylineRef.current = L.polyline(trailPointsRef.current, {
        color: '#ef4444',
        weight: 3,
        opacity: 0.4,
        dashArray: '5, 10',
      }).addTo(mapRef.current);
    } else {
      trailPointsRef.current = [];
      if (trailPolylineRef.current) {
        mapRef.current.removeLayer(trailPolylineRef.current);
        trailPolylineRef.current = null;
      }
    }

    // Smooth pan to ambulance if emergency is active
    if (isEmergency) {
      mapRef.current.panTo(currentPosition, { animate: true, duration: 1, easeLinearity: 0.25 });
    }
  }, [currentPosition, isEmergency, rid]);

  // Update hospital marker with enhanced design
  useEffect(() => {
    if (!mapRef.current) return;

    const hospitalIcon = L.divIcon({
      html: `
        <div style="
          position: relative;
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            position: absolute;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, transparent 70%);
            border-radius: 50%;
            animation: pulse-slow 3s infinite;
          "></div>
          <div style="
            font-size: 36px;
            z-index: 10;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
          ">🏥</div>
        </div>
      `,
      className: 'hospital-marker',
      iconSize: [50, 50],
      iconAnchor: [25, 50],
    });

    if (!hospitalMarkerRef.current) {
      hospitalMarkerRef.current = L.marker(hospitalPosition, { icon: hospitalIcon, zIndexOffset: 500 })
        .addTo(mapRef.current)
        .bindPopup(`
          <div style="font-family: Inter, sans-serif; background: #0d1526; color: #f0f4ff; padding: 10px; border-radius: 8px;">
            <div style="font-weight: 700; font-size: 1rem; margin-bottom: 4px;">🏥 City Hospital</div>
            <div style="font-size: 0.8rem; color: #10b981; margin-bottom: 4px;">Emergency Department</div>
            <div style="font-size: 0.75rem; color: #8896b0;">24/7 Trauma Center</div>
          </div>
        `, { className: 'custom-popup' });
    }
  }, [hospitalPosition]);

  // Update traffic signal markers
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear old markers
    signalMarkersRef.current.forEach(m => mapRef.current?.removeLayer(m));
    signalMarkersRef.current = [];

    signals.forEach(sig => {
      const color = sig.color === 'GREEN' ? '#10b981' : sig.color === 'YELLOW' ? '#f59e0b' : '#ef4444';
      const icon = L.divIcon({
        html: `
          <div style="
            width: 24px;
            height: 24px;
            background: ${color};
            border: 3px solid #0d1526;
            border-radius: 50%;
            box-shadow: 0 0 15px ${color}80, 0 2px 4px rgba(0,0,0,0.5);
            animation: ${sig.color === 'GREEN' ? 'pulse-green 2s infinite' : 'none'};
          "></div>
        `,
        className: 'signal-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([sig.lat, sig.lng], { icon, zIndexOffset: 100 })
        .addTo(mapRef.current!)
        .bindPopup(`
          <div style="font-family: Inter, sans-serif; background: #0d1526; color: #f0f4ff; padding: 8px; border-radius: 8px;">
            <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 4px;">${sig.name}</div>
            <div style="font-size: 0.75rem; color: #8896b0;">${sig.junction}</div>
            <div style="font-size: 0.85rem; margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); color: ${color}; font-weight: 600;">
              ${sig.color === 'GREEN' ? '🟢' : sig.color === 'YELLOW' ? '🟡' : '🔴'} ${sig.color}
            </div>
          </div>
        `, { className: 'custom-popup' });

      signalMarkersRef.current.push(marker);
    });
  }, [signals]);

  // Update route polyline with enhanced styling
  useEffect(() => {
    if (!mapRef.current) return;

    if (routePolylineRef.current) {
      mapRef.current.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }

    const displayRoute = isSimulating ? SIMULATED_ROUTE : route;

    if (displayRoute.length > 1) {
      routePolylineRef.current = L.polyline(displayRoute, {
        color: isEmergency ? '#ef4444' : '#3b82f6',
        weight: 5,
        opacity: 0.8,
        dashArray: isEmergency ? '15, 10' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(mapRef.current);

      // Add glow effect
      L.polyline(displayRoute, {
        color: isEmergency ? '#ef4444' : '#3b82f6',
        weight: 10,
        opacity: 0.2,
      }).addTo(mapRef.current);

      // Fit bounds to show entire route
      const bounds = L.latLngBounds(displayRoute);
      mapRef.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
    }
  }, [route, isEmergency, isSimulating]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div id="map" style={{ width: '100%', height: '100%', borderRadius: '12px' }} />
      
      {/* Simulation Status */}
      {isSimulating && (
        <div style={{
          position: 'absolute',
          top: 20,
          left: 20,
          background: 'rgba(239, 68, 68, 0.95)',
          backdropFilter: 'blur(10px)',
          padding: '12px 16px',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.2)',
          zIndex: 1000,
          fontSize: '0.85rem',
          color: '#fff',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#fff',
            animation: 'blink 1s infinite',
          }} />
          <span>SIMULATING MOVEMENT</span>
          <span style={{ 
            background: 'rgba(255,255,255,0.2)', 
            padding: '2px 8px', 
            borderRadius: 6,
            fontSize: '0.75rem',
          }}>
            {positionIndex + 1} / {SIMULATED_ROUTE.length}
          </span>
        </div>
      )}

      {/* Map Legend */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        background: 'rgba(13, 21, 38, 0.95)',
        backdropFilter: 'blur(10px)',
        padding: '12px 16px',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.1)',
        zIndex: 1000,
        fontSize: '0.75rem',
        color: '#8896b0',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: '#f0f4ff' }}>Map Legend</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🚑</span>
            <span>Ambulance</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🏥</span>
            <span>Hospital</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
            <span>Green Signal</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
            <span>Red Signal</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.3; }
          100% { transform: scale(0.8); opacity: 1; }
        }
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.1); opacity: 0.3; }
        }
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 0 15px #10b98180, 0 2px 4px rgba(0,0,0,0.5); }
          50% { box-shadow: 0 0 25px #10b981cc, 0 2px 4px rgba(0,0,0,0.5); }
        }
        @keyframes bounce {
          0% { transform: translateY(0); }
          100% { transform: translateY(-4px); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .ambulance-marker, .hospital-marker, .signal-marker {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-popup-content-wrapper {
          background: #0d1526 !important;
          border-radius: 10px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4) !important;
          padding: 0 !important;
        }
        .leaflet-popup-tip {
          background: #0d1526 !important;
        }
        .custom-popup .leaflet-popup-content {
          margin: 0 !important;
        }
        .leaflet-container {
          background: #080e1a !important;
        }
      `}</style>
    </div>
  );
};

export default AmbulanceMap;
