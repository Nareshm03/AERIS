import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Replaces window.confirm() with something that actually matches the app's
 * design system, supports Escape-to-cancel and Enter-to-confirm, and traps
 * focus visually with a backdrop blur instead of a jarring native dialog.
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, onConfirm, onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(8, 12, 20, 0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease-out',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        style={{
          background: 'var(--bg-card, #12182b)',
          border: `1px solid ${danger ? 'rgba(255,59,48,0.3)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 20,
          padding: '28px 28px 20px',
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          animation: 'scaleIn 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 8 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: danger ? 'rgba(255,59,48,0.12)' : 'rgba(0,122,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={20} color={danger ? '#FF3B30' : '#007AFF'} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary, #fff)', marginBottom: 4 }}>
              {title}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5 }}>
              {message}
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary, #4a5878)', padding: 4 }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} className="btn btn-ghost btn-sm">{cancelLabel}</button>
          <button
            onClick={onConfirm}
            className="btn btn-sm"
            style={{
              background: danger ? 'linear-gradient(135deg, #FF3B30, #CC2E26)' : 'linear-gradient(135deg, #0066CC, #004C99)',
              color: '#fff',
            }}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
