import React, { useState, useEffect } from 'react';
import { Activity, BedDouble, CheckCheck, Siren, PhoneCall, MapPin, Plus, Minus } from 'lucide-react';
import { useSSE } from '../hooks/usePoll';
import Nav from '../components/Nav';
import InteractiveMap from '../components/InteractiveMap';
import { useToast } from '../components/Toast';
import type { AmbulanceSession, Hospital as HospitalType } from '../api';
import { acknowledgeEmergency, togglePrepTask, fetchHospitals, updateHospitalCapacity } from '../api';
import { LiveBadge, AnimatedProgress, CircularProgress, StatusPulse } from '../components/LiveIndicators';
import CopyableText from '../components/CopyableText';
import Tooltip from '../components/Tooltip';
import { useStaircaseLoading, DashboardSkeleton } from '../components/SkeletonLoader';
import VitalsMonitor from '../components/VitalsMonitor';
import { soundManager } from '../utils/sound';

type Severity = 'critical' | 'serious' | 'stable';

const SEV_COLORS: Record<Severity, string> = {
  critical: 'var(--c-red)',
  serious:  'var(--c-yellow)',
  stable:   'var(--c-green)',
};

const Hospital: React.FC = () => {
  const { state, connected } = useSSE();
  const { toast } = useToast();

  const [tick, setTick]           = useState(0);
  const [selectedRID, setSelectedRID] = useState<string | null>(null);
  const [hospitals, setHospitals] = useState<HospitalType[]>([]);
  const [savingBeds, setSavingBeds] = useState<string | null>(null);

  useEffect(() => {
    const loadHospitals = async () => {
      try {
        const data = await fetchHospitals();
        setHospitals(data);
      } catch (err) {
        console.error('Failed to load hospitals', err);
      }
    };
    loadHospitals();
  }, []);

  const handleBedUpdate = async (hospitalId: string, delta: number) => {
    const h = hospitals.find(x => x.id === hospitalId);
    if (!h) return;
    const next = Math.max(0, Math.min(h.totalBeds, h.availableBeds + delta));
    setSavingBeds(hospitalId);
    try {
      const res = await updateHospitalCapacity(hospitalId, next);
      setHospitals(prev => prev.map(x => x.id === hospitalId ? res.hospital : x));
    } catch (err: any) {
      toast(err.message || 'Failed to update bed count', 'error');
    } finally {
      setSavingBeds(null);
    }
  };

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-select the first active session
  const activeSessions = state?.sessions.filter(s => s.status === 'active') ?? [];
  const session: AmbulanceSession | undefined = activeSessions.find(s => s.rid === selectedRID) ?? activeSessions[0];

  // Notify on new sessions arriving
  const prevCount = React.useRef(0);
  useEffect(() => {
    if (activeSessions.length > prevCount.current) {
      const newest = activeSessions[activeSessions.length - 1];
      toast(`Inbound emergency: ${newest.rid} — ${newest.patient?.condition ?? 'Activate bay prep'}`, 'error');
      soundManager.playEmergencyAlert();
    }
    prevCount.current = activeSessions.length;
  }, [activeSessions.length]);

  const handleAcknowledge = async (rid: string) => {
    try {
      await acknowledgeEmergency(rid);
      toast(`Acknowledged incoming ${rid}`, 'success');
      soundManager.playSuccess();
    } catch (err: any) {
      toast(err.message || 'Failed to acknowledge', 'error');
    }
  };

  const handleTogglePrep = async (rid: string, taskId: string, currentlyDone: boolean) => {
    try {
      await togglePrepTask(rid, taskId, !currentlyDone);
    } catch (err: any) {
      toast(err.message || 'Failed to update prep task', 'error');
    }
  };

  const nodesLeft   = session ? session.route.length - 1 - session.currentNodeIndex : 0;
  const etaMins     = nodesLeft * 2;
  const totalSecs   = etaMins * 60;
  const elapsed     = tick % Math.max(totalSecs, 1);
  const remainSecs  = Math.max(0, totalSecs - elapsed);
  const mm = String(Math.floor(remainSecs / 60)).padStart(2, '0');
  const ss = String(remainSecs % 60).padStart(2, '0');
  const etaDisplay  = etaMins > 0 ? `${mm}:${ss}` : 'ARRIVING';
  const etaProgress = totalSecs > 0 ? Math.min(100, (elapsed / totalSecs) * 100) : 100;

  // Real severity from the driver's patient intake at activation - no
  // longer a hospital-side guess with no backing data.
  const sev: Severity = session?.patient?.severity ?? 'serious';

  // Real prep checklist, synced from the backend and toggleable here -
  // replaces the old hardcoded/derived fake checklist.
  const checklist = session?.prepTasks ?? [];

  const loadStage = useStaircaseLoading(!state);

  if (!state) return (
    <>
      <Nav roleName="Hospital Staff" roleColor="#86AB97" connected={connected} />
      {loadStage === 'skeleton' ? <DashboardSkeleton /> : loadStage === 'spinner' ? (
        <div className="loading-screen"><div className="spinner" /><span>Connecting to AERIS stream...</span></div>
      ) : null}
    </>
  );

  return (
    <>
      <Nav roleName="Hospital Staff" roleColor="#86AB97" connected={connected} />
      <div className="container animate-fade-up">

        <div className="page-header">
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '2px', color: activeSessions.length > 0 ? 'var(--c-red-bright)' : 'var(--green-dark)', marginBottom: 4 }}>
              {activeSessions.length > 0
                ? `● INBOUND EMERGENCY · ${activeSessions.length} AMBULANCE${activeSessions.length > 1 ? 'S' : ''}`
                : '● NO ACTIVE INBOUND'}
            </div>
            <h1 className="page-title">Hospital Emergency Center</h1>
            <p className="page-subtitle">Inbound ambulance monitoring · Patient intake · Resource preparation</p>
          </div>
          <span className={`status-badge ${activeSessions.length > 0 ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
            {activeSessions.length > 0
              ? `🔴 ${activeSessions.length} INBOUND UNIT${activeSessions.length > 1 ? 'S' : ''}`
              : '🟢 STANDBY — ALL CLEAR'}
          </span>
        </div>

        {activeSessions.length === 0 ? (
          <div className="card mb-4 animate-fade-in" style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
            <Activity size={40} color="var(--green)" style={{ margin: '0 auto 12px' }} />
            <h3 className="font-semibold text-lg mb-1">Hospital Ready</h3>
            <p className="text-muted text-sm mb-4">No active inbound ambulance.<br />The hospital is monitoring the emergency network.</p>
            <div className="flex justify-center gap-3" style={{ flexWrap: 'wrap' }}>
              <span className="status-badge badge-green">● OPERATIONAL — Inbound monitoring</span>
              <span className={`status-badge ${connected ? 'badge-blue' : 'badge-yellow'}`}>SSE {connected ? '● CONNECTED' : '○ RECONNECTING'}</span>
            </div>
          </div>
        ) : (
          <>
            {/* Session Tabs (if multiple ambulances) */}
            {activeSessions.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {activeSessions.map(s => (
                  <button key={s.id} onClick={() => setSelectedRID(s.rid)} style={{
                    padding: '6px 16px', borderRadius: 16, cursor: 'pointer',
                    background: session?.rid === s.rid ? 'rgba(239,68,68,0.12)' : 'rgba(0,0,0,0.04)',
                    border: `1px solid ${session?.rid === s.rid ? 'rgba(239,68,68,0.3)' : 'rgba(0,0,0,0.08)'}`,
                    color: session?.rid === s.rid ? 'var(--c-red-bright)' : 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: session?.rid === s.rid ? 700 : 400,
                  }}>
                    🚑 {s.rid}
                  </button>
                ))}
              </div>
            )}

            {session && (
              <>
                {/* Inbound hero: ambulance, route position, ETA, status */}
                <div className="card card-emergency mb-4 animate-fade-in" style={{ borderColor: 'rgba(239,68,68,0.45)', padding: '1.5rem' }}>
                  <div className="section-title mb-3"><Siren size={15} color="var(--c-red)" /> Inbound Ambulance</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                    <CopyableText value={session.rid} className="mono font-extrabold" style={{ fontSize: '2rem', color: 'var(--c-red-bright)', letterSpacing: 2 }} />
                    <span className={`status-badge ${etaMins > 0 ? 'badge-red' : 'badge-green'}`}>{etaMins > 0 ? 'INBOUND' : 'ARRIVING'}</span>
                    <LiveBadge variant="red" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                    <div>
                      <div className="text-xs text-quiet mb-1">FROM — CURRENT POSITION</div>
                      <div className="text-sm font-semibold">{session.route[session.currentNodeIndex]}</div>
                    </div>
                    <div>
                      <div className="text-xs text-quiet mb-1">DESTINATION</div>
                      <div className="text-sm font-semibold">{session.hospital.name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-quiet mb-1">ETA</div>
                      <div className="mono font-extrabold" style={{ fontSize: '1.6rem', color: 'var(--c-yellow)', lineHeight: 1.1 }}>{etaDisplay}</div>
                      <div style={{ marginTop: 8 }}>
                        <AnimatedProgress value={etaProgress} height={6} color="var(--orange)" />
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-quiet mb-1">ROUTE</div>
                      <div className="text-sm font-semibold">{session.routeName.split(' (')[0]}</div>
                      <div className="text-xs text-muted mt-1">Node {session.currentNodeIndex + 1} of {session.route.length}</div>
                    </div>
                  </div>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="status-badge badge-red">Priority 1</span>
                    <span className="status-badge badge-yellow">Green Corridor</span>
                    {session.cameraDetected && <StatusPulse status="active" label="CAM" size="sm" />}
                    {session.sirenDetected  && <StatusPulse status="active" label="SIREN" size="sm" />}
                    <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>Severity (from intake): <strong style={{ color: SEV_COLORS[sev] }}>{sev.toUpperCase()}</strong></span>
                  </div>
                </div>

                {/* Map + Checklist */}
                <div className="grid-2 stagger">
                  <div className="flex flex-col gap-4">
                    <div className="card animate-fade-up">
                      <div className="section-title"><MapPin size={14} /> Live Unit Position</div>
                      <InteractiveMap 
                        sessions={[session]} 
                        signals={[]} 
                        centerOnAmbulance={true}
                        showTraffic={false}
                        showLegend={true}
                        height="400px"
                      />
                      <div className="flex flex-col mt-3" style={{ gap: 5 }}>
                        {session.route.map((node, i) => {
                          const isCurr = i === session.currentNodeIndex;
                          return (
                            <div key={i} className="flex items-center gap-3 p-2 rounded" style={{
                              background: isCurr ? 'var(--c-green-dim)' : 'transparent',
                              border: `1px solid ${isCurr ? 'rgba(110,148,129,0.2)' : 'transparent'}`,
                            }}>
                              <div className={`dot ${isCurr ? 'dot-green' : 'dot-inactive'}`} />
                              <span className="text-sm" style={{ color: isCurr ? 'var(--c-green)' : i < session.currentNodeIndex ? 'var(--text-tertiary)' : 'var(--text-secondary)', fontWeight: isCurr ? 600 : 400 }}>
                                {i === session.route.length - 1 ? '🏥 ' : ''}{node}
                              </span>
                              {isCurr && <span className="status-badge badge-green text-xs ml-auto">CURRENT</span>}
                              {i < session.currentNodeIndex && <span className="text-xs text-quiet ml-auto">✓ Passed</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    {/* Bay Prep */}
                    <div className="card animate-fade-up">
                      <div className="section-title flex justify-between" style={{ marginBottom: 12 }}>
                        <span className="flex items-center gap-2"><BedDouble size={14} /> Emergency Preparation</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span className="text-xs text-quiet">{checklist.filter(c => c.done).length}/{checklist.length} ready</span>
                          <CircularProgress
                            value={checklist.filter(c => c.done).length}
                            max={Math.max(checklist.length, 1)}
                            size={50}
                            color="var(--green)"
                          />
                          {!session.hospitalAcknowledged
                            ? <Tooltip label="Confirm your hospital has seen this incoming emergency"><button onClick={() => handleAcknowledge(session.rid)} className="btn btn-success btn-sm">Acknowledge Inbound</button></Tooltip>
                            : <StatusPulse status="active" label="ACK'D" size="md" />
                          }
                        </div>
                      </div>
                      {!session.hospitalAcknowledged ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 8, background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.25)', borderRadius: 12, fontSize: '0.78rem', fontWeight: 700, color: 'var(--orange-dark)' }}>
                          ⚠ ACTION REQUIRED — Incoming emergency requires acknowledgement.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 8, background: 'rgba(52,199,89,0.07)', border: '1px solid rgba(52,199,89,0.2)', borderRadius: 12, fontSize: '0.78rem', fontWeight: 700, color: 'var(--green-dark)' }}>
                          ✓ INBOUND ACKNOWLEDGED — Hospital has acknowledged the incoming ambulance.
                        </div>
                      )}
                      {checklist.map((item) => (
                        <div key={item.id} onClick={() => handleTogglePrep(session.rid, item.id, item.done)}
                          className="flex items-center gap-3 p-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', cursor: 'pointer' }}>
                          <CheckCheck size={15} color={item.done ? 'var(--c-green)' : '#2a3958'} />
                          <span className="text-sm flex-1" style={{ color: item.done ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{item.label}</span>
                          {!item.done && <span className="text-xs text-quiet">Tap to mark done</span>}
                        </div>
                      ))}
                    </div>

                    {/* Live Patient Vitals - so hospital staff can prep based
                        on the patient's ACTUAL current state in transit,
                        not just the initial condition logged at pickup. */}
                    <div className="card animate-fade-up">
                      <div className="section-title mb-2">❤️ Live Vitals — {session.rid}</div>
                      <VitalsMonitor vitals={session.vitals} severity={sev} />
                    </div>

                    {/* Patient Information (driver intake — read-only here) */}
                    <div className="card animate-fade-up">
                      <div className="section-title"><PhoneCall size={14} /> Patient Information</div>
                      <div style={{ marginBottom: 12 }}>
                        <div className="text-xs text-quiet mb-1">PATIENT CONDITION</div>
                        <div className="text-sm font-semibold" style={{ fontSize: '1rem' }}>{session.patient?.condition || 'Not specified'}</div>
                        {session.patient?.notes && <div className="text-xs text-muted mt-1">{session.patient.notes}</div>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '0.8rem' }}>
                        {[
                          ['Emergency',      session.patient?.requiredDepartment || 'General Emergency'],
                          ['Severity',       sev.toUpperCase()],
                          ['Ambulance',      session.rid],
                          ['Verified',       session.isVerified ? 'Yes (Dual sensor)' : 'Fail-safe'],
                          ['Acknowledged',   session.hospitalAcknowledged ? 'Yes' : 'Pending'],
                          ['Prep Progress',  `${checklist.filter(c => c.done).length}/${checklist.length} tasks`],
                        ].map(([k, v]) => (
                          <div key={k} style={{ padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                            <div className="text-xs text-quiet mb-1">{k}</div>
                            <div className="font-semibold" style={{ fontSize: '0.82rem', color: k === 'Severity' ? SEV_COLORS[sev] : 'var(--text-primary)' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Bed capacity - real-time, editable. AVAILABLE emphasized with
            OCCUPIED/TOTAL context; restrained semantic color only. */}
        <div className="card mt-4 animate-fade-up">
          <div className="section-title mb-3"><BedDouble size={14} /> Bed Capacity</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {hospitals.map(h => {
              const pct = h.totalBeds > 0 ? (h.availableBeds / h.totalBeds) * 100 : 0;
              const occupied = h.totalBeds - h.availableBeds;
              const color = h.availableBeds === 0 ? 'var(--red-bright)' : pct <= 15 ? 'var(--orange)' : 'var(--green)';
              return (
                <div key={h.id} style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <div className="text-sm font-semibold mb-1">{h.name}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: '1.6rem', color }}>{h.availableBeds}</span>
                    <span className="text-xs text-quiet">AVAILABLE</span>
                    <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>{occupied} occupied · {h.totalBeds} total</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Tooltip label="Decrease available beds">
                      <button onClick={() => handleBedUpdate(h.id, -1)} disabled={savingBeds === h.id || h.availableBeds <= 0} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}>
                        <Minus size={12} />
                      </button>
                    </Tooltip>
                    <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.3s ease' }} />
                    </div>
                    <Tooltip label="Increase available beds">
                      <button onClick={() => handleBedUpdate(h.id, 1)} disabled={savingBeds === h.id || h.availableBeds >= h.totalBeds} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}>
                        <Plus size={12} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

export default Hospital;
