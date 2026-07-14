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

// Bangalore coordinates
const BANGALORE_CENTER: [number, number] = [12.9716, 77.5946];
const HOSPITAL_POSITION: [number, number] = [12.9822, 77.6045]; // Fixed hospital location

const LiveMapComponent: React.FC = () => {
  const mapRef = useRef<L.Map | null>(null);
  const ambulanceMarkerRef = useRef<L.Marker | null>(null);
  const hospitalMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  // Dynamic ambulance position state
  const [ambulancePosition, setAmbulancePosition] = useState<[number, number]>([12.9716, 77.5946]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) {
      // Create map instance
      mapRef.current = L.map('live-map', {
        center: BANGALORE_CENTER,
        zoom: 13,
        zoomControl: true,
        attributionControl: false,
      });

      // Add dark theme tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap, © CARTO',
        maxZoom: 19,
      }).addTo(mapRef.current);

      // Add custom attribution
      L.control.attribution({ position: 'bottomright', prefix: 'Leaflet' }).addTo(mapRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update ambulance marker
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
          <div style="
            position: absolute;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, transparent 70%);
            border-radius: 50%;
            animation: pulse 2s infinite;
          "></div>
          <div style="
            font-size: 32px;
            z-index: 10;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
          ">🚑</div>
        </div>
      `,
      className: 'ambulance-marker',
      iconSize: [50, 50],
      iconAnchor: [25, 25],
    });

    if (ambulanceMarkerRef.current) {
      ambulanceMarkerRef.current.setLatLng(ambulancePosition);
    } else {
      ambulanceMarkerRef.current = L.marker(ambulancePosition, { icon: ambulanceIcon, zIndexOffset: 1000 })
        .addTo(mapRef.current)
        .bindPopup(`
          <div style="font-family: 'Inter', sans-serif; padding: 8px; background: #1a1a2e; color: #fff; border-radius: 8px;">
            <div style="font-weight: 700; font-size: 1rem; margin-bottom: 4px;">🚑 Ambulance</div>
            <div style="font-size: 0.8rem; color: #94a3b8;">
              Lat: ${ambulancePosition[0].toFixed(4)}<br/>
              Lng: ${ambulancePosition[1].toFixed(4)}
            </div>
          </div>
        `);
    }
  }, [ambulancePosition]);

  // Update hospital marker
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
            background: radial-gradient(circle, rgba(16, 185, 129, 0.3) 0%, transparent 70%);
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
      hospitalMarkerRef.current = L.marker(HOSPITAL_POSITION, { icon: hospitalIcon, zIndexOffset: 500 })
        .addTo(mapRef.current)
        .bindPopup(`
          <div style="font-family: 'Inter', sans-serif; padding: 8px; background: #1a1a2e; color: #fff; border-radius: 8px;">
            <div style="font-weight: 700; font-size: 1rem; margin-bottom: 4px;">🏥 Hospital</div>
            <div style="font-size: 0.8rem; color: #94a3b8;">Emergency Department</div>
          </div>
        `);
    }
  }, []);

  // Update polyline between ambulance and hospital
  useEffect(() => {
    if (!mapRef.current) return;

    if (polylineRef.current) {
      mapRef.current.removeLayer(polylineRef.current);
    }

    polylineRef.current = L.polyline([ambulancePosition, HOSPITAL_POSITION], {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.7,
      dashArray: '10, 10',
      lineCap: 'round',
    }).addTo(mapRef.current);

    // Add glow effect
    L.polyline([ambulancePosition, HOSPITAL_POSITION], {
      color: '#3b82f6',
      weight: 8,
      opacity: 0.2,
    }).addTo(mapRef.current);
  }, [ambulancePosition]);

  // Simulate ambulance movement (for demo purposes)
  useEffect(() => {
    const interval = setInterval(() => {
      setAmbulancePosition(prev => {
        const latDiff = HOSPITAL_POSITION[0] - prev[0];
        const lngDiff = HOSPITAL_POSITION[1] - prev[1];
        
        // Move 10% closer to hospital each update
        const newLat = prev[0] + latDiff * 0.1;
        const newLng = prev[1] + lngDiff * 0.1;
        
        // Reset if reached hospital
        if (Math.abs(latDiff) < 0.001 && Math.abs(lngDiff) < 0.001) {
          return [12.9716, 77.5946]; // Reset to start
        }
        
        return [newLat, newLng];
      });
    }, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, []);

  // Manual position update controls
  const moveAmbulance = (direction: 'north' | 'south' | 'east' | 'west') => {
    setAmbulancePosition(prev => {
      const step = 0.005;
      switch (direction) {
        case 'north': return [prev[0] + step, prev[1]];
        case 'south': return [prev[0] - step, prev[1]];
        case 'east': return [prev[0], prev[1] + step];
        case 'west': return [prev[0], prev[1] - step];
        default: return prev;
      }
    });
  };

  const resetPosition = () => {
    setAmbulancePosition([12.9716, 77.5946]);
  };

  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      padding: '2rem',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto 2rem',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 800,
          color: '#f1f5f9',
          marginBottom: '0.5rem',
          letterSpacing: '-1px',
        }}>
          🚑 Live Ambulance Tracking
        </h1>
        <p style={{
          fontSize: '1rem',
          color: '#94a3b8',
        }}>
          Real-time GPS tracking with Leaflet.js + OpenStreetMap
        </p>
      </div>

      {/* Map Card */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        background: 'rgba(30, 41, 59, 0.8)',
        backdropFilter: 'blur(10px)',
        borderRadius: '16px',
        border: '1px solid rgba(148, 163, 184, 0.1)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
      }}>
        {/* Map Container */}
        <div style={{ position: 'relative', width: '100%', height: '600px' }}>
          <div id="live-map" style={{ width: '100%', height: '100%' }} />
          
          {/* Map Legend */}
          <div style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(10px)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            zIndex: 1000,
            minWidth: '180px',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 12, color: '#f1f5f9', fontSize: '0.9rem' }}>
              Map Legend
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🚑</span>
                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Ambulance (Moving)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🏥</span>
                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Hospital (Fixed)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 20, height: 3, background: '#3b82f6', borderRadius: 2 }} />
                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Route Path</span>
              </div>
            </div>
          </div>
        </div>

        {/* Controls Panel */}
        <div style={{
          padding: '1.5rem',
          background: 'rgba(15, 23, 42, 0.5)',
          borderTop: '1px solid rgba(148, 163, 184, 0.1)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            {/* Position Info */}
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Ambulance Position
              </div>
              <div style={{ fontSize: '1rem', color: '#f1f5f9', fontFamily: 'monospace' }}>
                {ambulancePosition[0].toFixed(5)}, {ambulancePosition[1].toFixed(5)}
              </div>
            </div>

            {/* Manual Controls */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => moveAmbulance('north')} style={buttonStyle}>⬆️ North</button>
              <button onClick={() => moveAmbulance('south')} style={buttonStyle}>⬇️ South</button>
              <button onClick={() => moveAmbulance('east')} style={buttonStyle}>➡️ East</button>
              <button onClick={() => moveAmbulance('west')} style={buttonStyle}>⬅️ West</button>
              <button onClick={resetPosition} style={{...buttonStyle, background: 'linear-gradient(135deg, #ef4444, #dc2626)'}}>
                🔄 Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div style={{
        maxWidth: '1200px',
        margin: '2rem auto 0',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1rem',
      }}>
        <InfoCard
          icon="🗺️"
          title="Real Map"
          description="Leaflet.js + OpenStreetMap"
          color="#3b82f6"
        />
        <InfoCard
          icon="📍"
          title="Dynamic Tracking"
          description="Live ambulance position updates"
          color="#10b981"
        />
        <InfoCard
          icon="🎨"
          title="Dark Theme"
          description="Professional UI design"
          color="#8b5cf6"
        />
        <InfoCard
          icon="📏"
          title="Polyline Route"
          description="Visual path between markers"
          color="#f59e0b"
        />
      </div>

      {/* Styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 0.3; }
        }
        
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 0.2; }
        }
        
        .ambulance-marker, .hospital-marker {
          background: transparent !important;
          border: none !important;
        }
        
        .leaflet-popup-content-wrapper {
          background: #1a1a2e !important;
          border-radius: 10px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4) !important;
          padding: 0 !important;
        }
        
        .leaflet-popup-tip {
          background: #1a1a2e !important;
        }
        
        .leaflet-container {
          background: #0f172a !important;
        }
      `}</style>
    </div>
  );
};

// Button style
const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
};

// Info Card Component
const InfoCard: React.FC<{ icon: string; title: string; description: string; color: string }> = ({
  icon,
  title,
  description,
  color,
}) => (
  <div style={{
    background: 'rgba(30, 41, 59, 0.6)',
    backdropFilter: 'blur(10px)',
    padding: '1.5rem',
    borderRadius: '12px',
    border: '1px solid rgba(148, 163, 184, 0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  }}>
    <div style={{
      fontSize: '2rem',
      width: 50,
      height: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `${color}20`,
      borderRadius: '10px',
      border: `1px solid ${color}40`,
    }}>
      {icon}
    </div>
    <div>
      <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{description}</div>
    </div>
  </div>
);

export default LiveMapComponent;
