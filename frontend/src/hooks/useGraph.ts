import { useEffect, useMemo, useState } from 'react';
import { fetchGraph } from '../api';
import type { GraphData } from '../api';

// Backend-owned road graph: junctions, coordinates and adjacency come from
// GET /api/graph (the single source of truth). Pages must use this hook
// instead of hard-coding mirrors of the backend CITY_GRAPH.
export function useGraph() {
  const [graph, setGraph] = useState<GraphData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGraph()
      .then(g => { if (!cancelled) setGraph(g); })
      .catch(() => { /* non-critical - maps degrade to fallbacks */ });
    return () => { cancelled = true; };
  }, []);

  const coords = useMemo(() => {
    const map: Record<string, [number, number]> = {};
    graph?.nodes.forEach(n => { map[n.id] = [n.lat, n.lng]; });
    return map;
  }, [graph]);

  const adjacency = useMemo(() => {
    const map: Record<string, string[]> = {};
    graph?.edges.forEach(e => {
      (map[e.from] = map[e.from] || []).push(e.to);
      (map[e.to] = map[e.to] || []).push(e.from);
    });
    Object.values(map).forEach(list => list.sort());
    return map;
  }, [graph]);

  return { graph, coords, adjacency };
}
