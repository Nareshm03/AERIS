import React, { useState } from 'react';

interface TooltipProps {
  label: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

/**
 * Simple hover/focus tooltip - no external deps. Wrap any element:
 *   <Tooltip label="Acknowledge this emergency"><button>...</button></Tooltip>
 * Works with keyboard focus too (accessible), not just mouse hover.
 */
const Tooltip: React.FC<TooltipProps> = ({ label, children, position = 'top', delay = 300 }) => {
  const [visible, setVisible] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    const t = setTimeout(() => setVisible(true), delay);
    setTimer(t);
  };
  const hide = () => {
    if (timer) clearTimeout(timer);
    setVisible(false);
  };

  const posStyles: Record<string, React.CSSProperties> = {
    top:    { bottom: '100%', left: '50%', transform: 'translateX(-50%) translateY(-6px)' },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%) translateY(6px)' },
    left:   { right: '100%', top: '50%', transform: 'translateY(-50%) translateX(-6px)' },
    right:  { left: '100%', top: '50%', transform: 'translateY(-50%) translateX(6px)' },
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            ...posStyles[position],
            background: 'rgba(15, 23, 42, 0.96)',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 8,
            fontSize: '0.72rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 9999,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.08)',
            animation: 'scaleIn 0.12s ease-out',
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
};

export default Tooltip;
