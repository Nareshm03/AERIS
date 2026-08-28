import React, { useEffect, useState } from 'react';

/**
 * The "staircase" loading pattern: don't show anything for the first
 * 300ms (most SSE connections resolve near-instantly, and flashing a
 * spinner for that is just visual noise), show a small spinner from
 * 300ms-1s, then switch to a full skeleton screen shaped like the real
 * content if it's still not ready past 1s. Never spins forever - the
 * caller is expected to eventually get real data or show an error state.
 */
export function useStaircaseLoading(isLoading: boolean) {
  const [stage, setStage] = useState<'none' | 'spinner' | 'skeleton'>('none');

  useEffect(() => {
    if (!isLoading) { setStage('none'); return; }

    const spinnerTimer = setTimeout(() => setStage('spinner'), 300);
    const skeletonTimer = setTimeout(() => setStage('skeleton'), 1000);

    return () => {
      clearTimeout(spinnerTimer);
      clearTimeout(skeletonTimer);
    };
  }, [isLoading]);

  return isLoading ? stage : 'none';
}

/** A dashboard-shaped skeleton - card outlines, not just a blank spinner,
    so the page doesn't visually "jump" once real content arrives. */
export const DashboardSkeleton: React.FC = () => (
  <div className="container" style={{ animation: 'fadeIn 0.2s ease' }}>
    <div className="skeleton-block" style={{ width: '40%', height: 40, marginBottom: 12 }} />
    <div className="skeleton-block" style={{ width: '60%', height: 18, marginBottom: 32 }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-block" style={{ width: 36, height: 36, borderRadius: 10, marginBottom: 14 }} />
          <div className="skeleton-block" style={{ width: '70%', height: 14, marginBottom: 10 }} />
          <div className="skeleton-block" style={{ width: '45%', height: 22 }} />
        </div>
      ))}
    </div>
    <div className="skeleton-card" style={{ height: 320 }} />
  </div>
);
