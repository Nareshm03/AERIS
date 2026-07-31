import React, { useEffect, useState } from 'react';
import { ShieldAlert, AlertTriangle, Timer, Layers, Activity, Construction } from 'lucide-react';
import { useSSE } from '../hooks/usePoll';
import { overrideSignal, listRoadblocks, reportRoadblock, clearRoadblock } from '../api';
import Nav from '../components/Nav';
import TrafficLight from '../components/TrafficLight';
import InteractiveMap from '../components/InteractiveMap';
import { useToast } from '../components/Toast';
import { LiveBadge, AnimatedProgress, StatusPulse, AnimatedCounter } from '../components/LiveIndicators';
import { MetricCard } from '../components/EnhancedCard';

// Adjacency mirrors backend CITY_GRAPH - kept here so the dropdown only ever
// offers valid, actually-adjacent junction pairs (matches server-side validation).
const CITY_GRAPH_JUNCTIONS: Record<string, string[]> = {
  'Dispatch Bay':     ['Junction A', 'Ring Road'],
  'Junction A':       ['Dispatch Bay', 'Junction B', 'Central Junction'],
  'Junction B':       ['Junction A', 'Central Junction', 'Medical Zone'],
  'Central Junction': ['Junction A', 'Junction B', 'Medical Zone', 'North Gate'],
  'Medical Zone':     ['Junction B', 'Central Junction', 'City Hospital'],
  'Ring Road':        ['Dispatch Bay', 'North Gate'],
  'North Gate':       ['Ring Road', 'Central Junction', 'City Hospital'],
  'City Hospital':    ['Medical Zone', 'North Gate'],
};
const ALL_JUNCTIONS = Object.keys(CITY_GRAPH_JUNCTIONS);

const selectStyle: React.CSSProperties = {
  maxWidth: 220,
  padding: '8px 12px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
};



