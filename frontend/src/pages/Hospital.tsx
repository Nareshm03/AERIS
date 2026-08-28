import React, { useState, useEffect } from 'react';
import { Activity, Clock, BedDouble, CheckCheck, Siren, PhoneCall, MapPin, Plus, Minus } from 'lucide-react';
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
            <h1 className="page-title">Emergency Reception</h1>
            <p className="page-subtitle">{session ? `${session.hospital.name} · Emergency Gateway` : 'Emergency Gateway'} · ICU Interface</p>
          </div>
          <span className={`status-badge ${activeSessions.length > 0 ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
            {activeSessions.length > 0
              ? `🔴 ${activeSessions.length} INBOUND UNIT${activeSessions.length > 1 ? 'S' : ''}`
              : '🟢 STANDBY — ALL CLEAR'}
          </span>
        </div>

        {/* Bed capacity - real-time, editable. Closes a gap that was in
            the original spec's DB schema (emergencyCapacity: totalBeds,
            availableBeds) but never implemented until now. */}
        <div className="card mb-4 animate-fade-up">
          <div className="section-title mb-3"><BedDouble size={14} /> Bed Capacity (all network hospitals)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {hospitals.map(h => {
              const pct = h.totalBeds > 0 ? (h.availableBeds / h.totalBeds) * 100 : 0;
              const color = h.availableBeds === 0 ? 'var(--red-bright)' : pct <= 15 ? 'var(--orange)' : 'var(--green)';
              return (
                <div key={h.id} style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <div className="text-sm font-semibold mb-1">{h.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Tooltip label="Decrease available beds">
                      <button onClick={() => handleBedUpdate(h.id, -1)} disabled={savingBeds === h.id || h.availableBeds <= 0} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}>
                        <Minus size={12} />
                      </button>
                    </Tooltip>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '1.1rem', color }}>{h.availableBeds}</span>
                      <span className="text-xs text-quiet"> / {h.totalBeds} beds</span>
                    </div>
                    <Tooltip label="Increase available beds">
                      <button onClick={() => handleBedUpdate(h.id, 1)} disabled={savingBeds === h.id || h.availableBeds >= h.totalBeds} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}>
                        <Plus size={12} />
                      </button>
                    </Tooltip>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: 'rgba(0,0,0,0.06)', marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {activeSessions.length === 0 ? (
          <div className="card text-center animate-fade-in" style={{ padding: '5rem 2rem', borderStyle: 'dashed' }}>
            <Activity size={48} color="var(--text-tertiary)" style={{ margin: '0 auto 16px' }} />
            <h3 className="font-semibold text-lg mb-2">No Active Emergency</h3>
            <p className="text-muted text-sm mb-6">AERIS is monitoring. All bays are clear.</p>
            <div className="flex justify-center gap-3" style={{ flexWrap: 'wrap' }}>
              {['Bay 01 — Open', 'Bay 02 — Open', 'Trauma — Standby', 'ICU — 2 Free'].map(b => (
                <span key={b} className="status-badge badge-green">{b}</span>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Session Tabs (if multiple ambulances) */}
            {activeSessions.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {activeSessions.map(s => (
                  <button key={s.rid} onClick={() => setSelectedRID(s.rid)} style={{
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
                {/* Inbound Banner */}
                <div className="card card-emergency mb-4 animate-fade-in" style={{ borderColor: 'rgba(239,68,68,0.45)', padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
                    <div>
                      <div className="section-title mb-2"><Siren size={15} color="var(--c-red)" /> Inbound Emergency Unit</div>
                      <CopyableText value={session.rid} className="mono font-extrabold" style={{ fontSize: '2rem', color: 'var(--c-red-bright)', letterSpacing: 2 }} />
                      <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
                        <span className="status-badge badge-red">Priority 1</span>
                        <span className="status-badge badge-yellow">Green Corridor</span>
                        <span className="status-badge badge-blue">{session.routeName}</span>
                        <LiveBadge variant="red" />
                        {session.cameraDetected && <StatusPulse status="active" label="CAM" size="sm" />}
                        {session.sirenDetected  && <StatusPulse status="active" label="SIREN" size="sm" />}
                      </div>
                    </div>

                    {/* ETA Clock */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0,0,0,0.04)', borderRadius: 16, padding: '1.25rem 2rem', border: '1px solid rgba(200,155,92,0.3)', minWidth: 180, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, transparent, rgba(200,155,92,0.05), transparent)', animation: 'shimmer 3s infinite' }} />
                      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                        <Clock size={28} color="var(--c-yellow)" style={{ marginBottom: 8, animation: 'pulse 2s ease-in-out infinite' }} />
                        <div className="mono font-extrabold" style={{ fontSize: '2.8rem', color: 'var(--c-yellow)', lineHeight: 1, textShadow: '0 2px 8px rgba(200,155,92,0.3)' }}>{etaDisplay}</div>
                        <div className="text-xs text-muted mt-2" style={{ letterSpacing: 1 }}>ARRIVAL</div>
                        <div style={{ width: '100%', marginTop: 12 }}>
                          <AnimatedProgress value={etaProgress} height={6} color="var(--orange)" />
                        </div>
                        <LiveBadge variant="red" />
                      </div>
                    </div>

                    {/* Severity - set by the driver at patient intake, not editable here */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="text-xs text-muted font-semibold" style={{ letterSpacing: 1, textTransform: 'uppercase' }}>Severity (from intake)</div>
                      <div style={{
                        padding: '6px 16px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                        border: `1px solid ${SEV_COLORS[sev]}80`,
                        background: SEV_COLORS[sev] + '18',
                        color: SEV_COLORS[sev],
                      }}>{sev.toUpperCase()}</div>
                    </div>
                  </div>
                </div>

                {session.patient?.condition && (
                  <div className="card mb-4 animate-fade-in" style={{ padding: '1rem 1.5rem' }}>
                    <div className="text-xs text-quiet mb-1">Patient Condition (from driver intake)</div>
                    <div className="text-sm font-semibold">{session.patient.condition}</div>
                    {session.patient.notes && <div className="text-xs text-muted mt-1">{session.patient.notes}</div>}
                  </div>
                )}

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
                        <span className="flex items-center gap-2"><BedDouble size={14} /> Bay Preparation</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <CircularProgress 
                            value={checklist.filter(c => c.done).length} 
                            max={Math.max(checklist.length, 1)} 
                            size={50} 
                            color="var(--green)"
                          />
                          {!session.hospitalAcknowledged
                            ? <Tooltip label="Confirm your hospital has seen this incoming emergency"><button onClick={() => handleAcknowledge(session.rid)} className="btn btn-success btn-sm">Acknowledge</button></Tooltip>
                            : <StatusPulse status="active" label="ACK'D" size="md" />
                          }
                        </div>
                      </div>
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

                    {/* Patient Profile */}
                    <div className="card animate-fade-up">
                      <div className="section-title"><PhoneCall size={14} /> Patient Profile</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '0.8rem' }}>
                        {[
                          ['Case RID',       session.rid],
                          ['Hospital',       session.hospital?.name || '—'],
                          ['Severity',       sev.toUpperCase()],
                          ['Department',     session.patient?.requiredDepartment || 'General Emergency'],
                          ['Route',          session.routeName],
                          ['ETA',            etaMins > 0 ? `~${etaMins} min` : 'Arriving NOW'],
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
      </div>
    </>
  );
};

export default Hospital;
