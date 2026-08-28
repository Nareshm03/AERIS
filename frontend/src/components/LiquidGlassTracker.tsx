import { useEffect, useRef } from 'react';

/**
 * Powers two things on every `.card` element, application-wide:
 *
 * 1. The "Liquid Glass" cursor sheen (--mx/--my, consumed by .card::after
 *    in index.css) - a specular highlight that tracks the pointer.
 * 2. A real spring-physics 3D tilt (rotateX/rotateY toward the cursor),
 *    critically-damped so it settles smoothly instead of oscillating.
 *
 * WHY THIS ISN'T JUST <motion.div> EVERYWHERE:
 * Most `.card` divs in this app are raw JSX scattered across five page
 * files, not one shared component. Converting every single one to
 * Framer Motion's <motion.div> would mean editing dozens of tag pairs
 * with real risk of a mismatched open/close tag breaking a page. This
 * uses the same spring math Framer Motion uses internally (a
 * critically-damped harmonic oscillator - see `makeSpring()` below) but
 * drives it through one global rAF loop and direct style writes, so
 * every card everywhere gets the effect with zero risk to existing JSX.
 * (Framer Motion itself IS used directly elsewhere - see Login.tsx's
 * role cards and components/EnhancedCard.tsx - wherever the card is
 * already a single reusable component, not scattered raw divs.)
 *
 * Respects prefers-reduced-motion and is inert on touch devices (there's
 * no cursor to tilt toward, and a broken half-effect on mobile is worse
 * than no effect at all).
 */

// Max tilt angle in degrees - kept deliberately small (research consensus
// for professional/dashboard UI vs. showcase demos, which often go
// 15-20°: too much for a tool people use under time pressure).
const MAX_TILT_DEG = 5;
const LIFT_PX = 6;

// A single critically-damped spring, stepped every frame. stiffness/damping
// tuned so overshoot stays minimal (Framer Motion's own guidance: keep
// bounce low for UI - high bounce reads as "playful," wrong register here).
function makeSpring(stiffness = 210, damping = 26) {
  let value = 0, velocity = 0;
  return {
    step(target: number, dt: number) {
      const accel = (target - value) * stiffness - velocity * damping;
      velocity += accel * dt;
      value += velocity * dt;
      return value;
    },
  };
}

const LiquidGlassTracker: React.FC = () => {
  const activeCard = useRef<HTMLElement | null>(null);
  const targetRef = useRef({ rx: 0, ry: 0, lift: 0 });
  const springs = useRef({ rx: makeSpring(), ry: makeSpring(), lift: makeSpring(180, 22) });
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isTouch || reducedMotion) return; // no cursor to track, or user opted out

    const handleMove = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('.card') as HTMLElement | null;

      if (target) {
        const rect = target.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * 100;
        const py = ((e.clientY - rect.top) / rect.height) * 100;
        target.style.setProperty('--mx', `${px}%`);
        target.style.setProperty('--my', `${py}%`);

        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top) / rect.height - 0.5;
        targetRef.current = { rx: nx * MAX_TILT_DEG * 2, ry: -ny * MAX_TILT_DEG * 2, lift: LIFT_PX };
        activeCard.current = target;
      } else if (activeCard.current) {
        targetRef.current = { rx: 0, ry: 0, lift: 0 };
      }
    };

    const tick = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;

      if (activeCard.current) {
        const rx = springs.current.rx.step(targetRef.current.rx, dt);
        const ry = springs.current.ry.step(targetRef.current.ry, dt);
        const lift = springs.current.lift.step(targetRef.current.lift, dt);

        activeCard.current.style.transform =
          `perspective(900px) rotateX(${ry.toFixed(2)}deg) rotateY(${rx.toFixed(2)}deg) translateY(${-lift.toFixed(1)}px) scale(${(1 + lift * 0.0015).toFixed(4)})`;

        if (targetRef.current.lift === 0 && Math.abs(rx) < 0.05 && Math.abs(ry) < 0.05 && lift < 0.05) {
          activeCard.current.style.transform = '';
          activeCard.current = null;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    document.addEventListener('mousemove', handleMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return null;
};

export default LiquidGlassTracker;
