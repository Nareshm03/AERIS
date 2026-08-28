import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, subtitle, actionLabel, onAction }) => {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 24px', textAlign: 'center', gap: 6,
        animation: 'fadeInUp 0.3s ease-out',
      }}
    >
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 8, animation: 'float 4s ease-in-out infinite',
      }}>
        <Icon size={26} color="var(--text-tertiary, #4a5878)" strokeWidth={1.5} />
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary, #94a3b8)' }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary, #4a5878)', maxWidth: 320, lineHeight: 1.5 }}>
          {subtitle}
        </div>
      )}
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
