import React from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';

interface SSEStatusProps {
  connected: boolean;
  error?: string | null;
  onReconnect?: () => void;
  compact?: boolean;
}

const SSEStatus: React.FC<SSEStatusProps> = ({ connected, error, onReconnect, compact = false }) => {
  if (compact) {
    // Compact mode - just an indicator dot
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div 
          className={connected ? 'dot dot-green' : 'dot dot-red'}
          style={{ 
            width: 8, 
            height: 8,
            animation: connected ? 'pulse 2s ease-in-out infinite' : 'none'
          }} 
        />
        <span className="text-xs text-muted">
          {connected ? 'Live' : 'Offline'}
        </span>
      </div>
    );
  }

  // Full mode - detailed status card
  if (!connected || error) {
    return (
      <div 
        className="card animate-fade-in" 
        style={{ 
          background: error ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', 
          border: `1px solid ${error ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
          padding: '12px 16px',
          marginBottom: '1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {error ? (
            <AlertTriangle size={20} color="var(--c-red)" />
          ) : (
            <WifiOff size={20} color="var(--c-yellow)" />
          )}
          <div style={{ flex: 1 }}>
            <div 
              className="font-semibold text-sm" 
              style={{ color: error ? 'var(--c-red)' : 'var(--c-yellow)' }}
            >
              {error ? 'Real-time Connection Error' : 'Connecting to Real-time Stream...'}
            </div>
            {error && (
              <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                {error}
              </div>
            )}
          </div>
          {onReconnect && (
            <button onClick={onReconnect} className="btn btn-ghost btn-sm">
              <RefreshCw size={14} /> Reconnect
            </button>
          )}
        </div>
      </div>
    );
  }

  // Connected - show success message briefly
  return (
    <div 
      className="card animate-fade-in" 
      style={{ 
        background: 'rgba(34,197,94,0.1)', 
        border: '1px solid rgba(34,197,94,0.3)',
        padding: '10px 16px',
        marginBottom: '1rem'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Wifi size={18} color="var(--c-green)" />
        <div style={{ flex: 1 }}>
          <div className="font-semibold text-sm" style={{ color: 'var(--c-green)' }}>
            Real-time Updates Active
          </div>
          <div className="text-xs text-muted">
            Receiving live ambulance positions and signal states
          </div>
        </div>
      </div>
    </div>
  );
};

export default SSEStatus;
