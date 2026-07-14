import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, MapPin, Activity, Clock, Zap, AlertTriangle } from 'lucide-react';
import type { AmbulanceSession } from '../api';

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface InteractiveMapProps {
  sessions: AmbulanceSession[];
  signals?: Array<{ id: string; name: string; color: string; lat: number; lng: number }>;
  centerOnAmbulance?: boolean;
  showTraffic?: boolean;
  showLegend?: boolean;
  height?: string;
}

const InteractiveMap: React.FC<InteractiveMapProps> = ({
  sessions,
  signals = [],
  centerOnAmbulance = true,
  showTraffic = true,
  showLegend = true,
  height = '500px',
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const polylinesRef = useRef<Map<string, L.Polyline>>(new Map());
  const trailsRef = useRef<Map<string, L.Polyline>>(new Map());
  const signalMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const hospitalMarkerRef = useRef<L.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedAmbulance, setSelectedAmbulance] = useState<string | null>(null);

  // Custom ambulance icon
  const ambulanceIcon = L.divIcon({
    className: 'custom-ambulance-marker',
    html: `
      <div style="
        position: relative;
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4), 0 0 0 4px rgba(239, 68, 68, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: pulse-ambulance 2s ease-in-out infinite;
      ">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
          <path d="M9 17h6M9 13h6M9 9h6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"/>
        </svg>
      </div>
      <style>
        @keyframes pulse-ambulance {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      </style>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });

  // Custom hospital icon
  const hospitalIcon = L.divIcon({
    className: 'custom-hospital-marker',
    html: `
      <div style="
        position: relative;
        width: 50px;
        height: 50px;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        border-radius: 12px;
        border: 3px solid white;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        transform: rotate(45deg);
      ">
        <div style="transform: rotate(-45deg); font-size: 24px;">🏥</div>
      </div>
    `,
    iconSize: [50, 50],
    iconAnchor: [25, 25],
    popupAnchor: [0, -25],
  });

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create map centered on Delhi
    const map = L.map(mapContainerRef.current, {
      center: [28.6139, 77.2090],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Add scale control
    L.control.scale({ position: 'bottomleft' }).addTo(map);

    mapRef.current = map;
    setMapReady(true);

    // Add hospital marker (City Hospital - destination)
    const hospitalMarker = L.marker([28.6320, 77.2220], { icon: hospitalIcon })
      .addTo(map)
      .bindPopup(`
        <div style="font-family: system-ui; padding: 8px;">
          <div style="font-weight: 700; font-size: 16px; margin-bottom: 8px; color: #10b981;">
            🏥 City Hospital
          </div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">
            Emergency Gateway
          </div>
          <div style="font-size: 12px; color: #9ca3af;">
            📍 28.6320°N, 77.2220°E
          </div>
        </div>
      `);
    hospitalMarkerRef.current = hospitalMarker;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update ambulances and routes
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const map = mapRef.current;
    const activeSessions = sessions.filter(s => s.status === 'active');

    // Remove markers for sessions that no longer exist
    markersRef.current.forEach((marker, rid) => {
      if (!activeSessions.find(s => s.rid === rid)) {
        marker.remove();
        markersRef.current.delete(rid);
      }
    });

    // Remove polylines for sessions that no longer exist
    polylinesRef.current.forEach((polyline, rid) => {
      if (!activeSessions.find(s => s.rid === rid)) {
        polyline.remove();
        polylinesRef.current.delete(rid);
      }
    });

    // Remove trails for sessions that no longer exist
    trailsRef.current.forEach((trail, rid) => {
      if (!activeSessions.find(s => s.rid === rid)) {
        trail.remove();
        trailsRef.current.delete(rid);
      }
    });

    // Update or create markers for each active session
    activeSessions.forEach((session, index) => {
      const [lat, lng] = session.currentGPS;
      const color = index === 0 ? '#ef4444' : `hsl(${index * 60}, 70%, 50%)`;

      // Calculate ETA and speed
      const nodesLeft = session.route.length - 1 - session.currentNodeIndex;
      const etaMins = nodesLeft * 2;
      const speed = 45 + Math.floor(Math.random() * 15); // Simulated speed 45-60 km/h
      const progress = ((session.currentNodeIndex / (session.route.length - 1)) * 100).toFixed(1);

      // Update or create ambulance marker
      let marker = markersRef.current.get(session.rid);
      if (!marker) {
        marker = L.marker([lat, lng], { icon: ambulanceIcon })
          .addTo(map)
          .on('click', () => setSelectedAmbulance(session.rid));
        markersRef.current.set(session.rid, marker);
      } else {
        // Smooth animation to new position
        marker.setLatLng([lat, lng]);
      }

      // Update popup content
      marker.bindPopup(`
        <div style="font-family: system-ui; padding: 12px; min-width: 250px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <div style="
              width: 32px; 
              height: 32px; 
              background: ${color}; 
              border-radius: 50%; 
              display: flex; 
              align-items: center; 
              justify-content: center;
              font-size: 16px;
            ">🚑</div>
            <div>
              <div style="font-weight: 700; font-size: 16px; color: #1f2937;">
                ${session.rid}
              </div>
              <div style="font-size: 12px; color: #6b7280;">
                ${session.routeName}
              </div>
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
            <div style="background: #f3f4f6; padding: 8px; border-radius: 8px;">
              <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px;">ETA</div>
              <div style="font-weight: 700; font-size: 16px; color: #f59e0b;">
                ${etaMins > 0 ? `${etaMins} min` : 'Arriving'}
              </div>
            </div>
            <div style="background: #f3f4f6; padding: 8px; border-radius: 8px;">
              <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px;">Speed</div>
              <div style="font-weight: 700; font-size: 16px; color: #3b82f6;">
                ${speed} km/h
              </div>
            </div>
          </div>

          <div style="background: #f3f4f6; padding: 8px; border-radius: 8px; margin-bottom: 12px;">
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Progress</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="flex: 1; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden;">
                <div style="height: 100%; width: ${progress}%; background: linear-gradient(90deg, #3b82f6, #10b981); border-radius: 3px; transition: width 0.5s;"></div>
              </div>
              <div style="font-weight: 700; font-size: 13px; color: #1f2937;">${progress}%</div>
            </div>
          </div>

          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            ${session.cameraDetected ? 
              '<div style="background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">📷 Camera ✓</div>' : 
              '<div style="background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">📷 Camera ✗</div>'
            }
            ${session.sirenDetected ? 
              '<div style="background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">🔊 Siren ✓</div>' : 
              '<div style="background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">🔊 Siren ✗</div>'
            }
          </div>

          <div style="font-size: 12px; color: #6b7280;">
            <div style="margin-bottom: 4px;">
              <strong>Current:</strong> ${session.route[session.currentNodeIndex]}
            </div>
            <div>
              <strong>Next:</strong> ${session.route[session.currentNodeIndex + 1] || 'Destination'}
            </div>
          </div>
        </div>
      `, { maxWidth: 300 });

      // Draw route polyline
      const routeCoords: [number, number][] = session.route.map(node => {
        // Map node names to GPS coordinates (from backend)
        const coords: Record<string, [number, number]> = {
          'Dispatch Bay': [28.6139, 77.2090],
          'Junction A': [28.6180, 77.2120],
          'Junction B': [28.6220, 77.2150],
          'Central Junction': [28.6250, 77.2180],
          'Medical Zone': [28.6280, 77.2200],
          'Ring Road': [28.6160, 77.2050],
          'North Gate': [28.6300, 77.2100],
          'City Hospital': [28.6320, 77.2220],
        };
        return coords[node] || [28.6139, 77.2090];
      });

      // Update or create route polyline
      let polyline = polylinesRef.current.get(session.rid);
      if (!polyline) {
        polyline = L.polyline(routeCoords, {
          color: color,
          weight: 4,
          opacity: 0.7,
          dashArray: '10, 10',
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);
        polylinesRef.current.set(session.rid, polyline);
      } else {
        polyline.setLatLngs(routeCoords);
      }

      // Draw trail (path already traveled)
      const trailCoords = routeCoords.slice(0, session.currentNodeIndex + 1);
      trailCoords.push([lat, lng]); // Add current position

      let trail = trailsRef.current.get(session.rid);
      if (!trail) {
        trail = L.polyline(trailCoords, {
          color: color,
          weight: 6,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);
        trailsRef.current.set(session.rid, trail);
      } else {
        trail.setLatLngs(trailCoords);
      }

      // Center map on ambulance if requested and it's the first/selected one
      if (centerOnAmbulance && (index === 0 || session.rid === selectedAmbulance)) {
        map.setView([lat, lng], map.getZoom(), { animate: true, duration: 0.5 });
      }
    });

    // Update traffic signals
    signals.forEach(signal => {
      let marker = signalMarkersRef.current.get(signal.id);
      const color = signal.color === 'GREEN' ? '#10b981' : signal.color === 'YELLOW' ? '#f59e0b' : '#ef4444';

      if (!marker) {
        marker = L.circleMarker([signal.lat, signal.lng], {
          radius: 8,
          fillColor: color,
          color: 'white',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8,
        })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: system-ui; padding: 8px;">
              <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">
                🚦 ${signal.name}
              </div>
              <div style="font-size: 13px; color: ${color}; font-weight: 600;">
                ${signal.color}
              </div>
            </div>
          `);
        signalMarkersRef.current.set(signal.id, marker);
      } else {
        marker.setStyle({ fillColor: color });
      }
    });

  }, [sessions, signals, mapReady, centerOnAmbulance, selectedAmbulance]);

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div 
        ref={mapContainerRef} 
        style={{ 
          width: '100%', 
          height: '100%', 
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }} 
      />

      {/* Legend */}
      {showLegend && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'white',
          padding: '12px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          fontSize: '12px',
          zIndex: 1000,
          maxWidth: '200px',
        }}>
          <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '13px' }}>Map Legend</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '16px', height: '16px', background: '#ef4444', borderRadius: '50%' }}></div>
              <span>Ambulance</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '16px', height: '16px', background: '#10b981', borderRadius: '4px' }}></div>
              <span>Hospital</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '16px', height: '3px', background: '#3b82f6' }}></div>
              <span>Route Path</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', background: '#10b981', borderRadius: '50%', border: '2px solid white' }}></div>
              <span>Green Signal</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '50%', border: '2px solid white' }}></div>
              <span>Red Signal</span>
            </div>
          </div>
        </div>
      )}

      {/* Active Sessions Counter */}
      {sessions.filter(s => s.status === 'active').length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          background: 'rgba(239, 68, 68, 0.95)',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          fontSize: '13px',
          fontWeight: 600,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <Activity size={16} />
          {sessions.filter(s => s.status === 'active').length} Active Emergency
        </div>
      )}
    </div>
  );
};

export default InteractiveMap;
