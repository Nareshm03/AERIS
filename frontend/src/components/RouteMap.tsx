import React, { useEffect, useRef } from 'react';

interface Props {
  route: string[];
  currentIndex: number;
  isEmergency: boolean;
}

// Fixed positions for each possible junction name (normalized 0-1)
const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  'Dispatch Bay':       { x: 0.06, y: 0.5 },
  'Junction A':         { x: 0.22, y: 0.28 },
  'Junction B':         { x: 0.38, y: 0.62 },
  'Central Junction':   { x: 0.55, y: 0.3 },
  'Medical Zone':       { x: 0.72, y: 0.55 },
  'Ring Road Junction': { x: 0.25, y: 0.78 },
  'North Gate':         { x: 0.5,  y: 0.78 },
  'City Hospital':      { x: 0.91, y: 0.42 },
};

// Off-route junctions to show as background city detail
const BACKGROUND_NODES = [
  { name: 'East Cross', x: 0.43, y: 0.82 },
  { name: 'West End',   x: 0.12, y: 0.72 },
  { name: 'Civic Sq',  x: 0.65, y: 0.18 },
];

const RouteMap: React.FC<Props> = ({ route, currentIndex, isEmergency }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const pulseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;

    const getXY = (nodeName: string) => {
      const pos = NODE_POSITIONS[nodeName] || { x: 0.5, y: 0.5 };
      return { x: pos.x * W, y: pos.y * H };
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      pulseRef.current += 0.04;

      // ── Background grid ──
      ctx.strokeStyle = 'rgba(0,0,0,0.02)';
      ctx.lineWidth = 1;
      for (let xg = 0; xg < W; xg += 40) {
        ctx.beginPath(); ctx.moveTo(xg, 0); ctx.lineTo(xg, H); ctx.stroke();
      }
      for (let yg = 0; yg < H; yg += 40) {
        ctx.beginPath(); ctx.moveTo(0, yg); ctx.lineTo(W, yg); ctx.stroke();
      }

      // ── Background roads (city context) ──
      const bgRoads = [
        ['West End', 'Junction A'], ['West End', 'Ring Road Junction'],
        ['East Cross', 'Ring Road Junction'], ['East Cross', 'Medical Zone'],
        ['Civic Sq', 'Central Junction'], ['Civic Sq', 'Junction A'],
      ];
      bgRoads.forEach(([a, b]) => {
        const posA = { x: (NODE_POSITIONS[a]?.x ?? 0.5) * W, y: (NODE_POSITIONS[a]?.y ?? 0.5) * H };
        const posB = { x: (NODE_POSITIONS[b]?.x ?? 0.5) * W, y: (NODE_POSITIONS[b]?.y ?? 0.5) * H };
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,0,0,0.04)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.moveTo(posA.x, posA.y);
        ctx.lineTo(posB.x, posB.y);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // ── Background nodes ──
      BACKGROUND_NODES.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x * W, n.y * H, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fill();
        ctx.font = '9px Inter, sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.textAlign = 'center';
        ctx.fillText(n.name, n.x * W, n.y * H + 16);
      });

      // ── Active route road segments ──
      for (let i = 0; i < route.length - 1; i++) {
        const a = getXY(route[i]);
        const b = getXY(route[i + 1]);
        const isPassed   = i < currentIndex && isEmergency;
        const isCurrent  = i === currentIndex && isEmergency;

        // Road shadow
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 10;
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // Road surface
        ctx.beginPath();
        ctx.strokeStyle = isPassed ? 'rgba(0,122,255,0.3)'
          : isCurrent ? 'rgba(52,199,89,0.4)'
          : 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 7;
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // Green corridor glow
        if (isCurrent) {
          const glow = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          glow.addColorStop(0, 'rgba(52,199,89,0.8)');
          glow.addColorStop(1, 'rgba(52,199,89,0.3)');
          ctx.beginPath();
          ctx.strokeStyle = glow;
          ctx.lineWidth = 3;
          ctx.shadowBlur = 12;
          ctx.shadowColor = '#34C759';
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else if (isPassed) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(0,122,255,0.4)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 6]);
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Route direction arrows
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-5, -4); ctx.lineTo(5, 0); ctx.lineTo(-5, 4);
        ctx.fillStyle = isPassed ? 'rgba(0,122,255,0.5)' : 'rgba(0,0,0,0.12)';
        ctx.fill();
        ctx.restore();
      }

      // ── Route nodes ──
      route.forEach((nodeName, i) => {
        const { x, y } = getXY(nodeName);
        const isPassed  = i < currentIndex && isEmergency;
        const isCurrent = i === currentIndex && isEmergency;
        const isDest    = i === route.length - 1;

        const radius = isDest ? 16 : isCurrent ? 14 : 11;

        // Ring pulse for current node
        if (isCurrent) {
          const pulse = (Math.sin(pulseRef.current) + 1) / 2;
          ctx.beginPath();
          ctx.arc(x, y, radius + 8 + pulse * 10, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(52,199,89,${0.06 + pulse * 0.08})`;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(52,199,89,${0.4 + pulse * 0.4})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Hospital ring pulse
        if (isDest && isEmergency) {
          const pulse = (Math.sin(pulseRef.current * 0.8) + 1) / 2;
          ctx.beginPath();
          ctx.arc(x, y, radius + 6 + pulse * 8, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,59,48,${0.3 + pulse * 0.3})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        const bgColor = isDest ? '#FFE8E6'
          : isCurrent ? '#E8F8EC'
          : isPassed ? '#E5F1FF'
          : '#FFFFFF';
        ctx.fillStyle = bgColor;
        ctx.fill();

        // Node border
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = isDest ? '#FF3B30'
          : isCurrent ? '#34C759'
          : isPassed ? '#007AFF'
          : 'rgba(0,0,0,0.1)';
        ctx.lineWidth = isDest || isCurrent ? 2.5 : 1.5;
        ctx.shadowBlur = isCurrent ? 10 : isDest ? 8 : 0;
        ctx.shadowColor = isCurrent ? '#34C759' : '#FF3B30';
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Node inner icon
        ctx.font = `bold ${isDest ? 13 : 10}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isDest ? '#FF3B30'
          : isCurrent ? '#34C759'
          : isPassed ? '#007AFF'
          : 'var(--text-secondary)';
        ctx.fillText(isDest ? '🏥' : isPassed ? '✓' : String(i + 1), x, y + (isDest ? 0 : 1));

        // Node label
        const labelY = y + radius + 14;
        ctx.font = `${isCurrent || isDest ? 'bold' : 'normal'} 10px Inter, sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = isCurrent ? '#34C759'
          : isDest ? '#FF3B30'
          : isPassed ? '#007AFF'
          : 'var(--text-secondary)';

        // Word-wrap long names
        const words = nodeName.split(' ');
        if (words.length > 2) {
          ctx.fillText(words.slice(0, 2).join(' '), x, labelY);
          ctx.fillText(words.slice(2).join(' '), x, labelY + 11);
        } else {
          ctx.fillText(nodeName, x, labelY);
        }
      });

      // ── Animated ambulance marker ──
      if (isEmergency && currentIndex < route.length) {
        const { x, y } = getXY(route[currentIndex]);
        const bob = Math.sin(pulseRef.current * 2) * 2;
        // Shadow
        ctx.beginPath();
        ctx.ellipse(x, y + 19 + bob, 10, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();
        // Icon bg
        ctx.beginPath();
        ctx.arc(x, y - 28 + bob, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#FF3B30';
        ctx.shadowBlur = 16;
        ctx.shadowColor = 'rgba(255,59,48,0.6)';
        ctx.fill();
        ctx.shadowBlur = 0;
        // Ambulance emoji
        ctx.font = '16px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🚑', x, y - 28 + bob);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [route, currentIndex, isEmergency]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="card-header" style={{ margin: '1.5rem 1.5rem 0', paddingBottom: '1rem', borderBottom: '1px solid var(--border-light)' }}>
        <div className="card-title">
          <div className="card-title-icon" style={{ background: 'var(--blue-light)', color: 'var(--blue)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          Live Route Map
        </div>
        {isEmergency && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 0 3px rgba(52,199,89,0.15)', animation: 'blink-dot 2s infinite' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--green)' }}>Active</span>
          </div>
        )}
      </div>
      
      <div style={{ position: 'relative', padding: '1.5rem' }}>
        <canvas
          ref={canvasRef}
          width={760}
          height={260}
          style={{
            width: '100%',
            height: 'auto',
            borderRadius: 16,
            background: 'linear-gradient(135deg, #F8F9FB, #FFFFFF)',
            border: '1px solid var(--border-light)',
            display: 'block',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.04)',
          }}
        />
        
        {/* Floating Legend */}
        <div style={{
          position: 'absolute',
          top: '2rem',
          left: '2rem',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px) saturate(180%)',
          padding: '0.75rem 1rem',
          borderRadius: 12,
          border: '1px solid var(--border-light)',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          {[
            { label: 'Current',  color: 'var(--green)' },
            { label: 'Passed',   color: 'var(--blue)' },
            { label: 'Upcoming', color: 'var(--text-tertiary)' },
            { label: 'Hospital', color: 'var(--red)' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, boxShadow: `0 0 0 2px ${item.color}20` }} />
              {item.label}
            </div>
          ))}
        </div>
        
        {/* Floating Route Info */}
        {isEmergency && (
          <div style={{
            position: 'absolute',
            top: '2rem',
            right: '2rem',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(20px) saturate(180%)',
            padding: '0.75rem 1rem',
            borderRadius: 12,
            border: '1px solid var(--border-light)',
            boxShadow: 'var(--shadow-sm)',
            minWidth: 120,
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Progress</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
              {currentIndex + 1} / {route.length}
            </div>
            <div style={{ marginTop: 8, height: 4, background: 'rgba(0,0,0,0.05)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${((currentIndex + 1) / route.length) * 100}%`, background: 'var(--green)', borderRadius: 4, transition: 'width 0.6s ease' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RouteMap;
