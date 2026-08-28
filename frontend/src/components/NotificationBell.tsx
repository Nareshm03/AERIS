import React, { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, AlertTriangle, Info, XCircle, Zap } from 'lucide-react';
import { fetchLogs } from '../api';
import type { LogEntry } from '../api';

const ICONS: Record<LogEntry['type'], React.ReactNode> = {
  error:   <XCircle size={14} color="var(--c-red, #FF3B30)" />,
  warning: <AlertTriangle size={14} color="var(--c-yellow, #FF9500)" />,
  success: <CheckCheck size={14} color="var(--c-green, #34C759)" />,
  info:    <Info size={14} color="var(--c-blue, #007AFF)" />,
  system:  <Zap size={14} color="var(--c-purple, #AF52DE)" />,
};

// Only these types surface as "notifications" - routine info logs don't
// need to interrupt/badge the bell, keeping the unread count meaningful.
const NOTIFY_TYPES: LogEntry['type'][] = ['error', 'warning', 'success'];

/**
 * Bell icon + dropdown of recent important events, with an unread badge.
 * Polls /api/logs on an interval rather than requiring new backend plumbing -
 * lightweight enough for this app's scale, and works for every role since
 * logs aren't role-filtered server-side.
 */
const NotificationBell: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [lastSeenTs, setLastSeenTs] = useState<string>(() => new Date().toISOString());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await fetchLogs(30);
        if (!cancelled) setLogs(data.filter(l => NOTIFY_TYPES.includes(l.type)));
      } catch {
        // Silent - the bell just won't update this cycle, not worth a toast
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const unreadCount = logs.filter(l => new Date(l.timestamp) > new Date(lastSeenTs)).length;

  const handleToggle = () => {
    setOpen(o => !o);
    if (!open) setLastSeenTs(new Date().toISOString());
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={handleToggle}
        aria-label="Notifications"
        style={{
          position: 'relative', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.2s',
        }}
      >
        <Bell size={15} color="var(--text-secondary, #94a3b8)" />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8,
            background: 'var(--c-red, #FF3B30)', color: '#fff', fontSize: '0.625rem', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
            animation: 'scaleIn 0.2s ease-out', boxShadow: '0 0 0 2px var(--bg-primary, #0a0e1a)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 320, maxHeight: 400,
          background: 'var(--bg-card, #12182b)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)', zIndex: 9998, overflow: 'hidden',
          animation: 'scaleIn 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)', transformOrigin: 'top right',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
            Recent Activity
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {logs.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-tertiary, #4a5878)' }}>
                No recent activity
              </div>
            ) : (
              logs.slice(0, 20).map(log => (
                <div key={log.id} style={{
                  display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  alignItems: 'flex-start',
                }}>
                  <div style={{ marginTop: 2, flexShrink: 0 }}>{ICONS[log.type]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #cbd5e1)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {log.message}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary, #4a5878)', marginTop: 2 }}>
                      {new Date(log.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
                      {log.sessionRID && <span className="mono"> · {log.sessionRID}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
