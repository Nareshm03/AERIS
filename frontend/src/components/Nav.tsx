import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WifiOff, LogOut, User, Radio, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import NotificationBell from './NotificationBell';
import Tooltip from './Tooltip';
import { isSoundEnabled, setSoundEnabled } from '../utils/sound';

interface Props {
  roleName: string;
  roleColor?: string;
  connected?: boolean; // SSE connected
}

const ROLE_COLORS: Record<string, string> = {
  driver:   '#007AFF',
  police:   '#FF9500',
  hospital: '#34C759',
  admin:    '#AF52DE',
};

const Nav: React.FC<Props> = ({ roleName, roleColor, connected = true }) => {
  const { user, logout } = useAuth();
  const { toast }        = useToast();
  const navigate         = useNavigate();
  const color            = roleColor ?? (user?.role ? ROLE_COLORS[user.role] : '#007AFF');
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  const handleLogout = async () => {
    await logout();
    toast('Logged out successfully', 'info');
    navigate('/');
  };

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
  };

  return (
    <nav className="sidebar-nav">
      <div className="sidebar-brand">
        <div className="nav-brand-icon">🚑</div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">AERIS</span>
          <span className="sidebar-brand-version">v2.1</span>
        </div>
      </div>

      <div className="sidebar-section">
        {/* SSE real-time status */}
        <div className="nav-status-dot" style={{ width: '100%', justifyContent: 'flex-start' }}>
          {connected
            ? <><Radio size={12} color="var(--green)" style={{ animation: 'blink-dot 2s infinite' }} /> <span style={{ color: 'var(--green)', fontSize: '0.75rem', fontWeight: 600 }}>Live</span></>
            : <><WifiOff size={12} color="var(--red)" /> <span style={{ color: 'var(--red)', fontSize: '0.75rem', fontWeight: 600 }}>Offline</span></>
          }
        </div>

        {/* Notifications + sound toggle */}
        <div style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center' }}>
          <NotificationBell />
          <Tooltip label={soundOn ? 'Mute alert sounds' : 'Unmute alert sounds'}>
            <button
              onClick={handleToggleSound}
              aria-label={soundOn ? 'Mute alert sounds' : 'Unmute alert sounds'}
              aria-pressed={soundOn}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
              }}
            >
              {soundOn ? <Volume2 size={15} color="var(--text-secondary)" /> : <VolumeX size={15} color="var(--text-tertiary)" />}
            </button>
          </Tooltip>
        </div>

        {/* Role badge */}
        <span className="nav-badge" style={{
          background: `${color}15`, borderColor: `${color}30`, color, width: '100%', justifyContent: 'center',
        }}>
          {roleName}
        </span>
      </div>

      <div className="sidebar-spacer" />

      <div className="sidebar-section">
        {/* User name */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 12, border: '1px solid var(--border-light)', fontSize: '0.8125rem', color: 'var(--text-primary)', width: '100%' }}>
            <User size={14} style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
          </div>
        )}

        {/* Logout */}
        <Tooltip label="Sign out of AERIS" position="right">
          <button onClick={handleLogout} className="btn btn-ghost btn-sm" style={{ gap: 6, color: 'var(--text-secondary)', width: '100%', justifyContent: 'center' }}>
            <LogOut size={14} /> Logout
          </button>
        </Tooltip>
      </div>
    </nav>
  );
};

export default Nav;
