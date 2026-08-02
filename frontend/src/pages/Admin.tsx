import React, { useEffect, useRef, useState } from 'react';
import { Server, Terminal, RefreshCw, Activity, Cpu, Database, Wifi, Zap, HardDrive, Trash2 } from 'lucide-react';
import { useSSE } from '../hooks/usePoll';
import { resetSystem, deleteSession, fetchSignalEngine } from '../api';
import type { SignalEngineStatus } from '../api';
import Nav from '../components/Nav';
import TrafficLight from '../components/TrafficLight';
import InteractiveMap from '../components/InteractiveMap';
import { useToast } from '../components/Toast';
import { MetricCard } from '../components/EnhancedCard';

// Mini sparkline chart component
const Sparkline: React.FC<{ data: number[]; color: string; label: string; value: string }> = ({ data, color, label, value }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const max = Math.max(...data, 1);
    const step = W / (data.length - 1);
    ctx.beginPath();
    data.forEach((d, i) => { const y = H - (d / max) * (H - 4); i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * step, y); });
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, color + '40'); g.addColorStop(1, color + '05');
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath();
    data.forEach((d, i) => { const y = H - (d / max) * (H - 4); i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * step, y); });
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowBlur = 6; ctx.shadowColor = color; ctx.stroke(); ctx.shadowBlur = 0;
  }, [data, color]);
  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="stat-label">{label}</div>
        <span className="stat-value text-xl" style={{ color }}>{value}</span>
      </div>
      <canvas ref={ref} width={220} height={44} style={{ width: '100%', height: 44 }} />
    </div>
  );
};

const LOG_COLORS: Record<string, string> = {
  info: 'var(--accent-blue)', warning: 'var(--c-yellow)', success: 'var(--c-green)', error: 'var(--c-red)', system: '#a78bfa',
};
const LOG_ICONS: Record<string, string> = {
  info: 'ℹ️', warning: '⚠️', success: '✅', error: '🚨', system: '⚙️',
};

