import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} />,
  error:   <XCircle size={16} />,
  warning: <AlertTriangle size={16} />,
  info:    <Info size={16} />,
};

const colors: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(52,199,89,0.1)', border: 'rgba(52,199,89,0.25)', icon: '#34C759' },
  error:   { bg: 'rgba(255,59,48,0.1)',  border: 'rgba(255,59,48,0.25)',  icon: '#FF3B30' },
  warning: { bg: 'rgba(255,149,0,0.1)', border: 'rgba(255,149,0,0.25)', icon: '#FF9500' },
  info:    { bg: 'rgba(0,122,255,0.1)', border: 'rgba(0,122,255,0.25)', icon: '#007AFF' },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-4), { id, message, type }]); // max 5
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  const remove = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 360,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => {
          const c = colors[t.type];
          return (
            <div key={t.id} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '14px 16px',
              background: 'rgba(255,255,255,0.95)',
              border: `1px solid ${c.border}`,
              borderRadius: 16,
              backdropFilter: 'blur(20px) saturate(180%)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              animation: 'slideInRight 0.3s cubic-bezier(0.4,0,0.2,1)',
              pointerEvents: 'all',
            }}>
              <span style={{ color: c.icon, flexShrink: 0, marginTop: 2 }}>{icons[t.type]}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', flex: 1, lineHeight: 1.5 }}>{t.message}</span>
              <button onClick={() => remove(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', flexShrink: 0, padding: 0 }}>
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
