import React, { useState, useEffect } from 'react';
import { Activity, Clock, BedDouble, CheckCheck, Siren, PhoneCall, MapPin, TrendingDown } from 'lucide-react';
import { useSSE } from '../hooks/usePoll';
import Nav from '../components/Nav';
import RouteMap from '../components/RouteMap';
import InteractiveMap from '../components/InteractiveMap';
import { useToast } from '../components/Toast';
import type { AmbulanceSession } from '../api';
import { LiveBadge, AnimatedProgress, CircularProgress, LiveMetricCard, StatusPulse } from '../components/LiveIndicators';
import { GlassCard, MetricCard } from '../components/EnhancedCard';

type Severity = 'critical' | 'urgent' | 'stable';

const SEV_COLORS: Record<Severity, string> = {
  critical: 'var(--c-red)',
  urgent:   'var(--c-yellow)',
  stable:   'var(--c-green)',
};

const Hospital: React.FC = () => {
  const { state, connected } = useSSE();
  const { toast } = useToast();

  const [tick, setTick]           = useState(0);
  const [selectedRID, setSelectedRID] = useState<string | null>(null);
  const [severities, setSeverities] = useState<Record<string, Severity>>({});
  const [bayReady, setBayReady]   = useState<Record<string, boolean>>({});

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
      toast(`Inbound emergency: ${newest.rid} — Activate bay prep`, 'error');
    }
    prevCount.current = activeSessions.length;
  }, [activeSessions.length]);

  const setSeverity = (rid: string, sev: Severity) =>
    setSeverities(s => ({ ...s, [rid]: sev }));
  const markBayReady = (rid: string) => {
    setBayReady(s => ({ ...s, [rid]: true }));
    toast(`Bay marked READY for ${rid}`, 'success');
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

  const sev = session ? (severities[session.rid] ?? 'critical') : 'critical';

  const checklist = !session ? [] : [
    { task: 'Emergency bay cleared',           done: true },
    { task: 'Trauma team activated',           done: true },
    { task: 'Resuscitation trolley prepared',  done: true },
    { task: 'Notification sent to on-call ICU', done: nodesLeft <= 4 },
    { task: 'O-neg blood on standby',          done: nodesLeft <= 3 },
    { task: 'IV fluids & airway kit ready',    done: nodesLeft <= 2 },
    { task: 'Radiologist on standby',          done: nodesLeft <= 2 },
    { task: 'ICU bed reserved',                done: nodesLeft <= 1 },
    { task: 'Bay declared READY',              done: bayReady[session.rid] ?? false },
  ];

  return (
    <>
      <Nav roleName="Hospital Staff" roleColor="#10b981" connected={connected} />
      <div className="container animate-fade-up">

        <div className="page-header">
          <div>
            <h1 className="page-title">Emergency Reception</h1>
            <p className="page-subtitle">City Hospital · Emergency Gateway · ICU Interface</p>
          </div>
          <span className={`status-badge ${activeSessions.length > 0 ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
            {activeSessions.length > 0
              ? `🔴 ${activeSessions.length} INBOUND UNIT${activeSessions.length > 1 ? 'S' : ''}`
              : '🟢 STANDBY — ALL CLEAR'}
          </span>
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
                      <div className="mono font-extrabold" style={{ fontSize: '2rem', color: 'var(--c-red-bright)', letterSpacing: 2 }}>{session.rid}</div>
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
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0,0,0,0.04)', borderRadius: 16, padding: '1.25rem 2rem', border: '1px solid rgba(245,158,11,0.3)', minWidth: 180, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, transparent, rgba(245,158,11,0.05), transparent)', animation: 'shimmer 3s infinite' }} />
                      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                        <Clock size={28} color="var(--c-yellow)" style={{ marginBottom: 8, animation: 'pulse 2s ease-in-out infinite' }} />
                        <div className="mono font-extrabold" style={{ fontSize: '2.8rem', color: 'var(--c-yellow)', lineHeight: 1, textShadow: '0 2px 8px rgba(245,158,11,0.3)' }}>{etaDisplay}</div>
                        <div className="text-xs text-muted mt-2" style={{ letterSpacing: 1 }}>ARRIVAL</div>
                        <div style={{ width: '100%', marginTop: 12 }}>
                          <AnimatedProgress value={etaProgress} height={6} color="var(--orange)" />
                        </div>
                        <LiveBadge variant="red" />
                      </div>
                    </div>

                    {/* Severity picker */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="text-xs text-muted font-semibold" style={{ letterSpacing: 1, textTransform: 'uppercase' }}>Severity</div>
                      {(['critical', 'urgent', 'stable'] as Severity[]).map(s => (
                        <button key={s} onClick={() => setSeverity(session.rid, s)} style={{
                          padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: sev === s ? 700 : 400, transition: 'all 0.2s',
                          border: `1px solid ${sev === s ? SEV_COLORS[s] + '80' : 'rgba(255,255,255,0.07)'}`,
                          background: sev === s ? SEV_COLORS[s] + '18' : 'transparent',
                          color: sev === s ? SEV_COLORS[s] : '#4a5878',
                        }}>{s.toUpperCase()}</button>
                      ))}
                    </div>
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
                              border: `1px solid ${isCurr ? 'rgba(34,197,94,0.2)' : 'transparent'}`,
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
                            max={checklist.length} 
                            size={50} 
                            color="var(--green)"
                          />
                          {!(bayReady[session.rid])
                            ? <button onClick={() => markBayReady(session.rid)} className="btn btn-success btn-sm">Mark Ready</button>
                            : <StatusPulse status="active" label="READY" size="md" />
                          }
                        </div>
                      </div>
                      {checklist.map((item, i) => (
                        <div key={i} className="flex items-center gap-3 p-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                          <CheckCheck size={15} color={item.done ? 'var(--c-green)' : '#2a3958'} />
                          <span className="text-sm flex-1" style={{ color: item.done ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{item.task}</span>
                          {!item.done && <span className="text-xs text-quiet">Pending</span>}
                        </div>
                      ))}
                    </div>

                    {/* Patient Profile */}
                    <div className="card animate-fade-up">
                      <div className="section-title"><PhoneCall size={14} /> Patient Profile</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '0.8rem' }}>
                        {[
                          ['Case RID',   session.rid],
                          ['Severity',   sev.toUpperCase()],
                          ['Route',      session.routeName],
                          ['ETA',        etaMins > 0 ? `~${etaMins} min` : 'Arriving NOW'],
                          ['Verified',   session.isVerified ? 'Yes (Dual sensor)' : 'Fail-safe'],
                          ['Bay Status', (bayReady[session.rid] ?? false) ? 'READY' : 'Preparing...'],
                          ['Team',       'Trauma + Resus'],
                          ['Blood',      'O-Neg coordinating'],
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
