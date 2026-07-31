import React, { useEffect, useRef } from 'react';

interface Props {
  active: boolean;
  frequency?: number; // Hz to display
}

const SirenWaveform: React.FC<Props> = ({ active, frequency = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const tRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      if (!active) {
        // Flat line with noise
        ctx.beginPath();
        ctx.strokeStyle = '#2a3958';
        ctx.lineWidth = 1.5;
        ctx.moveTo(0, H / 2);
        for (let x = 0; x < W; x++) {
          const noise = (Math.random() - 0.5) * 2;
          ctx.lineTo(x, H / 2 + noise);
        }
        ctx.stroke();
      } else {
        // Vibrant siren waveform
        const amp = H * 0.35;
        const freq = Math.max(0.02, frequency / 30000);

        // Glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#10b981';

        ctx.beginPath();
        ctx.lineWidth = 2;
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, '#3b82f6');
        grad.addColorStop(0.5, '#10b981');
        grad.addColorStop(1, '#06b6d4');
        ctx.strokeStyle = grad;

        for (let x = 0; x < W; x++) {
          const t = tRef.current * 0.05;
          const y = H / 2 + amp * Math.sin(freq * x * 2 * Math.PI + t) * Math.sin(t * 0.3);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        tRef.current++;
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [active, frequency]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={60}
      style={{ width: '100%', height: 60, borderRadius: 8, background: 'rgba(0,0,0,0.3)' }}
    />
  );
};

export default SirenWaveform;