const Police: React.FC = () => {
  const { state, connected } = useSSE();
  const { toast } = useToast();

  const [blocked, setBlocked] = useState<[string, string][]>([]);
  const [fromNode, setFromNode] = useState(ALL_JUNCTIONS[0]);
  const [toNode, setToNode] = useState(CITY_GRAPH_JUNCTIONS[ALL_JUNCTIONS[0]][0]);
  const [roadblockLoading, setRoadblockLoading] = useState(false);

  const refreshRoadblocks = async () => {
    try {
      const { blocked } = await listRoadblocks();
      setBlocked(blocked);
    } catch { /* non-critical - just leaves the list stale until next refresh */ }
  };

  useEffect(() => { refreshRoadblocks(); }, []);

  const handleOverride = async (signalId: string, signalName: string, color: string) => {
    try {
      await overrideSignal(signalId, color);
      toast(`Override: ${signalName} → ${color} (auto-release 30s)`, color === 'GREEN' ? 'success' : 'warning');
    } catch (err: any) {
      toast(err?.response?.data?.error || 'Override failed', 'error');
    }
  };

  const isPairBlocked = (a: string, b: string) =>
    blocked.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

  const handleReportRoadblock = async () => {
    setRoadblockLoading(true);
    try {
      const res = await reportRoadblock(fromNode, toNode);
      setBlocked(res.blocked);
      toast(`Roadblock reported: ${fromNode} ↔ ${toNode} — active ambulances rerouted automatically`, 'warning');
    } catch (err: any) {
      toast(err?.response?.data?.error || 'Failed to report roadblock', 'error');
    } finally {
      setRoadblockLoading(false);
    }
  };

  const handleClearRoadblock = async (from: string, to: string) => {
    try {
      const res = await clearRoadblock(from, to);
      setBlocked(res.blocked);
      toast(`Road reopened: ${from} ↔ ${to}`, 'success');
    } catch (err: any) {
      toast(err?.response?.data?.error || 'Failed to clear roadblock', 'error');
    }
  };

  if (!state) return (
    <>
      <Nav roleName="Traffic Police" roleColor="#f59e0b" connected={connected} />
      <div className="loading-screen"><div className="spinner" /><span>Connecting to AERIS stream...</span></div>
    </>
  );

  const activeSessions = state.sessions.filter(s => s.status === 'active');
  const greenCount     = state.signals.filter(s => s.color === 'GREEN').length;
  const redCount       = state.signals.filter(s => s.color === 'RED').length;
  const yellowCount    = state.signals.filter(s => s.color === 'YELLOW').length;
  const overrideCount  = state.signals.filter(s => s.manualOverride).length;

  return (
    <>
      <Nav roleName="Traffic Police" roleColor="#f59e0b" connected={connected} />
      <div className="container animate-fade-up">

        <div className="page-header">
          <div>
            <h1 className="page-title">Traffic Control Center</h1>
            <p className="page-subtitle">Signal monitoring · Manual override · Multi-ambulance awareness</p>
          </div>
          {activeSessions.length > 0 ? (
            <div className="emergency-banner animate-fade-in" style={{ padding: '10px 16px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.1), transparent)', animation: 'shimmer 2s infinite' }} />
              <AlertTriangle size={16} color="var(--c-red)" style={{ position: 'relative', zIndex: 1 }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="font-semibold text-sm" style={{ color: 'var(--c-red-bright)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AnimatedCounter value={activeSessions.length} color="var(--c-red-bright)" /> ACTIVE EMERGENCY{activeSessions.length > 1 ? ' (MULTIPLE)' : ''}
                  <LiveBadge variant="red" />
                </div>
                <div className="text-xs text-muted">
                  {activeSessions.map(s => s.rid).join(' · ')}
                </div>
              </div>
            </div>
          ) : (
            <StatusPulse status="active" label="No Active Emergency" size="lg" />
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <MetricCard label="Signals" value={state.signals.length} icon={<Activity size={22} />} color="var(--blue)" />
          <MetricCard label="Green" value={greenCount} icon={<div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 12px var(--green)' }} />} color="var(--green)" />
          <MetricCard label="Red" value={redCount} icon={<div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 12px var(--red)' }} />} color="var(--red)" />
          <MetricCard label="Yellow" value={yellowCount} icon={<div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--orange)', boxShadow: '0 0 12px var(--orange)' }} />} color="var(--orange)" />
          <MetricCard label="Overrides" value={overrideCount} icon={<ShieldAlert size={22} />} color={overrideCount > 0 ? 'var(--orange)' : 'var(--text-tertiary)'} />
          <MetricCard label="Ambulances" value={activeSessions.length} icon={<AlertTriangle size={22} />} color={activeSessions.length > 0 ? 'var(--red)' : 'var(--green)'} />
        </div>

        {/* ── Active Sessions (multi-ambulance) ── */}
        {activeSessions.length > 0 && (
          <div className="card mb-4 animate-fade-in">
            <div className="card-header">
              <div className="card-title">
                <div className="card-title-icon" style={{ background: 'var(--red-light)', color: 'var(--red)' }}><Layers size={16} /></div>
                Active Ambulance Sessions
              </div>
            </div>
            <div className="card-body" style={{ gap: '0.75rem' }}>
              {activeSessions.map(session => {
                const nodesLeft = session.route.length - 1 - session.currentNodeIndex;
                const eta = nodesLeft * 2;
                return (
                  <div key={session.rid} style={{
                    display: 'flex', alignItems: 'center', padding: '12px 14px',
                    background: 'rgba(239,68,68,0.08)', borderRadius: 16,
                    border: '1px solid rgba(239,68,68,0.25)',
                    flexWrap: 'wrap', gap: 12,
                  }}>
                    <div>
                      <div className="mono font-semibold" style={{ color: 'var(--c-red-bright)', fontSize: '0.95rem' }}>{session.rid}</div>
                      <div className="text-xs text-muted">{session.routeName}</div>
                    </div>
                    <div className="text-xs" style={{ flex: 1 }}>
                      <div className="text-muted mb-1">Route Progress</div>
                      <AnimatedProgress 
                        value={(session.currentNodeIndex / Math.max(1, session.route.length - 1)) * 100} 
                        height={6} 
                        color="var(--c-red)"
                      />
                      <div className="text-muted mt-1">{session.route[session.currentNodeIndex]} → {session.route[session.route.length - 1]}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="text-xs text-muted">ETA</div>
                      <div className="font-semibold mono" style={{ color: 'var(--c-yellow)', fontSize: '1.25rem' }}>
                        <AnimatedCounter value={eta} suffix="m" color="var(--c-yellow)" />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {session.cameraDetected && <StatusPulse status="active" label="CAM" size="sm" />}
                      {session.sirenDetected  && <StatusPulse status="active" label="SIREN" size="sm" />}
                      {!session.isVerified    && <StatusPulse status="warning" label="FAILSAFE" size="sm" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Interactive Map ── */}
        {activeSessions.length > 0 && (
          <div className="card mb-4 animate-fade-up">
            <div className="section-title">Live City Map — {activeSessions.length} Active Emergency</div>
            <InteractiveMap 
              sessions={state.sessions} 
              signals={state.signals.map(s => {
                const junctionCoords: Record<string, [number, number]> = {
                  'Junction A': [28.6180, 77.2120],
                  'Junction B': [28.6220, 77.2150],
                  'Central Junction': [28.6250, 77.2180],
                  'Medical Zone': [28.6280, 77.2200],
                  'Ring Road': [28.6160, 77.2050],
                  'North Gate': [28.6300, 77.2100],
                };
                const [lat, lng] = junctionCoords[s.junction] || [28.6139, 77.2090];
                return { id: s.id, name: s.name, color: s.color, lat, lng };
              })} 
              centerOnAmbulance={false}
              showTraffic={true}
              showLegend={true}
              height="500px"
            />
          </div>
        )}

        {/* ── Signal Grid ── */}
        <div className="card animate-fade-up">
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon" style={{ background: 'var(--orange-light)', color: 'var(--orange)' }}><ShieldAlert size={16} /></div>
              Signal Override Grid
            </div>
          </div>
          <div className="card-body">
            <p className="text-xs text-muted mb-3">Manual overrides auto-release after 30s. AERIS resumes corridor control automatically.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            {state.signals.map((sig, i) => (
              <div key={sig.id} className="card" style={{
                padding: '1.25rem',
                background: sig.color === 'GREEN' ? 'linear-gradient(135deg, var(--green-light), var(--bg-card))' : 'var(--bg-card)',
                border: `1px solid ${sig.color === 'GREEN' ? 'rgba(52,199,89,0.25)' : sig.manualOverride ? 'rgba(255,149,0,0.25)' : 'var(--border-light)'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                alignItems: 'center',
                position: 'relative',
                animationDelay: `${i * 0.05}s`,
              }}>
                {sig.manualOverride && (
                  <span style={{ position: 'absolute', top: 10, right: 10, fontSize: '0.65rem', padding: '3px 8px', background: 'var(--orange-light)', color: 'var(--orange)', borderRadius: 8, fontWeight: 600 }}>MANUAL</span>
                )}
                <div className="text-center" style={{ marginBottom: '0.5rem' }}>
                  <div className="font-semibold text-sm" style={{ marginBottom: 2 }}>{sig.name}</div>
                  <div className="text-xs text-muted">{sig.junction}</div>
                </div>
                <TrafficLight color={sig.color} name="" size="md" />
                <div className="flex items-center gap-3" style={{ marginTop: '0.5rem' }}>
                  <span className="text-xs text-muted flex items-center gap-1"><Timer size={12} /> {sig.timer}s</span>
                </div>
                <div className="flex gap-2 w-full justify-center" style={{ marginTop: '0.5rem' }}>
                  {(['RED', 'YELLOW', 'GREEN'] as const).map(c => (
                    <button key={c} onClick={() => handleOverride(sig.id, sig.name, c)}
                      className={`btn-sig-${c.toLowerCase().charAt(0) === 'r' ? 'r' : c.toLowerCase().charAt(0) === 'y' ? 'y' : 'g'}`}
                      style={{ opacity: sig.color === c ? 1 : 0.55, transform: sig.color === c ? 'scale(1.05)' : 'scale(1)', transition: 'all 0.2s' }}>
                      {c.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>

        {/* ── Roadblock Reporting (Section 9: dynamic route recalculation) ── */}
        <div className="card mt-4 animate-fade-up">
          <div className="card-header">
            <div className="card-title">
              <div className="card-title-icon" style={{ background: 'var(--orange-light)', color: 'var(--orange)' }}><Construction size={16} /></div>
              Roadblock Reporting
            </div>
          </div>
          <div className="card-body">
            <p className="text-xs text-muted mb-3">
              Reporting a blocked segment immediately recalculates the route for any active ambulance currently crossing it — Dijkstra reruns from its current position, avoiding the block.
            </p>
            <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: '1rem' }}>
              <select value={fromNode} onChange={e => {
                const next = e.target.value;
                setFromNode(next);
                setToNode(CITY_GRAPH_JUNCTIONS[next][0]);
              }} style={selectStyle}>
                {ALL_JUNCTIONS.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
              <span className="text-muted">↔</span>
              <select value={toNode} onChange={e => setToNode(e.target.value)} style={selectStyle}>
                {CITY_GRAPH_JUNCTIONS[fromNode].map(j => <option key={j} value={j}>{j}</option>)}
              </select>
              <button
                onClick={handleReportRoadblock}
                disabled={roadblockLoading || isPairBlocked(fromNode, toNode)}
                className="btn-sig-r"
                style={{ opacity: isPairBlocked(fromNode, toNode) ? 0.4 : 1 }}
              >
                {isPairBlocked(fromNode, toNode) ? 'Already Blocked' : 'Report Roadblock'}
              </button>
            </div>

            {blocked.length === 0 ? (
              <div className="text-xs text-muted">No roads currently blocked.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {blocked.map(([a, b]) => (
                  <div key={`${a}|${b}`} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', background: 'rgba(255,149,0,0.08)', borderRadius: 12,
                    border: '1px solid rgba(255,149,0,0.25)',
                  }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--orange)' }}>{a} ↔ {b}</span>
                    <button onClick={() => handleClearRoadblock(a, b)} className="btn-sig-g" style={{ padding: '4px 12px', fontSize: '0.75rem' }}>
                      Reopen
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
};

export default Police;
