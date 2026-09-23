import React, { useState, useEffect, useRef } from 'react';
import { Power, Navigation, Video, Mic2, CheckCircle2, XCircle, AlertTriangle, Route, RefreshCw, Terminal, Activity, Gauge, MapPin, Clock, Fuel, Thermometer, Building2 } from 'lucide-react';
import { useSSE } from '../hooks/usePoll';
import { startEmergency, stopEmergency, fetchRoutes, fetchHospitals, toggleCameraDetection, toggleSirenDetection, detectCameraReal, detectSirenReal } from '../api';
import type { RealDetectionResult } from '../api';
import type { RouteOption, AmbulanceSession, Hospital } from '../api';
import { useAuth } from '../context/AuthContext';
import Nav from '../components/Nav';
import TrafficLight from '../components/TrafficLight';
import InteractiveMap from '../components/InteractiveMap';
import SirenWaveform from '../components/SirenWaveform';
import { useToast } from '../components/Toast';
import { LiveBadge, AnimatedProgress, StatusPulse, AnimatedCounter, MetricValue } from '../components/LiveIndicators';
import { GlassCard } from '../components/EnhancedCard';
import Tooltip from '../components/Tooltip';
import { useStaircaseLoading, DashboardSkeleton } from '../components/SkeletonLoader';
import VitalsMonitor from '../components/VitalsMonitor';
import CCTVFeedSimulator from '../components/CCTVFeedSimulator';

const intakeInputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
};


