import React from 'react';
import { Activity, Zap, Database, Wifi } from 'lucide-react';

interface MetricsProps {
  systemLoad: number;
  apiLatency: number;
  totalCompleted: number;
  activeSessions: number;
}

const PerformanceMetrics: React.FC<MetricsProps> = ({
  systemLoad,
  apiLatency,
  totalCompleted,
  activeSessions,
}) => {
  const getLoadColor = (load: number) => {
    if (load < 30) return 'var(--c-green)';
    if (load < 70) return 'var(--c-yellow)';
    return 'var(--c-red)';
  };

  const getLatencyColor = (latency: number) => {
    if (latency < 50) return 'var(--c-green)';
    if (latency < 100) return 'var(--c-yellow)';
    return 'var(--c-red)';
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 12,
    }}>
      {/* System Load */}
      <div className="card" style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: `${getLoadColor(systemLoad)}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Activity size={18} color={getLoadColor(systemLoad)} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="text-xs text-muted">System Load</div>
          <div className="font-bold" style={{ color: getLoadColor(systemLoad), fontSize: '1.1rem' }}>
            {systemLoad}%
          </div>
        </div>
      </div>

      {/* API Latency */}
      <div className="card" style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: `${getLatencyColor(apiLatency)}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Zap size={18} color={getLatencyColor(apiLatency)} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="text-xs text-muted">Latency</div>
          <div className="font-bold" style={{ color: getLatencyColor(apiLatency), fontSize: '1.1rem' }}>
            {apiLatency}ms
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="card" style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: activeSessions > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Wifi size={18} color={activeSessions > 0 ? 'var(--c-red)' : 'var(--c-green)'} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="text-xs text-muted">Active</div>
          <div className="font-bold" style={{ color: activeSessions > 0 ? 'var(--c-red)' : 'var(--c-green)', fontSize: '1.1rem' }}>
            {activeSessions}
          </div>
        </div>
      </div>

      {/* Total Completed */}
      <div className="card" style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: 'rgba(59,130,246,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Database size={18} color="var(--accent-blue)" />
        </div>
        <div style={{ flex: 1 }}>
          <div className="text-xs text-muted">Completed</div>
          <div className="font-bold" style={{ color: 'var(--accent-blue)', fontSize: '1.1rem' }}>
            {totalCompleted}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceMetrics;