const Admin: React.FC = () => {
  const { state, logs, connected, error: sseError, reconnect } = useSSE();
  const { toast }  = useToast();
  const [signalEngine, setSignalEngine]  = useState<SignalEngineStatus | null>(null);
  const [signalEngineLoading, setSignalEngineLoading] = useState(true);
  const [signalEngineError, setSignalEngineError] = useState<string | null>(null);
  const [loadHist, setLoadHist] = useState<number[]>(Array(20).fill(10));
  const [latHist,  setLatHist]  = useState<number[]>(Array(20).fill(45));
  const [resetLoading, setResetLoading] = useState(false);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);

  // Poll signal engine status with error handling
  useEffect(() => {
    const poll = async () => { 
      try { 
        setSignalEngineLoading(true);
        setSignalEngineError(null);
        const data = await fetchSignalEngine();
        setSignalEngine(data);
      } catch (error: any) { 
        console.error('Signal engine fetch error:', error);
        setSignalEngineError(error.message || 'Signal engine offline');
        setSignalEngine(null);
      } finally {
        setSignalEngineLoading(false);
      }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, []);

  // Update sparkline history
  useEffect(() => {
    if (!state) return;
    setLoadHist(h => [...h.slice(-29), state.systemLoad]);
    setLatHist (h => [...h.slice(-29), state.apiLatency]);
  }, [state?.systemLoad]);

  const handleReset = async () => {
    if (!window.confirm('Hard reset clears ALL active sessions and logs. Continue?')) return;
    setResetLoading(true);
    try { 
      await resetSystem(); 
      toast('System hard reset complete', 'success'); 
    } catch (error: any) { 
      console.error('Reset error:', error);
      toast(error.message || 'Reset failed', 'error'); 
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeleteSession = async (rid: string) => {
    if (!window.confirm(`Delete session ${rid}?`)) return;
    setDeletingSession(rid);
    try { 
      await deleteSession(rid); 
      toast(`Session ${rid} terminated`, 'warning'); 
    } catch (error: any) { 
      console.error('Delete session error:', error);
      toast(error.message || 'Session delete failed', 'error'); 
    } finally {
      setDeletingSession(null);
    }
  };

  if (!state) return (
    <>
      <Nav roleName="System Admin" roleColor="#8b5cf6" connected={connected} />
      <div className="loading-screen"><div className="spinner" /><span>Connecting to AERIS stream...</span></div>
    </>
  );

  const all = state.sessions;
  const active    = all.filter(s => s.status === 'active');
  const arrived   = all.filter(s => s.status === 'arrived');
  const cancelled = all.filter(s => s.status === 'cancelled');

  return (
    <>
      <Nav roleName="System Admin" roleColor="#8b5cf6" connected={connected} />
      <div className="container animate-fade-up">

        {/* SSE Connection Error Banner */}
        {sseError && (
          <div className="card mb-4 animate-fade-in" style={{ 
            background: 'rgba(239,68,68,0.1)', 
            border: '1px solid rgba(239,68,68,0.3)',
            padding: '12px 16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Activity size={20} color="var(--c-red)" />
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

        <div className="page-header">
          <div>
            <h1 className="page-title">System Administration</h1>
            <p className="page-subtitle">Global oversight · JWT sessions · Signal control engine · Dijkstra routing</p>
          </div>
          <button 
            className="btn btn-danger-outline" 
            onClick={handleReset}
            disabled={resetLoading}
          >
            <RefreshCw size={16} className={resetLoading ? 'spin' : ''} /> 
            {resetLoading ? 'Resetting...' : 'Hard Reset'}
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20, marginBottom: '2rem' }}>
          <MetricCard label="Active Sessions" value={active.length} icon={<Zap size={20} />} color={active.length > 0 ? 'var(--c-red)' : 'var(--c-green)'} />
          <MetricCard label="Total Activated" value={active.length + arrived.length + cancelled.length} icon={<Activity size={20} />} color="var(--accent-blue)" />
          <MetricCard label="Delivered" value={arrived.length} icon={<HardDrive size={20} />} color="var(--c-green)" />
          <MetricCard label="Cancelled" value={cancelled.length} icon={<Database size={20} />} color="var(--text-tertiary)" />
          <MetricCard label="System Load" value={`${state.systemLoad}%`} icon={<Cpu size={20} />} color={state.systemLoad > 70 ? 'var(--c-red)' : 'var(--c-yellow)'} />
          <MetricCard label="API Latency" value={`${state.apiLatency}ms`} icon={<Wifi size={20} />} color="var(--accent-blue)" />
        </div>

        {/* Sparklines */}
        <div className="grid-2 mb-4">
          <Sparkline data={loadHist} color={state.systemLoad > 70 ? '#ef4444' : '#f59e0b'} label="System Load" value={`${state.systemLoad}%`} />
          <Sparkline data={latHist}  color="#2563EB" label="API Latency" value={`${state.apiLatency}ms`} />
        </div>

        {/* Interactive Map */}
        {active.length > 0 && (
          <div className="card mb-4 animate-fade-up">
            <div className="section-title"><Activity size={14} /> Live Network Map — {active.length} Active Session(s)</div>
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

        <div className="grid-2 stagger">

          {/* Left column */}
          <div className="flex flex-col gap-4">

            {/* All Sessions Table */}
            <div className="card animate-fade-up">
              <div className="section-title"><Server size={14} /> Session Registry</div>
              {all.length === 0 ? (
                <div className="text-xs text-quiet text-center py-4">No sessions recorded this cycle.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr><th>RID</th><th>Route</th><th>Status</th><th>Verified</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {all.map(s => (
                      <tr key={s.rid}>
                        <td className="mono font-semibold" style={{ color: s.status === 'active' ? 'var(--c-red-bright)' : 'var(--text-secondary)', fontSize: '0.82rem' }}>{s.rid}</td>
                        <td className="text-xs text-muted">{s.routeName.split(' (')[0]}</td>
                        <td>
                          <span className={`status-badge text-xs ${s.status === 'active' ? 'badge-red' : s.status === 'arrived' ? 'badge-green' : 'badge-blue'}`}>
                            {s.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge text-xs ${s.isVerified ? 'badge-green' : 'badge-yellow'}`}>
                            {s.isVerified ? 'DUAL ✓' : 'MANUAL'}
                          </span>
                        </td>
                        <td>
                          {s.status !== 'cancelled' && (
                            <button 
                              onClick={() => handleDeleteSession(s.rid)} 
                              className="btn btn-ghost btn-sm" 
                              style={{ padding: '2px 8px', fontSize: '0.7rem', color: '#ef4444' }}
                              disabled={deletingSession === s.rid}
                            >
                              {deletingSession === s.rid ? (
                                <RefreshCw size={12} className="spin" />
                              ) : (
                                <Trash2 size={12} />
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Signal Overview */}
            <div className="card animate-fade-up">
              <div className="section-title"><Activity size={14} /> Traffic Signal Overview</div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'space-around', flexWrap: 'wrap' }}>
                {state.signals.map(sig => (
                  <div key={sig.id} className="flex flex-col items-center gap-2">
                    <TrafficLight color={sig.color} name="" size="sm" />
                    <div className="text-xs text-center" style={{ color: 'var(--text-secondary)', maxWidth: 68 }}>{sig.name}</div>
                    <div className="text-xs mono" style={{ color: sig.color === 'GREEN' ? 'var(--c-green)' : sig.color === 'YELLOW' ? 'var(--c-yellow)' : 'var(--text-secondary)' }}>{sig.timer}s</div>
                    {sig.manualOverride && <span style={{ fontSize: '0.6rem', color: 'var(--c-yellow)' }}>OVR</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* System info table */}
            <div className="card animate-fade-up">
              <div className="section-title"><Server size={14} /> Runtime Parameters</div>
              <table className="data-table">
                <tbody>
                  {[
                    ['Auth', 'JWT (bcrypt, 8hr)', 'green'],
                    ['Routing', 'Dijkstra Algorithm', 'blue'],
                    ['Real-time', 'Server-Sent Events', 'blue'],
                    ['Detection', 'Camera + Siren APIs', active.length > 0 ? 'green' : 'blue'],
                    ['Signal Engine Link', `${SIGNAL_ENGINE_LABEL}`, signalEngine ? 'green' : 'yellow'],
                    ['SSE Clients', connected ? '1+ connected' : 'None', connected ? 'green' : 'red'],
                  ].map(([k, v, b]) => (
                    <tr key={k}><td className="text-muted">{k}</td><td className="mono text-sm">{v}</td><td><span className={`status-badge badge-${b}`}>{b === 'green' ? '✓' : b === 'red' ? '✗' : '—'}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">

            {/* Event Log */}
            <div className="card animate-fade-up flex flex-col" style={{ maxHeight: 420 }}>
              <div className="section-title border-b pb-3 flex items-center" style={{ marginBottom: 10 }}>
                <Terminal size={14} style={{ marginRight: 6 }} /> Audit Event Log
                <span className="status-badge badge-blue text-xs" style={{ marginLeft: 'auto' }}>{logs.length} events</span>
              </div>
              <div className="overflow-y-auto flex-1">
                {logs.slice(0, 60).map((log, i) => (
                  <div key={log.id} className="log-entry" style={{ animationDelay: `${i * 0.01}s` }}>
                    <div className="log-time" style={{ fontSize: '0.65rem' }}>{new Date(log.timestamp).toLocaleTimeString('en-IN', { hour12: false })}</div>
                    <span style={{ fontSize: '0.7rem' }}>{LOG_ICONS[log.type] || 'ℹ️'}</span>
                    <div className="log-msg text-xs" style={{ color: LOG_COLORS[log.type] || 'var(--text-secondary)' }}>
                      {log.sessionRID && <span className="mono" style={{ color: 'var(--text-secondary)', fontSize: '0.65rem', marginRight: 4 }}>[{log.sessionRID}]</span>}
                      {log.message}
                    </div>
                  </div>
                ))}
                {logs.length === 0 && <div className="text-xs text-quiet text-center mt-6">No events yet.</div>}
              </div>
            </div>

            {/* Signal Control Engine Panel */}
            <div className="card animate-fade-up">
              <div className="section-title">
                <HardDrive size={14} /> Signal Control Engine
                {signalEngineLoading && <div className="spinner" style={{ width: 12, height: 12, marginLeft: 8 }} />}
              </div>
              {signalEngineLoading && !signalEngine ? (
                <div className="text-center py-4">
                  <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 8px' }} />
                  <div className="text-xs text-muted">Loading signal engine status...</div>
                </div>
              ) : signalEngineError ? (
                <div className="text-center py-4">
                  <div className="text-xs text-red mb-2">⚠️ {signalEngineError}</div>
                  <div className="text-xs text-quiet">Signal control engine offline<br />Run: npm run dev:signalEngine (port 4001)</div>
                </div>
              ) : signalEngine ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.77rem', marginBottom: 16 }}>
                    {[
                      ['Engine', signalEngine.engineId || 'N/A'], 
                      ['Version', signalEngine.version || 'N/A'], 
                      ['Commands', String(signalEngine.totalCommands || signalEngine.commands?.length || 0)]
                    ].map(([k, v]) => (
                      <div key={k} style={{ padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                        <div className="text-xs text-quiet mb-1">{k}</div>
                        <div className="mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {signalEngine.signals && (
                    <>
                      <div className="section-title mb-3" style={{ fontSize: '0.75rem' }}>Signal States</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                        {(signalEngine.signals || []).map((s: any) => (
                          <div key={s.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 14px', background: 'rgba(0,0,0,0.04)', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)', fontSize: '0.7rem' }}>
                            <div className="text-quiet font-medium">{s.name}</div>
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: s.state === 'GREEN' ? 'var(--c-green)' : s.state === 'YELLOW' ? 'var(--c-yellow)' : 'var(--c-red)', boxShadow: `0 0 10px ${s.state === 'GREEN' ? 'var(--c-green)' : s.state === 'YELLOW' ? 'var(--c-yellow)' : 'var(--c-red)'}` }} />
                            <div className="mono text-quiet font-bold" style={{ fontSize: '0.65rem' }}>{s.state}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {(signalEngine.commandLog || signalEngine.commands) && (
                    <>
                      <div className="section-title mb-3" style={{ fontSize: '0.75rem' }}>Recent Signal Commands</div>
                      <div style={{ maxHeight: 130, overflowY: 'auto' }}>
                        {(signalEngine.commandLog || signalEngine.commands || []).slice(0, 10).map((cmd: any, i: number) => (
                          <div key={i} className="log-entry" style={{ fontSize: '0.73rem' }}>
                            <div className="log-time" style={{ fontSize: '0.62rem' }}>{new Date(cmd.ts).toLocaleTimeString('en-IN', { hour12: false })}</div>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: cmd.color === 'GREEN' ? 'var(--c-green)' : cmd.color === 'YELLOW' ? 'var(--c-yellow)' : 'var(--c-red)' }} />
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                              {cmd.signal} → <span style={{ color: cmd.color === 'GREEN' ? 'var(--c-green)' : cmd.color === 'YELLOW' ? 'var(--c-yellow)' : 'var(--c-red)', fontWeight: 600 }}>{cmd.color}</span>
                            </div>
                          </div>
                        ))}
                        {(signalEngine.commandLog || signalEngine.commands || []).length === 0 && <div className="text-xs text-quiet">No commands sent yet.</div>}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-center text-sm text-muted py-4">
                  Signal control engine offline<br />
                  <span className="text-xs text-quiet">Run: npm run dev:signalEngine (port 4001)</span>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </>
  );
};

const SIGNAL_ENGINE_LABEL = 'localhost:4001';
export default Admin;
