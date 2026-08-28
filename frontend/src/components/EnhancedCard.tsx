import React from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';

interface EnhancedCardProps {
  children: React.ReactNode;
  variant?: 'default' | 'premium' | 'glow' | 'metric' | 'status';
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export const EnhancedCard: React.FC<EnhancedCardProps> = ({ 
  children, 
  variant = 'default', 
  className = '', 
  style,
  onClick 
}) => {
  const variantClass = variant === 'default' ? 'card' : `card-${variant}`;
  
  return (
    <div 
      className={`${variantClass} ${className}`} 
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

interface GlassCardProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  className?: string;
  glowColor?: string;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  icon,
  title,
  subtitle,
  badge,
  className = '',
  glowColor = 'rgba(59,130,246,0.15)'
}) => {
  return (
    <div className={`card-glow ${className}`}>
      {(icon || title || badge) && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid rgba(255,255,255,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {icon && (
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: `linear-gradient(135deg, ${glowColor}, rgba(255,255,255,0.5))`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 4px 16px ${glowColor}, inset 0 1px 2px rgba(255,255,255,0.8)`,
                border: '1px solid rgba(255,255,255,0.6)'
              }}>
                {icon}
              </div>
            )}
            <div>
              {title && (
                <div style={{ 
                  fontSize: '1.125rem', 
                  fontWeight: 800, 
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.5px'
                }}>
                  {title}
                </div>
              )}
              {subtitle && (
                <div style={{ 
                  fontSize: '0.8125rem', 
                  color: 'var(--text-secondary)',
                  marginTop: 2
                }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>
          {badge}
        </div>
      )}
      {children}
    </div>
  );
};

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  subtitle?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  icon,
  color = 'var(--blue)',
  trend,
  trendValue,
  subtitle
}) => {
  // Real Framer Motion 3D tilt: raw pointer position (0-1 across the card)
  // feeds useTransform to map to a rotation range, smoothed through a
  // spring so it settles instead of snapping - the textbook pattern for
  // this effect, kept to a small ±5deg range for a dashboard's tone.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [5, -5]), { stiffness: 300, damping: 25, bounce: 0.05 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-5, 5]), { stiffness: 300, damping: 25, bounce: 0.05 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  };
  const handleMouseLeave = () => { px.set(0.5); py.set(0.5); };

  return (
    <motion.div
      className="metric-card-enhanced"
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25, bounce: 0.05 }}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'flex-start', 
        justifyContent: 'space-between',
        marginBottom: '1rem'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ 
            fontSize: '0.75rem', 
            fontWeight: 700, 
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            marginBottom: '0.75rem'
          }}>
            {label}
          </div>
          <div style={{ 
            fontSize: '3.5rem', 
            fontWeight: 900, 
            lineHeight: 1,
            letterSpacing: '-2px',
            background: `linear-gradient(135deg, ${color}, var(--text-primary))`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '0.5rem'
          }}>
            {value}
          </div>
          {subtitle && (
            <div style={{ 
              fontSize: '0.8125rem', 
              color: 'var(--text-secondary)',
              fontWeight: 500
            }}>
              {subtitle}
            </div>
          )}
        </div>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          background: `linear-gradient(135deg, ${color}20, ${color}10)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: color,
          boxShadow: `0 4px 16px ${color}30`,
          border: `1px solid ${color}40`
        }}>
          {icon}
        </div>
      </div>
      {trend && trendValue && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 6,
          padding: '8px 12px',
          background: trend === 'up' ? 'rgba(16,185,129,0.1)' : trend === 'down' ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.1)',
          borderRadius: 12,
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: trend === 'up' ? 'var(--green)' : trend === 'down' ? 'var(--red)' : 'var(--text-secondary)'
        }}>
          <span>{trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'}</span>
          <span>{trendValue}</span>
        </div>
      )}
    </motion.div>
  );
};

export default EnhancedCard;
