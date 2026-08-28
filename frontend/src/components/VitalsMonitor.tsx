import React from 'react';
import { Heart, Activity, Wind } from 'lucide-react';

interface VitalsMonitorProps {
  vitals: { heartRate: number; bpSystolic: number; bpDiastolic: number; spo2: number };
  severity: 'critical' | 'serious' | 'stable';
  compact?: boolean;
}

// Clinical-ish thresholds for color coding - not diagnostic, just enough
// to make the numbers visually mean something instead of being flat text.
function hrColor(hr: number) {
  if (hr < 60 || hr > 120) return 'var(--red-bright)';
  if (hr < 70 || hr > 100) return 'var(--orange)';
  return 'var(--green)';
}
function spo2Color(spo2: number) {
  if (spo2 < 90) return 'var(--red-bright)';
  if (spo2 < 95) return 'var(--orange)';
  return 'var(--green)';
}
function bpColor(sys: number) {
  if (sys < 90 || sys > 140) return 'var(--red-bright)';
  if (sys < 100 || sys > 130) return 'var(--orange)';
  return 'var(--green)';
}

const VitalsMonitor: React.FC<VitalsMonitorProps> = ({ vitals, compact = false }) => {
  const { heartRate, bpSystolic, bpDiastolic, spo2 } = vitals;
  // Pulse animation speed reflects actual heart rate - faster HR, faster
  // visual pulse, so the monitor "feels" alive rather than just showing text.
  const pulseDuration = Math.max(0.35, 60 / Math.max(heartRate, 1));

  return (
    <div style={{ display: 'flex', gap: compact ? 14 : 20, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Heart
          size={compact ? 16 : 20}
          color={hrColor(heartRate)}
          fill={hrColor(heartRate)}
          style={{ animation: `pulse ${pulseDuration}s ease-in-out infinite` }}
        />
        <div>
          <div style={{ fontWeight: 800, fontSize: compact ? '0.95rem' : '1.15rem', color: hrColor(heartRate), lineHeight: 1 }}>
            {heartRate} <span style={{ fontSize: '0.65em', fontWeight: 600 }}>bpm</span>
          </div>
          {!compact && <div className="text-xs text-quiet">Heart Rate</div>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Activity size={compact ? 16 : 20} color={bpColor(bpSystolic)} />
        <div>
          <div style={{ fontWeight: 800, fontSize: compact ? '0.95rem' : '1.15rem', color: bpColor(bpSystolic), lineHeight: 1 }}>
            {bpSystolic}/{bpDiastolic}
          </div>
          {!compact && <div className="text-xs text-quiet">Blood Pressure</div>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Wind size={compact ? 16 : 20} color={spo2Color(spo2)} />
        <div>
          <div style={{ fontWeight: 800, fontSize: compact ? '0.95rem' : '1.15rem', color: spo2Color(spo2), lineHeight: 1 }}>
            {spo2}<span style={{ fontSize: '0.65em', fontWeight: 600 }}>%</span>
          </div>
          {!compact && <div className="text-xs text-quiet">SpO₂</div>}
        </div>
      </div>
    </div>
  );
};

export default VitalsMonitor;
