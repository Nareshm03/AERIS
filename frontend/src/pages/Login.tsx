import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Ambulance, ShieldAlert, Activity, ShieldCheck, Lock, User, Eye, EyeOff, ChevronRight, Zap, Shield, Wifi, Cpu, Layers, CheckCircle2 } from 'lucide-react';
import { loginUser, authStore } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import type { AuthUser } from '../api';

const ROLES = [
  { key: 'driver',   label: 'Ambulance Driver',  icon: <Ambulance size={22} />,   color: '#5D7DA6', hint: 'driver123',   desc: 'Activate emergency mode & manage routes' },
  { key: 'police',   label: 'Traffic Police',     icon: <ShieldAlert size={22} />, color: '#C89B5C', hint: 'police123',   desc: 'Monitor signals & manual override control' },
  { key: 'hospital', label: 'Hospital Staff',     icon: <Activity size={22} />,    color: '#86AB97', hint: 'hospital123', desc: 'Track inbound ambulances & prep bays' },
  { key: 'admin',    label: 'System Admin',       icon: <ShieldCheck size={22} />, color: '#8C7CB5', hint: 'admin123',    desc: 'Full system oversight & signal control engine' },
];

const Login: React.FC = () => {
  const navigate       = useNavigate();
  const { login }      = useAuth();
  const { toast }      = useToast();

  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const selectedDef = ROLES.find(r => r.key === selectedRole);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole || !password) return;
    setLoading(true);
    setError('');
    try {
      const { token, user } = await loginUser(selectedRole, password);
      authStore.set(token);
      login(token, user as AuthUser);
      toast(`Welcome, ${user.name}! Session authenticated.`, 'success');
      navigate(`/${user.role}`);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Authentication failed. Check credentials.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Auto-login on role click
  const handleRoleClick = async (key: string) => {
    const role = ROLES.find(r => r.key === key)!;
    setSelectedRole(key);
    setPassword(role.hint);
    setError('');
    setLoading(true);
    try {
      const { token, user } = await loginUser(key, role.hint);
      authStore.set(token);
      login(token, user as AuthUser);
      toast(`Welcome, ${user.name}! Navigating to ${role.label}...`, 'success');
      navigate(`/${user.role}`);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Authentication failed. Check credentials.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '2rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Enterprise security trust bar - explicit security signaling,
          the clearest marker of an "enterprise-forward" login screen */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 28,
        flexWrap: 'wrap',
        padding: '12px 24px',
        background: 'rgba(36, 31, 43, 0.92)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: '0.7rem',
        color: 'rgba(255,255,255,0.65)',
        letterSpacing: '0.3px',
        fontFamily: 'var(--font-mono)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Lock size={11} strokeWidth={2.5} /> Sessions authenticated via JWT + bcrypt
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={11} strokeWidth={2.5} /> Role-based access control enforced server-side
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Activity size={11} strokeWidth={2.5} /> All system activity is logged
        </span>
      </div>
      {/* Animated Background Orbs */}
      <div style={{
        position: 'absolute',
        width: 800,
        height: 800,
        top: -400,
        right: -300,
        background: 'radial-gradient(circle, rgba(93,125,166,0.2), transparent 70%)',
        borderRadius: '50%',
        animation: 'float 25s ease-in-out infinite',
        filter: 'blur(60px)',
      }} />
      <div style={{
        position: 'absolute',
        width: 600,
        height: 600,
        bottom: -300,
        left: -200,
        background: 'radial-gradient(circle, rgba(134,171,151,0.18), transparent 70%)',
        borderRadius: '50%',
        animation: 'floatReverse 30s ease-in-out infinite',
        filter: 'blur(60px)',
      }} />
      <div style={{
        position: 'absolute',
        width: 500,
        height: 500,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(circle, rgba(140,124,181,0.12), transparent 70%)',
        borderRadius: '50%',
        animation: 'pulse 20s ease-in-out infinite',
        filter: 'blur(80px)',
      }} />

      <div style={{ width: '100%', maxWidth: 1300, position: 'relative', zIndex: 1 }}>
        {/* ── PREMIUM HERO HEADER ── */}
        <div className="card-glow" style={{ 
          marginBottom: 40, 
          textAlign: 'center',
          padding: '3rem 2rem',
          animation: 'fadeInUp 0.8s cubic-bezier(0.4, 0, 0.2, 1) both',
          position: 'relative',
        }}>
          {/* Logo + Title */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 20 }}>
            <div style={{ 
              width: 72, 
              height: 72, 
              borderRadius: 22, 
              background: 'linear-gradient(135deg, #46617F 0%, #3A5269 100%)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontSize: 36, 
              boxShadow: '0 12px 40px rgba(70,97,127,0.45), 0 4px 12px rgba(70,97,127,0.3), inset 0 2px 4px rgba(255,255,255,0.3)',
              border: '3px solid rgba(255,255,255,0.4)',
              animation: 'float 6s ease-in-out infinite',
            }}>🚑</div>
            <div>
              <div style={{ 
                fontFamily: 'var(--font-display)',
                fontSize: '4.25rem', 
                fontWeight: 600, 
                fontStyle: 'italic',
                letterSpacing: '-1px', 
                lineHeight: 1, 
                textShadow: '0 4px 12px rgba(90,60,40,0.08)',
                background: 'linear-gradient(135deg, #46617F, #86AB97)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                AERIS
              </div>
            </div>
          </div>

          {/* Subtitle */}
          <div style={{ 
            fontFamily: 'var(--font-sans)',
            fontSize: '0.875rem', 
            letterSpacing: '4px', 
            color: '#5C5568', 
            textTransform: 'uppercase', 
            marginBottom: 28,
            fontWeight: 700,
            lineHeight: 1.8,
          }}>
            Ambulance Emergency Response Intelligent System
          </div>

          {/* Premium Badge Pills */}
          <div style={{ 
            display: 'flex', 
            gap: 12, 
            justifyContent: 'center', 
            flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            {/* JWT Auth Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 20,
              background: 'linear-gradient(135deg, rgba(110,148,129,0.15) 0%, rgba(110,148,129,0.10) 100%)',
              border: '1.5px solid rgba(110,148,129,0.3)',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#557563',
              letterSpacing: '0.3px',
              boxShadow: '0 4px 12px rgba(110,148,129,0.18), 0 2px 4px rgba(0,0,0,0.05)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'default',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(110,148,129,0.25), 0 3px 6px rgba(0,0,0,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(110,148,129,0.18), 0 2px 4px rgba(0,0,0,0.05)';
            }}>
              <Shield size={14} strokeWidth={2.5} style={{ color: '#6E9481' }} />
              JWT Auth Active
            </div>

            {/* Dijkstra Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 20,
              background: 'linear-gradient(135deg, rgba(93,125,166,0.15) 0%, rgba(93,125,166,0.10) 100%)',
              border: '1.5px solid rgba(93,125,166,0.3)',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#3A5269',
              letterSpacing: '0.3px',
              boxShadow: '0 4px 12px rgba(93,125,166,0.18), 0 2px 4px rgba(0,0,0,0.05)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'default',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(93,125,166,0.25), 0 3px 6px rgba(0,0,0,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(93,125,166,0.18), 0 2px 4px rgba(0,0,0,0.05)';
            }}>
              <Zap size={14} strokeWidth={2.5} style={{ color: '#46617F' }} />
              Dijkstra Routing
            </div>

            {/* SSE Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 20,
              background: 'linear-gradient(135deg, rgba(200,155,92,0.15) 0%, rgba(200,155,92,0.10) 100%)',
              border: '1.5px solid rgba(200,155,92,0.3)',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#8A6835',
              letterSpacing: '0.3px',
              boxShadow: '0 4px 12px rgba(200,155,92,0.18), 0 2px 4px rgba(0,0,0,0.05)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'default',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(200,155,92,0.25), 0 3px 6px rgba(0,0,0,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(200,155,92,0.18), 0 2px 4px rgba(0,0,0,0.05)';
            }}>
              <Wifi size={14} strokeWidth={2.5} style={{ color: '#A67D42' }} />
              Real-time SSE
            </div>

            {/* Signal Engine Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 20,
              background: 'linear-gradient(135deg, rgba(140,124,181,0.15) 0%, rgba(140,124,181,0.10) 100%)',
              border: '1.5px solid rgba(140,124,181,0.3)',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#6F6096',
              letterSpacing: '0.3px',
              boxShadow: '0 4px 12px rgba(140,124,181,0.18), 0 2px 4px rgba(0,0,0,0.05)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'default',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(140,124,181,0.25), 0 3px 6px rgba(0,0,0,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(140,124,181,0.18), 0 2px 4px rgba(0,0,0,0.05)';
            }}>
              <Cpu size={14} strokeWidth={2.5} style={{ color: '#8C7CB5' }} />
              Signal Control Engine
            </div>
          </div>
        </div>

        {/* ── TWO COLUMN GRID ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', gap: 32, alignItems: 'start' }}>
          {/* LEFT: Access Modules */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ 
              fontSize: '0.75rem', 
              fontWeight: 800, 
              letterSpacing: '2.5px', 
              textTransform: 'uppercase', 
              marginBottom: 8, 
              paddingLeft: 6, 
              color: '#5C5568',
              lineHeight: 1.6,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <Layers size={16} strokeWidth={2.5} style={{ color: '#5D7DA6' }} />
              Access Modules
            </div>
            {ROLES.map((role, index) => (
              <motion.button key={role.key}
                onClick={() => handleRoleClick(role.key)}
                disabled={loading}
                className="metric-card-enhanced"
                whileHover={{ y: -6, scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 320, damping: 24, bounce: 0.05 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 18, padding: '20px',
                  background: selectedRole === role.key 
                    ? `linear-gradient(135deg, ${role.color}18, ${role.color}08)` 
                    : undefined,
                  border: `2px solid ${selectedRole === role.key ? role.color + '60' : 'rgba(255,255,255,0.65)'}`,
                  cursor: 'pointer', textAlign: 'left',
                  boxShadow: selectedRole === role.key 
                    ? `0 12px 40px ${role.color}25, 0 4px 16px ${role.color}18` 
                    : undefined,
                  animation: `fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${0.2 + index * 0.1}s both`,
                }}
              >
                {/* Subtle gradient overlay for active state */}
                {selectedRole === role.key && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: `linear-gradient(135deg, ${role.color}08, transparent)`,
                    pointerEvents: 'none',
                  }} />
                )}
                
                <div style={{
                  width: 56, height: 56, borderRadius: 16, flexShrink: 0,
                  background: selectedRole === role.key 
                    ? `linear-gradient(135deg, ${role.color}25, ${role.color}15)` 
                    : 'linear-gradient(135deg, rgba(255,255,255,0.8), rgba(255,255,255,0.4))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: selectedRole === role.key ? role.color : 'var(--text-secondary)',
                  border: `2px solid ${selectedRole === role.key ? role.color + '50' : 'rgba(255,255,255,0.6)'}`,
                  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: selectedRole === role.key ? `0 6px 20px ${role.color}20, inset 0 1px 2px rgba(255,255,255,0.5)` : 'inset 0 1px 2px rgba(255,255,255,0.8)',
                  position: 'relative',
                  zIndex: 1,
                }}>
                  {role.icon}
                </div>
                <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
                  <div style={{ 
                    fontWeight: 800, 
                    fontSize: '1rem', 
                    color: selectedRole === role.key ? role.color : '#241F2B',
                    marginBottom: 6,
                    transition: 'color 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    letterSpacing: '-0.3px',
                    lineHeight: 1.3,
                  }}>{role.label}</div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#5C5568', 
                    lineHeight: 1.6,
                    letterSpacing: '0.1px',
                    transition: 'color 0.3s ease',
                  }}>{role.desc}</div>
                </div>
                {selectedRole === role.key && (
                  <ChevronRight 
                    size={18} 
                    color={role.color} 
                    style={{ 
                      position: 'relative', 
                      zIndex: 1,
                      animation: 'pulse 2s ease-in-out infinite',
                    }} 
                  />
                )}
              </motion.button>
            ))}
            
            {/* System Architecture */}
            <div className="status-card" style={{ 
              padding: '20px', 
              marginTop: 16,
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'default',
              animation: 'fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.7s both',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px) scale(1.01)';
              e.currentTarget.style.boxShadow = '0 12px 36px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '';
            }}>
              <div style={{ 
                fontSize: '0.75rem', 
                fontWeight: 800, 
                letterSpacing: '2px', 
                textTransform: 'uppercase', 
                marginBottom: 16, 
                color: '#5C5568',
                lineHeight: 1.6,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <Cpu size={16} strokeWidth={2.5} style={{ color: '#8C7CB5' }} />
                System Stack
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                {[
                  ['Auth', 'JWT + bcrypt'],
                  ['Routing', 'Dijkstra'],
                  ['Real-time', 'SSE'],
                  ['Architecture', 'Software-only'],
                  ['Detection', 'YOLO + FFT'],
                  ['Sessions', 'Multi-amb'],
                  ['Fail-safe', 'Cam ↔ Siren'],
                  ['Backend', 'Node + TS'],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: '#5C5568', fontSize: '0.7rem', letterSpacing: '0.2px', lineHeight: 1.6 }}>{k}</span>
                    <span className="mono" style={{ color: '#241F2B', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.1px' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: Dynamic Content Panel */}
          <div style={{ animation: 'fadeInUp 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.3s both' }}>
            <div className="card-premium" style={{
              borderColor: selectedDef ? selectedDef.color + '28' : undefined,
              background: selectedDef ? `linear-gradient(135deg, ${selectedDef.color}05, var(--bg-card))` : undefined,
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              padding: '2rem',
              minHeight: 520,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.005)';
              e.currentTarget.style.boxShadow = selectedDef 
                ? `0 12px 36px ${selectedDef.color}12, 0 4px 12px rgba(0,0,0,0.06)`
                : '0 8px 24px rgba(0,0,0,0.08), 0 3px 8px rgba(0,0,0,0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '';
            }}>
              {!selectedRole ? (
                <div style={{ textAlign: 'center', padding: '2rem', animation: 'fadeIn 0.5s ease both' }}>
                  {/* Decorative Icon Circle */}
                  <div style={{
                    width: 120,
                    height: 120,
                    margin: '0 auto 24px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(93,125,166,0.12) 0%, rgba(140,124,181,0.12) 100%)',
                    border: '2px solid rgba(93,125,166,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    boxShadow: '0 8px 24px rgba(93,125,166,0.15), inset 0 2px 4px rgba(255,255,255,0.5)',
                    animation: 'scaleIn 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.2s both',
                  }}>
                    {/* Inner glow circle */}
                    <div style={{
                      width: 100,
                      height: 100,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Layers size={48} strokeWidth={1.5} style={{ color: '#5D7DA6' }} />
                    </div>
                    {/* Floating dots decoration */}
                    <div style={{
                      position: 'absolute',
                      top: 15,
                      right: 15,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#5D7DA6',
                      boxShadow: '0 0 0 4px rgba(93,125,166,0.2)',
                      animation: 'float 3s ease-in-out infinite',
                    }} />
                    <div style={{
                      position: 'absolute',
                      bottom: 20,
                      left: 10,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#8C7CB5',
                      boxShadow: '0 0 0 3px rgba(140,124,181,0.2)',
                      animation: 'float 3s ease-in-out infinite 1s',
                    }} />
                  </div>

                  {/* Title */}
                  <div style={{ 
                    fontWeight: 700, 
                    color: '#241F2B', 
                    fontSize: '1.35rem', 
                    letterSpacing: '-0.5px', 
                    lineHeight: 1.3,
                    marginBottom: 12,
                  }}>
                    Select Your Access Module
                  </div>

                  {/* Description */}
                  <div style={{ 
                    fontSize: '0.875rem', 
                    color: '#5C5568', 
                    lineHeight: 1.6, 
                    letterSpacing: '0.1px',
                    marginBottom: 24,
                    maxWidth: 320,
                    margin: '0 auto 24px',
                  }}>
                    Choose a role from the left panel to access the authentication portal. Credentials are auto-filled for demo convenience.
                  </div>

                  {/* Feature Pills */}
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <div style={{
                      padding: '6px 14px',
                      borderRadius: 16,
                      background: 'rgba(110,148,129,0.1)',
                      border: '1px solid rgba(110,148,129,0.2)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: '#557563',
                      letterSpacing: '0.3px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <Shield size={12} strokeWidth={2.5} style={{ color: '#6E9481' }} />
                      Secure JWT
                    </div>
                    <div style={{
                      padding: '6px 14px',
                      borderRadius: 16,
                      background: 'rgba(93,125,166,0.1)',
                      border: '1px solid rgba(93,125,166,0.2)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: '#3A5269',
                      letterSpacing: '0.3px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <Zap size={12} strokeWidth={2.5} style={{ color: '#46617F' }} />
                      Fast Login
                    </div>
                    <div style={{
                      padding: '6px 14px',
                      borderRadius: 16,
                      background: 'rgba(140,124,181,0.1)',
                      border: '1px solid rgba(140,124,181,0.2)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: '#6F6096',
                      letterSpacing: '0.3px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <CheckCircle2 size={12} strokeWidth={2.5} style={{ color: '#8C7CB5' }} />
                      bcrypt Hash
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ animation: 'fadeIn 0.4s ease both' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, animation: 'slideInRight 0.5s cubic-bezier(0.4, 0, 0.2, 1) both' }}>
                    <div style={{ color: selectedDef?.color, background: `${selectedDef?.color}15`, padding: 12, borderRadius: 12, border: `1px solid ${selectedDef?.color}30` }}>
                      {selectedDef?.icon}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: selectedDef?.color, fontSize: '1.1rem', letterSpacing: '-0.3px', lineHeight: 1.3 }}>{selectedDef?.label}</div>
                      <div style={{ fontSize: '0.75rem', color: '#5C5568', marginTop: 2, letterSpacing: '0.2px', lineHeight: 1.5 }}>JWT-protected endpoint · bcrypt verified</div>
                    </div>
                  </div>

                  {error && (
                    <div style={{ padding: '12px 16px', background: 'rgba(255,59,92,0.12)', border: '1px solid rgba(255,59,92,0.3)', borderRadius: 12, fontSize: '0.82rem', color: 'var(--c-red)', marginBottom: 16, lineHeight: 1.5, letterSpacing: '0.1px' }}>
                      ⚠️ {error}
                    </div>
                  )}

                  <form onSubmit={handleLogin} style={{ animation: 'fadeInUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) 0.1s both' }}>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.5px', color: '#5C5568', marginBottom: 8, lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <User size={14} strokeWidth={2.5} style={{ color: '#5C5568' }} />
                        Username (Role ID)
                      </label>
                      <input className="form-input" value={selectedRole} readOnly style={{ opacity: 0.55 }} />
                    </div>

                    <div className="form-group" style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.5px', color: '#5C5568', marginBottom: 8, lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Lock size={14} strokeWidth={2.5} style={{ color: '#5C5568' }} />
                        Password
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="form-input"
                          type={showPass ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="Enter password..."
                          autoFocus
                          style={{ paddingRight: '2.5rem', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
                        />
                        <button type="button" onClick={() => setShowPass(s => !s)} style={{ 
                          position: 'absolute', 
                          right: 12, 
                          top: '50%', 
                          transform: 'translateY(-50%)', 
                          background: 'none', 
                          border: 'none', 
                          cursor: 'pointer', 
                          color: '#5C5568',
                          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                          padding: '4px',
                          borderRadius: '6px',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#241F2B';
                          e.currentTarget.style.background = 'rgba(0,0,0,0.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#5C5568';
                          e.currentTarget.style.background = 'none';
                        }}>
                          {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !password}
                      className="btn btn-lg w-full"
                      style={{
                        marginTop: 16,
                        background: (!loading && password) ? `linear-gradient(180deg, ${selectedDef?.color} 0%, ${selectedDef?.color}dd 100%)` : 'rgba(0,0,0,0.06)',
                        color: (!loading && password) ? 'white' : 'var(--text-secondary)',
                        boxShadow: (!loading && password) ? `0 2px 8px ${selectedDef?.color}30, 0 1px 3px rgba(0,0,0,0.08)` : 'none',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: 'scale(1)',
                      }}
                      onMouseEnter={(e) => {
                        if (!loading && password) {
                          e.currentTarget.style.transform = 'translateY(-2px) scale(1.01)';
                          e.currentTarget.style.boxShadow = `0 6px 20px ${selectedDef?.color}40, 0 3px 8px rgba(0,0,0,0.12)`;
                          e.currentTarget.style.filter = 'brightness(1.08)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = (!loading && password) ? `0 2px 8px ${selectedDef?.color}30, 0 1px 3px rgba(0,0,0,0.08)` : 'none';
                        e.currentTarget.style.filter = 'brightness(1)';
                      }}
                      onMouseDown={(e) => {
                        if (!loading && password) {
                          e.currentTarget.style.transform = 'scale(0.98)';
                        }
                      }}
                      onMouseUp={(e) => {
                        if (!loading && password) {
                          e.currentTarget.style.transform = 'translateY(-2px) scale(1.01)';
                        }
                      }}
                    >
                      <Zap size={18} strokeWidth={2.5} style={{ display: 'inline', marginRight: 8 }} />
                      {loading ? 'Authenticating via JWT...' : `Enter ${selectedDef?.label} Portal →`}
                    </button>
                  </form>

                  <div style={{ textAlign: 'center', fontSize: '0.72rem', color: '#837C8E', marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.08)', lineHeight: 1.6, letterSpacing: '0.2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, animation: 'fadeIn 0.5s ease 0.3s both' }}>
                    <Shield size={14} strokeWidth={2} style={{ color: '#837C8E' }} />
                    bcrypt password hashing · 8hr JWT session token
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
