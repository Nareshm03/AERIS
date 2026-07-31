import React from 'react';
import { useNavigate } from 'react-router-dom';
import { WifiOff, LogOut, User, Radio } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

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

  const handleLogout = async () => {
    await logout();
    toast('Logged out successfully', 'info');
    navigate('/');
  };

  return (
    <nav className="top-nav">
      <div className="nav-brand">
        <div className="nav-brand-icon">🚑</div>
        <span>
          AERIS
        </span>
        <span style={{ fontSize: '0.625rem', color: 'var(--text-tertiary)', letterSpacing: '0.5px', marginLeft: 8, fontWeight: 500, alignSelf: 'flex-end', marginBottom: 4 }}>
          v2.1
        </span>
      </div>

      <div className="nav-actions">
        {/* SSE real-time status */}
        <div className="nav-status-dot">
          {connected
            ? <><Radio size={12} color="var(--green)" style={{ animation: 'blink-dot 2s infinite' }} /> <span style={{ color: 'var(--green)', fontSize: '0.75rem', fontWeight: 600 }}>Live</span></>
            : <><WifiOff size={12} color="var(--red)" /> <span style={{ color: 'var(--red)', fontSize: '0.75rem', fontWeight: 600 }}>Offline</span></>
          }
        </div>

        {/* Role badge */}
        <span className="nav-badge" style={{
          background: `${color}15`, borderColor: `${color}30`, color,
        }}>
          {roleName}
        </span>

        {/* User name */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 12, border: '1px solid var(--border-light)', fontSize: '0.8125rem', color: 'var(--text-primary)' }}>
            <User size={14} />
            <span style={{fontWeight: 600}}>{user.name}</span>
          </div>
        )}

        {/* Logout */}
        <button onClick={handleLogout} className="btn btn-ghost btn-sm" style={{ gap: 6, color: 'var(--text-secondary)' }}>
          <LogOut size={14} /> Logout
        </button>
      </div>
    </nav>
  );
};

export default Nav;
