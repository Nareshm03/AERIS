import React, { useEffect, useRef } from 'react';
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
 * design system: backdrop blur instead of a jarring native dialog, real
 * focus trapping (Tab/Shift+Tab cycle within the dialog, don't escape to
 * elements behind it), and focus restoration to whatever triggered the
 * dialog once it closes - not just visual polish, actual keyboard-only
 * usability.
 *
 * Previously had a genuinely unsafe bug: a global "Enter always confirms"
 * key handler fired regardless of which button had focus. Tabbing to
 * Cancel and pressing Enter would trigger the native button's own
 * activation (calling onCancel) AND this global handler (calling
 * onConfirm) - meaning Enter on Cancel could still fire a destructive
 * confirm. Removed that handler entirely; native <button> Enter/Space
 * activation already does the right thing once focus is correctly
 * trapped and defaulted onto the Confirm button.
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, onConfirm, onCancel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Remember what had focus before the dialog opened, so it can be
    // restored on close - without this, focus silently resets to <body>,
    // which is disorienting for keyboard/screen-reader users.
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key === 'Tab') {
        // Real focus trap: cycle Tab/Shift+Tab between the dialog's own
        // focusable elements instead of letting it escape to whatever's
        // behind the backdrop.
        const container = dialogRef.current;
        if (!container) return;
        const focusable = container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      // Restore focus to whatever opened the dialog.
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, onCancel]);

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
        ref={dialogRef}
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
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
            <div id="confirm-dialog-title" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary, #fff)', marginBottom: 4 }}>
              {title}
            </div>
            <div id="confirm-dialog-message" style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5 }}>
              {message}
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary, #4a5878)', padding: 4 }}
            aria-label="Close dialog"
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
