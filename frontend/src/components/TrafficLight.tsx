import React from 'react';

interface Props {
  color: 'RED' | 'YELLOW' | 'GREEN';
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const TrafficLight: React.FC<Props> = ({ color, name, size = 'md' }) => {
  const colors = {
    RED: { bg: 'var(--red-light)', border: 'var(--red)', glow: 'rgba(255,59,48,0.15)' },
    YELLOW: { bg: 'var(--orange-light)', border: 'var(--orange)', glow: 'rgba(255,149,0,0.15)' },
    GREEN: { bg: 'var(--green-light)', border: 'var(--green)', glow: 'rgba(52,199,89,0.15)' },
  };

  const currentColor = colors[color];
  const dotSize = size === 'sm' ? 10 : size === 'lg' ? 16 : 12;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: size === 'sm' ? 6 : 8,
    }}>
      {/* Minimal Pill Indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: size === 'sm' ? '6px 12px' : size === 'lg' ? '10px 16px' : '8px 14px',
        background: currentColor.bg,
        border: `1.5px solid ${currentColor.border}`,
        borderRadius: 100,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: `0 0 0 4px ${currentColor.glow}, 0 2px 8px rgba(0,0,0,0.06)`,
      }}>
        {/* Animated Dot */}
        <div style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          background: currentColor.border,
          boxShadow: `0 0 8px ${currentColor.border}`,
          animation: 'pulse-dot 2s ease-in-out infinite',
        }} />
        
        {/* Status Text */}
        <span style={{
          fontSize: size === 'sm' ? '0.7rem' : size === 'lg' ? '0.875rem' : '0.75rem',
          fontWeight: 600,
          color: currentColor.border,
          letterSpacing: '0.3px',
        }}>
          {color}
        </span>
      </div>
      
      {name && (
        <span style={{
          fontSize: size === 'sm' ? '0.7rem' : '0.75rem',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          maxWidth: 100,
          fontWeight: 500,
        }}>
          {name}
        </span>
      )}
    </div>
  );
};

export default TrafficLight;