const Driver: React.FC = () => {
  const { state, logs, connected, error: sseError, reconnect } = useSSE();
  const { user }   = useAuth();
  const { toast }  = useToast();

  const [loading, setLoading]             = useState(false);
  const [routes, setRoutes]               = useState<RouteOption[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routesError, setRoutesError]     = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState('R1');
  const [hospitals, setHospitals]         = useState<Hospital[]>([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(true);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('');
  const [patientCondition, setPatientCondition] = useState('');
  const [patientSeverity, setPatientSeverity] = useState<'critical' | 'serious' | 'stable'>('serious');
  const [patientDepartment, setPatientDepartment] = useState('');
  const [patientNotes, setPatientNotes] = useState('');
  const [showRouteSelector, setShowRouteSelector] = useState(false);
  const [polling, setPolling]             = useState(false);

  // Real-time metrics state
  const [speed, setSpeed] = useState(0);
  const [distanceRemaining, setDistanceRemaining] = useState(0);
  const [dynamicETA, setDynamicETA] = useState(0);
  const [fuelLevel, setFuelLevel] = useState(85);
  const [engineTemp, setEngineTemp] = useState(92);
  const prevGPSRef = useRef<[number, number] | null>(null);
  const prevTimeRef = useRef<number>(Date.now());

  // Fetch real hospitals (Section 6: genuine hospital selection), default
  // to the nearest one from this driver's dispatch base, then load routes
  // for that specific hospital.
  useEffect(() => {
    const loadHospitals = async () => {
      setHospitalsLoading(true);
      try {
        const data = await fetchHospitals();
        setHospitals(data);
        const nearest = data.find(h => h.reachable) || data[0];
        if (nearest) setSelectedHospitalId(nearest.id);
      } catch (error: any) {
        console.error('Failed to load hospitals:', error);
        toast('Failed to load hospitals list', 'error');
      } finally {
        setHospitalsLoading(false);
      }
    };
    loadHospitals();
  }, []);

  // Reload routes whenever the selected hospital changes
  useEffect(() => {
    if (!selectedHospitalId) return;
    const loadRoutes = async () => {
      setRoutesLoading(true);
      setRoutesError(null);
      try {
        const data = await fetchRoutes(selectedHospitalId);
        setRoutes(data);
        setSelectedRouteId(data[0]?.id || 'R1');
      } catch (error: any) {
        console.error('Failed to load routes:', error);
        setRoutesError(error.message || 'Failed to load routes');
        setRoutes([]);
      } finally {
        setRoutesLoading(false);
      }
    };
    loadRoutes();
  }, [selectedHospitalId]);

  // Find MY session (matching this driver's user ID)
  const mySession: AmbulanceSession | undefined = state?.sessions.find(
    s => s.driverId === user?.sub && s.status === 'active'
  );

  const [realDetectLoading, setRealDetectLoading] = useState(false);
  const [realDetectResult, setRealDetectResult] = useState<RealDetectionResult | null>(null);
  const [realSirenLoading, setRealSirenLoading] = useState(false);
  const [realSirenResult, setRealSirenResult] = useState<{ sirenDetected: boolean; confidence: number } | null>(null);

  const handleRealAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !mySession) return;

    setRealSirenLoading(true);
    try {
      const result = await detectSirenReal(mySession.rid, file);
      setRealSirenResult(result);
      toast(
        result.sirenDetected
          ? `Real FFT analysis: siren sweep detected (${result.confidence}%)`
          : `Real FFT analysis: no siren pattern found (${result.confidence}%)`,
        result.sirenDetected ? 'success' : 'warning'
      );
    } catch (error: any) {
      console.error('Real siren detection error:', error);
      toast(error.message || 'Detection service unreachable - is it running on :8001?', 'error');
    } finally {
      setRealSirenLoading(false);
    }
  };

  const handleRealFrameUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file again
    if (!file || !mySession) return;

    setRealDetectLoading(true);
    try {
      const result = await detectCameraReal(mySession.rid, file);
      setRealDetectResult(result);
      toast(
        result.detected
          ? `Real YOLO26 model: Ambulance detected (${result.confidence}%)`
          : 'Real YOLO26 model: no ambulance found in frame',
        result.detected ? 'success' : 'warning'
      );
    } catch (error: any) {
      console.error('Real detection error:', error);
      toast(error.message || 'Detection service unreachable - is it running on :8001?', 'error');
    } finally {
      setRealDetectLoading(false);
    }
  };

  // Toggle camera detection
  const toggleCameraDetect = async () => {
    if (!mySession) return;
    setPolling(true);
    try {
      const data = await toggleCameraDetection(mySession.rid);
      toast(
        `Camera: ${data.cameraDetected ? `ENABLED (${data.cameraConfidence}%)` : 'DISABLED'}`,
        data.cameraDetected ? 'success' : 'warning'
      );
    } catch (error: any) {
      console.error('Camera toggle error:', error);
      toast(error.message || 'Detection endpoint unreachable', 'error');
    } finally {
      setPolling(false);
    }
  };

  // Toggle siren detection
  const toggleSirenDetect = async () => {
    if (!mySession) return;
    setPolling(true);
    try {
      const data = await toggleSirenDetection(mySession.rid);
      toast(
        `Siren: ${data.sirenDetected ? `ENABLED (${data.sirenFrequency} Hz)` : 'DISABLED'}`,
        data.sirenDetected ? 'success' : 'warning'
      );
    } catch (error: any) {
      console.error('Siren toggle error:', error);
      toast(error.message || 'Detection endpoint unreachable', 'error');
    } finally {
      setPolling(false);
    }
  };

  const handleToggle = async () => {
    if (!mySession && !selectedHospitalId) {
      toast('Select a destination hospital first', 'error');
      return;
    }
    setLoading(true);
    try {
      if (mySession) {
        await stopEmergency(mySession.rid);
        toast(`Emergency ${mySession.rid} stopped`, 'warning');
      } else {
        const res = await startEmergency(selectedHospitalId, selectedRouteId, {
          condition: patientCondition || 'Not specified',
          severity: patientSeverity,
          requiredDepartment: patientDepartment || 'General Emergency',
          notes: patientNotes,
        });
        toast(`Emergency activated — RID: ${res.rid} → ${res.hospital.name}`, 'error');
        setShowRouteSelector(false);
      }
    } catch (error: any) {
      console.error('Emergency toggle error:', error);
      toast(error.message || 'Failed to communicate with backend', 'error');
    } finally {
      setLoading(false);
    }
  };

  const isEmergency = !!mySession;
  const nodesLeft   = mySession ? mySession.route.length - 1 - mySession.currentNodeIndex : 0;
  const etaMins     = nodesLeft * 2;
  const progress    = mySession ? (mySession.currentNodeIndex / Math.max(1, mySession.route.length - 1)) * 100 : 0;
  const isVerified  = mySession?.isVerified ?? false;
  const bothFailed  = isEmergency && mySession && !mySession.cameraDetected && !mySession.sirenDetected;

  // Calculate real-time metrics
  useEffect(() => {
    if (!mySession || mySession.status !== 'active') {
      setSpeed(0);
      setDistanceRemaining(0);
      setDynamicETA(0);
      prevGPSRef.current = null;
      return;
    }

    const calculateMetrics = () => {
      const currentGPS = mySession.currentGPS;
      const currentTime = Date.now();

      // Calculate speed (km/h) from GPS movement
      if (prevGPSRef.current) {
        const [prevLat, prevLng] = prevGPSRef.current;
        const [currLat, currLng] = currentGPS;
        const timeDiff = (currentTime - prevTimeRef.current) / 1000 / 3600; // hours
        
        // Haversine distance
        const R = 6371;
        const dLat = (currLat - prevLat) * Math.PI / 180;
        const dLng = (currLng - prevLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(prevLat * Math.PI / 180) * Math.cos(currLat * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        const calculatedSpeed = timeDiff > 0 ? distance / timeDiff : 0;
        setSpeed(Math.min(Math.max(calculatedSpeed, 0), 120)); // Cap at 120 km/h
      }

      // Calculate distance remaining
      const GPS_COORDS: Record<string, [number, number]> = {
        'Indiranagar Metro (Dispatch)': [12.9786, 77.6388],
        '100 Feet Road Junction': [12.9719, 77.6412],
        'Domlur Flyover': [12.9604, 77.6417],
        'Kodihalli Junction': [12.9601, 77.6472],
        'Marathahalli (ORR)': [12.9562, 77.7019],
        'Manipal Hospital': [12.9588, 77.6491],
        'Halasuru (Ulsoor)': [12.9757, 77.6263],
        'Trinity Circle': [12.9730, 77.6170],
        'Victoria Hospital': [12.9634, 77.5738],
        'Adugodi': [12.9435, 77.6091],
        'Silk Board Junction': [12.9170, 77.6220],
        "St. John's Medical College Hospital": [12.9293, 77.6201],
      };

      let totalDistance = 0;
      for (let i = mySession.currentNodeIndex; i < mySession.route.length - 1; i++) {
        const node1 = mySession.route[i];
        const node2 = mySession.route[i + 1];
        const [lat1, lng1] = GPS_COORDS[node1] || [0, 0];
        const [lat2, lng2] = GPS_COORDS[node2] || [0, 0];
        
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        totalDistance += R * c;
      }
      setDistanceRemaining(totalDistance);

      // Calculate dynamic ETA
      const avgSpeed = speed > 5 ? speed : 40; // Use 40 km/h default if speed too low
      const etaMinutes = totalDistance > 0 ? (totalDistance / avgSpeed) * 60 : 0;
      setDynamicETA(Math.max(0, etaMinutes));

      // Simulate fuel consumption (decreases during emergency)
      setFuelLevel(prev => Math.max(15, prev - 0.05));

      // Simulate engine temperature (increases during emergency)
      setEngineTemp(prev => Math.min(105, prev + (Math.random() * 0.3 - 0.1)));

      prevGPSRef.current = currentGPS;
      prevTimeRef.current = currentTime;
    };

    calculateMetrics();
    const interval = setInterval(calculateMetrics, 2000);
    return () => clearInterval(interval);
  }, [mySession, speed]);

  // Speed color indicator
  const getSpeedColor = () => {
    if (speed < 40) return 'var(--green)';
    if (speed < 70) return 'var(--orange)';
    return 'var(--red)';
  };

  // Fuel color indicator
  const getFuelColor = () => {
    if (fuelLevel > 50) return 'var(--green)';
    if (fuelLevel > 25) return 'var(--orange)';
    return 'var(--red)';
  };

  // Engine temp color indicator
  const getTempColor = () => {
    if (engineTemp < 95) return 'var(--green)';
    if (engineTemp < 100) return 'var(--orange)';
    return 'var(--red)';
  };

  // Driver-relevant logs
  const myLogs = logs.filter(l => !l.sessionRID || l.sessionRID === mySession?.rid).slice(0, 20);

  const loadStage = useStaircaseLoading(!state);

  // One-shot activation feedback: when the emergency flips to ACTIVE (via
  // SSE, after the backend confirms), flash the banner once over ~0.5s.
  // Activation itself is never delayed - this is purely presentational.
  const [justActivated, setJustActivated] = useState(false);
  const wasEmergencyRef = useRef(isEmergency);
  useEffect(() => {
    if (isEmergency && !wasEmergencyRef.current) {
      setJustActivated(true);
      const t = setTimeout(() => setJustActivated(false), 600);
      wasEmergencyRef.current = true;
      return () => clearTimeout(t);
    }
    wasEmergencyRef.current = isEmergency;
  }, [isEmergency]);

  const greenCount = state?.signals.filter(s => s.color === 'GREEN').length ?? 0;
  const signalTotal = state?.signals.length ?? 0;

  if (!state) return (
    <>
      <Nav roleName="Ambulance Driver" roleColor="#5D7DA6" connected={connected} />
      {loadStage === 'skeleton' ? <DashboardSkeleton /> : loadStage === 'spinner' ? (
        <div className="loading-screen"><div className="spinner" /><span>Connecting to AERIS stream...</span></div>
      ) : null}
    </>
  );

  return (
    <>
      <Nav
        roleName="Ambulance Driver"
        roleColor="#5D7DA6"
        connected={connected}
        meta={[
          { label: 'Unit', value: <span className="mono">{mySession?.rid ?? 'Standby'}</span>, tone: isEmergency ? 'green' : 'muted' },
          { label: 'Link', value: connected ? 'SSE CONNECTED' : 'OFFLINE', tone: connected ? 'green' : 'red' },
        ]}
      />
      <div className="container animate-fade-up">

        {/* SSE Connection Error Banner */}
        {sseError && (
          <div className="card mb-4 animate-fade-in" style={{ 
            background: 'rgba(239,68,68,0.1)', 
            border: '1px solid rgba(239,68,68,0.3)',
            padding: '12px 16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <AlertTriangle size={20} color="var(--c-red)" />
              <div style={{ flex: 1 }}>
                <div className="font-semibold text-sm" style={{ color: 'var(--c-red)' }}>Real-time Connection Issue</div>
                <div className="text-xs text-muted">{sseError}</div>
              </div>
              <button onClick={reconnect} className="btn btn-ghost btn-sm">
                <RefreshCw size={14} /> Reconnect
              </button>
            </div>
          </div>
        )}

        {/* ── Header: READY vs EMERGENCY ACTIVE ── */}
        <div className="page-header">
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '2px', color: isEmergency ? 'var(--c-red-bright)' : '#5C5568', marginBottom: 4 }}>
              {isEmergency ? '● EMERGENCY ACTIVE' : '○ SYSTEM READY'}
            </div>
            <h1 className="page-title">{isEmergency ? `Emergency Active — ${mySession?.rid}` : 'Driver Console'}</h1>
            <p className="page-subtitle">
              {mySession
                ? <><span className="mono text-blue font-semibold">{mySession.hospital.name}</span> · {mySession.routeName}</>
                : 'No active emergency session — Select destination hospital and activate emergency mode when required.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {!isEmergency && (
              <button className="btn btn-ghost" onClick={() => setShowRouteSelector(s => !s)} style={{ gap: 6 }}>
                <Building2 size={16} /> {hospitals.find(h => h.id === selectedHospitalId)?.name || 'Select Hospital'}
              </button>
            )}
            {isEmergency && mySession && (
              <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '10px 14px', background: 'rgba(0,0,0,0.03)', borderRadius: 12, border: '1px solid var(--border-light)' }}>
                {mySession.hospital.name}
              </div>
            )}
            <button
              onClick={handleToggle}
              disabled={loading}
              className={`btn btn-lg ${isEmergency ? 'btn-emergency' : 'btn-primary'}`}
              style={{ minWidth: 220 }}
            >
              <Power size={20} />
              {loading ? 'Processing...' : isEmergency ? 'STOP EMERGENCY' : 'ACTIVATE EMERGENCY'}
            </button>
          </div>
        </div>

        {/* ── Hospital Selector (Section 6: real hospital choice) ── */}
        {showRouteSelector && !isEmergency && (
          <div className="card mb-4 animate-fade-in" style={{ borderColor: 'rgba(134,171,151,0.2)' }}>
            <div className="section-title"><Building2 size={14} /> Select Destination Hospital</div>
            {hospitalsLoading ? (
              <div className="text-center py-4">
                <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 8px' }} />
                <div className="text-xs text-muted">Loading real hospitals...</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {hospitals.map(h => (
                  <div key={h.id} onClick={() => h.reachable && setSelectedHospitalId(h.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                    borderRadius: 10, cursor: h.reachable ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
                    opacity: h.reachable ? 1 : 0.4,
                    background: selectedHospitalId === h.id ? 'rgba(134,171,151,0.1)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${selectedHospitalId === h.id ? 'rgba(134,171,151,0.4)' : 'rgba(255,255,255,0.05)'}`,
                  }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: selectedHospitalId === h.id ? 'rgba(134,171,151,0.2)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Building2 size={18} color={selectedHospitalId === h.id ? '#86AB97' : '#4a5878'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="font-semibold text-sm">{h.name}</div>
                      <div className="text-xs text-muted">{h.address}</div>
                      <div className="text-xs text-quiet mt-1">{h.departments.join(' · ')}</div>
                      <div className="text-xs mt-1" style={{
                        color: h.availableBeds === 0 ? 'var(--red-bright)' : h.availableBeds <= h.totalBeds * 0.15 ? 'var(--orange)' : 'var(--green)',
                        fontWeight: 600,
                      }}>
                        {h.availableBeds === 0 ? '⚠ No beds available' : `🛏 ${h.availableBeds}/${h.totalBeds} beds available`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {h.reachable ? (
                        <>
                          <div className="font-bold" style={{ color: '#86AB97', fontSize: '0.9rem' }}>{h.distanceKm} km</div>
                          <div className="text-xs text-quiet">~{h.estimatedMinutes} min</div>
                        </>
                      ) : (
                        <div className="text-xs text-red">Unreachable</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Route Selector ── */}
        {showRouteSelector && !isEmergency && (
          <div className="card mb-4 animate-fade-in" style={{ borderColor: 'rgba(93,125,166,0.2)' }}>
            <div className="section-title"><Route size={14} /> Route Selection — Dijkstra Pre-Computed Paths</div>
            {routesLoading ? (
              <div className="text-center py-4">
                <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 8px' }} />
                <div className="text-xs text-muted">Loading routes...</div>
              </div>
            ) : routesError ? (
              <div className="text-center py-4">
                <div className="text-xs text-red mb-2">⚠️ {routesError}</div>
                <button onClick={() => window.location.reload()} className="btn btn-ghost btn-sm">Retry</button>
              </div>
            ) : routes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {routes.map(r => (
                  <div key={r.id} onClick={() => setSelectedRouteId(r.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                    borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                    background: selectedRouteId === r.id ? 'rgba(93,125,166,0.1)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${selectedRouteId === r.id ? 'rgba(93,125,166,0.4)' : 'rgba(255,255,255,0.05)'}`,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: selectedRouteId === r.id ? 'rgba(93,125,166,0.2)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', color: selectedRouteId === r.id ? '#5D7DA6' : '#4a5878' }}>
                      {r.id}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="font-semibold text-sm">{r.name}</div>
                      <div className="text-xs text-muted">{r.nodes.join(' → ')}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-semibold text-blue">{r.distance}</div>
                      <div className="text-muted">~{r.estimatedTime} min</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-muted">No routes available</div>
            )}

            {/* Patient intake - Section 2 of the spec: condition, severity,
                department, notes, entered before activation. Sent along with
                the route when the emergency is activated. */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="section-title" style={{ marginBottom: 10 }}>Patient Intake</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <input
                  type="text" placeholder="Condition (e.g. Cardiac arrest)"
                  value={patientCondition} onChange={e => setPatientCondition(e.target.value)}
                  style={intakeInputStyle}
                />
                <select value={patientSeverity} onChange={e => setPatientSeverity(e.target.value as any)} style={intakeInputStyle}>
                  <option value="critical">Critical</option>
                  <option value="serious">Serious</option>
                  <option value="stable">Stable</option>
                </select>
                <input
                  type="text" placeholder="Required department (e.g. Cardiology)"
                  value={patientDepartment} onChange={e => setPatientDepartment(e.target.value)}
                  style={intakeInputStyle}
                />
                <input
                  type="text" placeholder="Additional notes (optional)"
                  value={patientNotes} onChange={e => setPatientNotes(e.target.value)}
                  style={intakeInputStyle}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Emergency Banner ── */}
        {isEmergency && (
          <div className="emergency-banner mb-4 animate-fade-in" style={{
            position: 'relative', overflow: 'hidden',
            animation: justActivated ? 'activateFlash 0.5s ease-out, fadeIn 0.4s ease' : 'fadeIn 0.4s ease',
          }}>
            <LiveBadge variant="red" />
            <span className="font-semibold text-sm" style={{ color: 'var(--c-red-bright)' }}>EMERGENCY ACTIVE</span>
            <span className="text-muted text-sm">· RID: <span className="mono">{mySession?.rid}</span> · Green corridor active · ETA: ~{etaMins} min</span>
            {bothFailed && <span className="status-badge badge-yellow" style={{ marginLeft: 'auto' }}><AlertTriangle size={11} /> Fail-safe: Manual Mode</span>}
          </div>
        )}

        {/* ── Interactive Map ── */}
        <GlassCard 
          icon={<Navigation size={20} color="var(--blue)" />}
          title="Live GPS Tracking Map"
          subtitle="Real-time ambulance position with traffic signals"
          badge={
            isEmergency ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <LiveBadge variant="green" />
                <AnimatedProgress value={progress} height={6} showLabel={false} color="var(--green)" />
                <span className="text-xs font-semibold" style={{ color: 'var(--green-dark)', minWidth: 40 }}>{Math.round(progress)}%</span>
              </div>
            ) : null
          }
          glowColor="rgba(93,125,166,0.2)"
        >
          <div style={{ position: 'relative' }}>
          {isEmergency && mySession && (
            <div style={{
              position: 'absolute', top: 12, left: 52, zIndex: 500,
              // Reserve the top-right legend (~220px) so the chip wraps
              // instead of sliding underneath it on narrow maps.
              maxWidth: 'min(600px, calc(100% - 284px))',
              pointerEvents: 'none', display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap',
              background: 'rgba(255,253,249,0.92)', border: '1px solid rgba(255,59,92,0.3)',
              borderRadius: 14, padding: '10px 14px',
              boxShadow: '0 8px 24px rgba(90,60,40,0.12)',
            }}>
              <div>
                <div className="mono" style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--c-red-bright)', lineHeight: 1.2 }}>{mySession.rid}</div>
                <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '1px', color: 'var(--c-red-bright)' }}>EMERGENCY ACTIVE</div>
              </div>
              <div style={{ width: 1, background: 'rgba(0,0,0,0.08)' }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#241F2B', lineHeight: 1.2 }}>ETA ~{etaMins} min</div>
                <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{distanceRemaining.toFixed(1)} km · {mySession.hospital.name}</div>
              </div>
              <div style={{ width: 1, background: 'rgba(0,0,0,0.08)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.6px', color: greenCount > 0 ? 'var(--green-dark)' : 'var(--text-tertiary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: greenCount > 0 ? 'var(--green)' : '#c9c2b8' }} />
                {greenCount > 0 ? `CORRIDOR · ${greenCount} GREEN` : 'CORRIDOR STANDBY'}
              </div>
            </div>
          )}
          <InteractiveMap
            sessions={state?.sessions || []}
            signals={state?.signals.map(s => {
              // Map signal junctions to GPS coordinates
              const junctionCoords: Record<string, [number, number]> = {
                '100 Feet Road Junction': [12.9719, 77.6412],
                'Domlur Flyover': [12.9604, 77.6417],
                'Kodihalli Junction': [12.9601, 77.6472],
                'Marathahalli (ORR)': [12.9562, 77.7019],
                'Halasuru (Ulsoor)': [12.9757, 77.6263],
                'Trinity Circle': [12.9730, 77.6170],
                'Adugodi': [12.9435, 77.6091],
              };
              const [lat, lng] = junctionCoords[s.junction] || [12.9786, 77.6388];
              return { id: s.id, name: s.name, color: s.color, lat, lng };
            }) || []} 
            centerOnAmbulance={isEmergency}
            showTraffic={true}
            showLegend={true}
            height="500px"
          />
          </div>
        </GlassCard>

        <div className="grid-2 stagger">

          {/* ── Left: Detection ── */}
          <div className="flex flex-col gap-4">

            {/* Real-Time Metrics Dashboard */}
            <GlassCard
              icon={<Gauge size={20} color="var(--blue)" />}
              title="Live Vehicle Metrics"
              subtitle="Real-time telemetry and navigation data"
              badge={isEmergency ? <LiveBadge variant="red" /> : null}
              glowColor="rgba(93,125,166,0.15)"
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                {/* Status — emergency state first */}
                <div style={{
                  padding: '1.25rem',
                  borderRadius: 12,
                  background: isEmergency ? 'rgba(255,59,92,0.06)' : 'rgba(255,255,255,0.02)',
                  border: `2px solid ${isEmergency ? 'rgba(255,59,92,0.35)' : isVerified ? 'rgba(52,199,89,0.2)' : 'rgba(0,0,0,0.08)'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {isEmergency
                      ? (isVerified ? <CheckCircle2 size={18} color="var(--c-red-bright)" /> : <XCircle size={18} color="var(--c-red-bright)" />)
                      : <CheckCircle2 size={18} color="var(--text-tertiary)" />}
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>STATUS</span>
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: isEmergency ? 'var(--c-red-bright)' : 'var(--text-tertiary)', marginBottom: 4 }}>
                    {isEmergency ? (isVerified ? 'ACTIVE · VERIFIED' : 'ACTIVE · MANUAL') : 'READY'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                    {isEmergency ? (isVerified ? 'Sensors active' : 'Override mode') : 'No emergency'}
                  </div>
                </div>

                {/* Dynamic ETA */}
                <div style={{
                  padding: '1.25rem',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)',
                  border: '2px solid rgba(251,146,60,0.2)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Clock size={18} color="var(--orange)" />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>ETA</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <AnimatedCounter value={Math.round(dynamicETA)} suffix="" color="var(--orange)" style={{ fontSize: '2rem', fontWeight: 700 }} />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>min</span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                    {dynamicETA > 0 ? 'Live calculation' : 'Arrived'}
                  </div>
                </div>

                {/* Distance Remaining */}
                <div style={{
                  padding: '1.25rem',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)',
                  border: '2px solid rgba(93,125,166,0.2)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <MapPin size={18} color="var(--blue)" />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>DISTANCE</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <MetricValue value={distanceRemaining} suffix="" color="var(--blue)" style={{ fontSize: '2rem', fontWeight: 700 }} decimals={1} />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>km</span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                    {isEmergency ? 'To hospital' : 'No route'}
                  </div>
                </div>

                {/* Speed */}
                <div style={{ 
                  padding: '1.25rem', 
                  borderRadius: 12, 
                  background: 'rgba(255,255,255,0.02)',
                  border: `2px solid ${getSpeedColor()}20`,
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: getSpeedColor(), opacity: 0.6 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Gauge size={18} color={getSpeedColor()} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>SPEED</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <MetricValue value={Math.round(speed)} suffix="" color={getSpeedColor()} style={{ fontSize: '2rem', fontWeight: 700 }} />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>km/h</span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                    {speed < 40 ? 'Safe' : speed < 70 ? 'Moderate' : 'High Speed'}
                  </div>
                </div>

                {/* Route — actual active route, not a guess */}
                <div style={{
                  padding: '1.25rem',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)',
                  border: '2px solid rgba(93,125,166,0.2)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Route size={18} color="var(--blue)" />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>ROUTE</span>
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: isEmergency ? 'var(--blue)' : 'var(--text-tertiary)', marginBottom: 4 }}>
                    {mySession ? mySession.routeName.split(' (')[0] : '—'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                    {mySession ? `${mySession.route.length} waypoints` : 'No route selected'}
                  </div>
                </div>

                {/* Fuel Level */}
                <div style={{ 
                  padding: '1.25rem', 
                  borderRadius: 12, 
                  background: 'rgba(255,255,255,0.02)',
                  border: `2px solid ${getFuelColor()}20`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Fuel size={18} color={getFuelColor()} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>FUEL</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <MetricValue value={Math.round(fuelLevel)} suffix="" color={getFuelColor()} style={{ fontSize: '2rem', fontWeight: 700 }} />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>%</span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                    {fuelLevel > 50 ? 'Sufficient' : fuelLevel > 25 ? 'Low' : 'Critical'}
                  </div>
                  {fuelLevel < 25 && (
                    <div style={{ marginTop: 8, padding: '4px 8px', background: 'var(--red-light)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={12} color="var(--red)" />
                      <span className="text-xs" style={{ color: 'var(--red-dark)' }}>Refuel soon</span>
                    </div>
                  )}
                </div>

                {/* Engine Temperature */}
                <div style={{ 
                  padding: '1.25rem', 
                  borderRadius: 12, 
                  background: 'rgba(255,255,255,0.02)',
                  border: `2px solid ${getTempColor()}20`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Thermometer size={18} color={getTempColor()} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>ENGINE</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <MetricValue value={Math.round(engineTemp)} suffix="" color={getTempColor()} style={{ fontSize: '2rem', fontWeight: 700 }} />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>°C</span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                    {engineTemp < 95 ? 'Normal' : engineTemp < 100 ? 'Warm' : 'Hot'}
                  </div>
                  {engineTemp >= 100 && (
                    <div style={{ marginTop: 8, padding: '4px 8px', background: 'var(--red-light)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={12} color="var(--red)" />
                      <span className="text-xs" style={{ color: 'var(--red-dark)' }}>High temp</span>
                    </div>
                  )}
                </div>

              </div>
            </GlassCard>

            {/* Live Patient Vitals - Section 23 of the original spec:
                "Advanced patient vital integration", previously just a
                future-enhancements bullet point, never built. */}
            {mySession && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <div className="card-title-icon"><Tooltip label="Simulated live vitals, updating every second"><span>❤️</span></Tooltip></div>
                    Patient Vitals
                  </div>
                  <span className="text-xs text-quiet" style={{ textTransform: 'capitalize' }}>{mySession.patient.severity}</span>
                </div>
                <div className="card-body">
                  <VitalsMonitor vitals={mySession.vitals} severity={mySession.patient.severity} />
                </div>
              </div>
            )}

            {/* Dual Detection Panel */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <div className="card-title-icon"><Video size={16} /></div>
                  Emergency Verification
                </div>
                <Tooltip label="Simulate a new camera detection reading">
                  <button onClick={toggleCameraDetect} disabled={!mySession || polling} className="btn btn-ghost btn-sm">
                    <RefreshCw size={12} className={polling ? 'spin' : ''} /> Toggle
                  </button>
                </Tooltip>
              </div>

              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.72rem', fontWeight: 800, letterSpacing: '1px', color: !mySession ? 'var(--text-tertiary)' : isVerified ? 'var(--green-dark)' : 'var(--orange)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: !mySession ? '#c9c2b8' : isVerified ? 'var(--green)' : 'var(--orange)' }} />
                  {!mySession ? 'STANDBY — AWAITING EMERGENCY ACTIVATION' : isVerified ? 'EMERGENCY VERIFIED' : 'VERIFYING…'}
                </div>

              {/* Camera */}
              <div className="detection-row">
                <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '1.5px', color: 'var(--text-tertiary)', marginBottom: 6 }}>CAMERA — YOLO OBJECT DETECTION</div>
                <div className="detection-label">
                  <div className="flex items-center gap-2">
                    <Video size={14} color={mySession?.cameraDetected ? 'var(--c-green)' : 'var(--c-red)'} />
                    <span className="text-sm">Camera · YOLO Object Detection</span>
                    {mySession?.cameraDetected && <LiveBadge variant="green" />}
                  </div>
                  <StatusPulse 
                    status={mySession?.cameraDetected ? 'active' : 'error'} 
                    label={mySession?.cameraDetected ? 'DETECTED' : 'NO SIGNAL'}
                    size="sm"
                  />
                </div>
                <AnimatedProgress 
                  value={mySession?.cameraConfidence ?? 0} 
                  height={10} 
                  color={mySession?.cameraDetected ? 'var(--green)' : 'var(--red)'}
                />
                <div className="text-xs text-muted mt-1">
                  Confidence: <MetricValue value={mySession?.cameraConfidence ?? 0} suffix="%" color="var(--text-primary)" /> · Threshold: ≥75%
                </div>

                {/* Real YOLO26 model inference - upload/capture an actual frame
                    instead of the simulated toggle above. Runs through your
                    trained best.onnx via the detection microservice. */}
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: mySession ? 'pointer' : 'not-allowed', opacity: mySession ? 1 : 0.5 }}>
                    <Video size={12} /> {realDetectLoading ? 'Analyzing…' : 'Test Real Detection (upload frame)'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      disabled={!mySession || realDetectLoading}
                      onChange={handleRealFrameUpload}
                    />
                  </label>
                  {realDetectResult && (
                    <span className="text-xs" style={{ color: realDetectResult.detected ? 'var(--green)' : 'var(--red)' }}>
                      {realDetectResult.detected ? `Real model: Ambulance ${realDetectResult.confidence}%` : 'Real model: no ambulance found'}
                      {realDetectResult.sirenDetected ? ` · Siren light ${realDetectResult.sirenConfidence}%` : ''}
                    </span>
                  )}
                </div>

                {/* CCTV feed simulation - a video stands in for a live
                    roadside camera, frames are periodically grabbed and
                    run through the real model, exactly like a real
                    camera integration would work. */}
                {mySession && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <div className="text-xs font-semibold text-muted mb-2" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Video size={12} /> Simulated CCTV Feed
                    </div>
                    <CCTVFeedSimulator
                      rid={mySession.rid}
                      onDetection={(result) => {
                        setRealDetectResult(result);
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Siren */}
              <div className="detection-row" style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '1.5px', color: 'var(--text-tertiary)', marginBottom: 6 }}>SIREN — AUDIO FFT</div>
                <div className="detection-label">
                  <div className="flex items-center gap-2">
                    <Mic2 size={14} color={mySession?.sirenDetected ? 'var(--c-green)' : 'var(--c-red)'} />
                    <span className="text-sm">Siren Sensor · Audio FFT</span>
                    {mySession?.sirenDetected && <LiveBadge variant="green" />}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <StatusPulse 
                      status={mySession?.sirenDetected ? 'active' : 'idle'} 
                      label={mySession?.sirenDetected ? `${mySession.sirenFrequency} Hz` : 'SILENT'}
                      size="sm"
                    />
                    <Tooltip label="Simulate a new siren frequency reading">
                      <button onClick={toggleSirenDetect} disabled={!mySession || polling} className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>Toggle</button>
                    </Tooltip>
                  </div>
                </div>
                <SirenWaveform active={mySession?.sirenDetected ?? false} frequency={mySession?.sirenFrequency ?? 0} />
                <div className="text-xs text-muted mt-1">
                  Frequency: <MetricValue value={mySession?.sirenFrequency ?? 0} suffix=" Hz" color="var(--text-primary)" /> · Threshold: ≥700 Hz
                </div>

                {/* Real FFT-based audio analysis - upload an actual WAV clip
                    instead of the simulated toggle above. Runs genuine signal
                    processing (spectral energy + sweep periodicity) via the
                    detection microservice. */}
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: mySession ? 'pointer' : 'not-allowed', opacity: mySession ? 1 : 0.5 }}>
                    <Mic2 size={12} /> {realSirenLoading ? 'Analyzing…' : 'Test Real Detection (upload WAV)'}
                    <input
                      type="file"
                      accept="audio/wav,.wav"
                      style={{ display: 'none' }}
                      disabled={!mySession || realSirenLoading}
                      onChange={handleRealAudioUpload}
                    />
                  </label>
                  {realSirenResult && (
                    <span className="text-xs" style={{ color: realSirenResult.sirenDetected ? 'var(--green)' : 'var(--red)' }}>
                      Real FFT: {realSirenResult.sirenDetected ? `Siren detected (${realSirenResult.confidence}%)` : `No siren pattern (${realSirenResult.confidence}%)`}
                    </span>
                  )}
                </div>
              </div>

              {/* Overall verification */}
              <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '1.5px', color: 'var(--text-tertiary)', marginTop: 12, marginBottom: 6 }}>OVERALL VERIFICATION</div>
              <div className={`mt-3 p-3 rounded flex items-center gap-3`} style={{
                background: isVerified ? 'var(--green-light)' : 'var(--red-light)',
                border: `1px solid ${isVerified ? 'rgba(52,199,89,0.25)' : 'rgba(255,59,48,0.2)'}`,
              }}>
                {isVerified
                  ? <><CheckCircle2 size={18} color="var(--green)" /><div><div className="text-sm font-semibold text-green">Verified — Corridor authorised</div><div className="text-xs text-muted">{mySession?.cameraDetected && mySession?.sirenDetected ? 'Camera ✓ + Siren ✓' : mySession?.cameraDetected ? 'Camera ✓ (Siren fallback)' : 'Siren ✓ (Camera fallback)'}</div></div></>
                  : <><XCircle size={18} color="var(--red)" /><div><div className="text-sm font-semibold text-red">{isEmergency ? 'Both sensors failed — fail-safe active (manual)' : 'Awaiting emergency activation'}</div></div></>
                }
              </div>
            </div>
            </div>

          </div>

          {/* ── Right: Signals + Route ── */}
          <div className="flex flex-col gap-4">

            {/* Signal Matrix */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <div className="card-title-icon" style={{ background: 'var(--orange-light)', color: 'var(--orange)' }}><Activity size={16} /></div>
                  Signal Corridor Matrix
                </div>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.8px', color: isEmergency ? 'var(--green-dark)' : 'var(--text-tertiary)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: isEmergency ? (greenCount > 0 ? 'var(--green)' : 'var(--orange)') : '#c9c2b8' }} />
                  {isEmergency ? `GREEN CORRIDOR ACTIVE · ${greenCount}/${signalTotal} SIGNALS GREEN` : 'STANDBY — CORRIDOR ARMS ON ACTIVATION'}
                </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(95px, 1fr))', gap: 10 }}>
                {state?.signals.map(sig => {
                  const onRoute = !!mySession?.route.includes(sig.junction);
                  const emphasized = isEmergency && onRoute;
                  return (
                  <div key={sig.id} className="card-stat" style={{
                    padding: '1rem', gap: '0.5rem',
                    border: emphasized && sig.color === 'GREEN' ? '2px solid rgba(52,199,89,0.5)' : undefined,
                    boxShadow: emphasized && sig.color === 'GREEN' ? '0 0 16px rgba(52,199,89,0.25)' : undefined,
                    opacity: isEmergency && !onRoute ? 0.55 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{sig.name}</span>
                      {sig.manualOverride && (
                        <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'var(--orange-light)', color: 'var(--orange)', borderRadius: 6, fontWeight: 600 }}>MANUAL</span>
                      )}
                      {sig.contested ? (
                        <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'var(--orange-light)', color: 'var(--orange)', borderRadius: 6, fontWeight: 800 }} title="Multiple ambulances near this signal — higher severity wins">⚠ CONTESTED</span>
                      ) : null}
                    </div>
                    <TrafficLight color={sig.color} name="" size="sm" />
                    <div className="text-xs mono" style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.25rem' }}>{sig.timer}s</div>
                  </div>
                  );
                })}
              </div>
            </div>
            </div>

            {/* Route Steps */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <div className="card-title-icon" style={{ background: 'var(--green-light)', color: 'var(--green)' }}><Navigation size={16} /></div>
                  Route Sequence
                </div>
              </div>
              <div className="card-body" style={{ gap: 0 }}>
              {(mySession?.route ?? ['Indiranagar Metro (Dispatch)', '100 Feet Road Junction', 'Manipal Hospital']).map((node, i) => {
                const route       = mySession?.route ?? ['Indiranagar Metro (Dispatch)', '100 Feet Road Junction', 'Manipal Hospital'];
                const isCurrent   = isEmergency && i === mySession!.currentNodeIndex;
                const isPassed    = isEmergency && i < mySession!.currentNodeIndex;
                const isDestination = i === route.length - 1;
                const hasSignal   = (state?.signals ?? []).some(s => s.junction === node);
                const subLabel    = isDestination ? 'Destination' : i === 0 ? 'Dispatch point' : hasSignal ? 'Signal corridor' : 'Waypoint';
                return (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '4px 0' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700,
                        background: isCurrent ? 'var(--c-green-dim)' : isPassed ? 'rgba(93,125,166,0.1)' : 'rgba(255,255,255,0.04)',
                        border: `1.5px solid ${isCurrent ? 'var(--c-green)' : isPassed ? '#5D7DA6' : '#2a3958'}`,
                        color:  isCurrent ? 'var(--c-green)' : isPassed ? '#5D7DA6' : '#4a5878',
                        boxShadow: isCurrent ? '0 0 12px rgba(134,171,151,0.3)' : 'none',
                        zIndex: 1,
                      }}>
                        {isDestination ? '🏥' : isPassed && isEmergency ? '✓' : `0${i + 1}`.slice(-2)}
                      </div>
                      {i < route.length - 1 && (
                        <div style={{ width: 2, flex: 1, minHeight: 14, background: isPassed ? '#5D7DA6' : 'rgba(0,0,0,0.08)', borderRadius: 1, opacity: isPassed ? 0.7 : 1 }} />
                      )}
                    </div>
                    <div style={{ flex: 1, paddingBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="text-sm flex-1" style={{ color: isCurrent ? 'var(--c-green)' : isPassed && isEmergency ? 'var(--text-tertiary)' : 'var(--text-primary)', fontWeight: isCurrent ? 600 : 400 }}>
                          {node}
                        </span>
                        {isCurrent   && <span className="status-badge badge-green" style={{ fontSize: '0.65rem' }}>HERE</span>}
                        {isPassed && isEmergency && <span className="text-xs text-quiet">✓ passed</span>}
                      </div>
                      <div className="text-xs text-quiet" style={{ marginTop: 2 }}>{subLabel}</div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Session Event Timeline (full width) ── */}
        <div className="card mt-4" style={{ maxHeight: 300 }}>
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon" style={{ background: 'var(--purple-light)', color: 'var(--purple)' }}><Terminal size={16} /></div>
              Session Event Timeline
            </div>
            <span className="text-xs text-quiet">{myLogs.length} events</span>
          </div>
          <div className="card-body" style={{ overflowY: 'auto', gap: 0 }}>
            {myLogs.map(log => (
              <div key={log.id} className="log-entry" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                  background: log.type === 'error' ? 'var(--red)' : log.type === 'success' ? 'var(--green)' : log.type === 'warning' ? 'var(--orange)' : log.type === 'system' ? 'var(--blue)' : '#c9c2b8',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="log-time">{new Date(log.timestamp).toLocaleTimeString('en-IN', { hour12: false })}</div>
                  <div className="log-msg" style={{ color: log.type === 'error' ? 'var(--red)' : log.type === 'success' ? 'var(--green)' : log.type === 'warning' ? 'var(--orange)' : 'var(--text-secondary)' }}>
                    {log.message}
                  </div>
                </div>
              </div>
            ))}
            {myLogs.length === 0 && <div className="text-xs text-quiet text-center mt-4">No events yet</div>}
          </div>
        </div>
      </div>
    </>
  );
};

export default Driver;
