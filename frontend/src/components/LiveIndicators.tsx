import React, { useEffect, useState } from 'react';
import { Activity, Zap, Radio } from 'lucide-react';

// Pulsing LIVE badge
export const LiveBadge: React.FC<{ variant?: 'red' | 'green' | 'blue' }> = ({ variant = 'red' }) => {
  const colors = {
    red: { bg: 'rgba(239,68,68,0.15)', border: '#ef4444', text: '#ef4444' },
    green: { bg: 'rgba(34,197,94,0.15)', border: '#22c55e', text: '#22c55e' },
    blue: { bg: 'rgba(59,130,246,0.15)', border: '#3b82f6', text: '#3b82f6' }
  };
  const c = colors[variant];
  
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 8,
      background: c.bg, border: `1.5px solid ${c.border}`,
      fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.5px',
      animation: 'pulse-glow 2s ease-in-out infinite'
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: c.text,
        animation: 'blink-dot 1.5s ease-in-out infinite',
        boxShadow: `0 0 8px ${c.text}`
      }} />
      <span style={{ color: c.text }}>LIVE</span>
    </div>
  );
};

// Animated counter with smooth transitions
export const AnimatedCounter: React.FC<{ 
  value: number; 
  suffix?: string; 
  color?: string;
  decimals?: number;
  style?: React.CSSProperties;
}> = ({ 
  value, suffix = '', color = 'var(--text-primary)', decimals = 0, style = {}
}) => {
  const [display, setDisplay] = useState(value);
  
  useEffect(() => {
    const duration = 800;
    const steps = 30;
    const increment = (value - display) / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current++;
      setDisplay(prev => {
        const next = prev + increment;
        return current >= steps ? value : next;
      });
      if (current >= steps) clearInterval(timer);
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [value]);
  
  return (
    <span style={{ 
      color, 
      fontWeight: 800, 
      fontSize: '2.5rem',
      fontFamily: 'SF Mono, monospace',
      transition: 'color 0.3s ease',
      ...style
    }}>
      {display.toFixed(decimals)}{suffix}
    </span>
  );
};

// Progress bar with smooth animation
export const AnimatedProgress: React.FC<{ 
  value: number; 
  max?: number; 
  color?: string;
  height?: number;
  showLabel?: boolean;
}> = ({ value, max = 100, color = 'var(--blue)', height = 8, showLabel = false }) => {
  const percent = Math.min(100, (value / max) * 100);
  
  return (
    <div style={{ width: '100%' }}>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.75rem', fontWeight: 600 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Progress</span>
          <span style={{ color }}>{Math.round(percent)}%</span>
        </div>
      )}
      <div style={{
        width: '100%', height, borderRadius: height / 2,
        background: 'rgba(0,0,0,0.06)', overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{
          height: '100%', width: `${percent}%`,
          background: `linear-gradient(90deg, ${color}, ${color}dd)`,
          borderRadius: height / 2,
          transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: `0 0 12px ${color}40`,
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
            animation: 'shimmer 2s infinite'
          }} />
        </div>
      </div>
    </div>
  );
};

// Circular progress indicator
export const CircularProgress: React.FC<{ 
  value: number; 
  max?: number; 
  size?: number;
  color?: string;
  label?: string;
}> = ({ value, max = 100, size = 80, color = 'var(--blue)', label }) => {
  const percent = Math.min(100, (value / max) * 100);
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="6" />
        <circle 
          cx={size/2} cy={size/2} r={radius} fill="none" 
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color, fontFamily: 'SF Mono, monospace' }}>
          {Math.round(percent)}%
        </div>
        {label && <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: 2 }}>{label}</div>}
      </div>
    </div>
  );
};

// Real-time metric card with animation
export const LiveMetricCard: React.FC<{
  label: string;
  value: number | string;
  suffix?: string;
  icon?: React.ReactNode;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
}> = ({ label, value, suffix = '', icon, color = 'var(--blue)', trend }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  
  useEffect(() => {
    setIsUpdating(true);
    const timer = setTimeout(() => setIsUpdating(false), 600);
    return () => clearTimeout(timer);
  }, [value]);
  
  return (
    <div className="card" style={{
      padding: '1.25rem',
      transition: 'all 0.3s ease',
      transform: isUpdating ? 'scale(1.02)' : 'scale(1)',
      boxShadow: isUpdating ? `0 8px 24px ${color}20` : undefined
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          {label}
        </span>
        {icon && <div style={{ color, opacity: 0.8 }}>{icon}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ 
          fontSize: '2.25rem', fontWeight: 800, color,
          fontFamily: typeof value === 'number' ? 'SF Mono, monospace' : 'inherit',
          transition: 'color 0.3s ease'
        }}>
          {value}
        </span>
        {suffix && <span style={{ fontSize: '1rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>{suffix}</span>}
      </div>
      {trend && (
        <div style={{ 
          marginTop: 8, fontSize: '0.7rem', fontWeight: 600,
          color: trend === 'up' ? 'var(--green)' : trend === 'down' ? 'var(--red)' : 'var(--text-tertiary)'
        }}>
          {trend === 'up' ? '↗ Increasing' : trend === 'down' ? '↘ Decreasing' : '→ Stable'}
        </div>
      )}
    </div>
  );
};

// Pulsing status indicator
export const StatusPulse: React.FC<{ 
  status: 'active' | 'idle' | 'warning' | 'error';
  label: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ status, label, size = 'md' }) => {
  const configs = {
    active: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', text: 'ACTIVE' },
    idle: { color: '#64748b', bg: 'rgba(100,116,139,0.1)', text: 'IDLE' },
    warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', text: 'WARNING' },
    error: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', text: 'ERROR' }
  };
  const cfg = configs[status];
  const sizes = { sm: 8, md: 12, lg: 16 };
  const dotSize = sizes[size];
  
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: size === 'lg' ? '10px 16px' : size === 'md' ? '8px 12px' : '6px 10px',
      background: cfg.bg, borderRadius: 10,
      border: `1.5px solid ${cfg.color}40`
    }}>
      <div style={{
        width: dotSize, height: dotSize, borderRadius: '50%',
        background: cfg.color,
        boxShadow: `0 0 ${dotSize}px ${cfg.color}60`,
        animation: status === 'active' || status === 'error' ? 'blink-dot 1.5s ease-in-out infinite' : 'none'
      }} />
      <span style={{ 
        fontSize: size === 'lg' ? '0.875rem' : size === 'md' ? '0.75rem' : '0.7rem',
        fontWeight: 700, color: cfg.color, letterSpacing: '0.3px'
      }}>
        {label}
      </span>
    </div>
  );
};

// Streaming data indicator
export const StreamIndicator: React.FC<{ connected: boolean }> = ({ connected }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 8,
    background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
    border: `1.5px solid ${connected ? '#22c55e' : '#ef4444'}40`
  }}>
    <Radio size={14} color={connected ? '#22c55e' : '#ef4444'} 
      style={{ animation: connected ? 'pulse 2s ease-in-out infinite' : 'none' }} />
    <span style={{ 
      fontSize: '0.7rem', fontWeight: 700, 
      color: connected ? '#22c55e' : '#ef4444',
      letterSpacing: '0.3px'
    }}>
      {connected ? 'STREAMING' : 'DISCONNECTED'}
    </span>
  </div>
);

// Add keyframes to global styles
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 8px rgba(239,68,68,0.3); }
    50% { box-shadow: 0 0 16px rgba(239,68,68,0.6); }
  }
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.1); }
  }
`;
document.head.appendChild(style);
