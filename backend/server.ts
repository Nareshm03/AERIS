import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import { URL } from 'url';

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  throw new Error('JWT_SECRET not set - create backend/.env (see .env.example)');
})();
// A short secret makes HS256 brute-forceable: refuse to boot rather than
// run with one. Does not affect the documented setup (64-hex-char secret).
if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters - generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}
// Traffic signal control engine - a pure-software virtual-signal service
// (see backend/signal-controller-sim.ts). This project is software-only:
// signal states (e.g. S1 = GREEN) are application state, not physical
// traffic lights.
const SIGNAL_ENGINE_URL = process.env.SIGNAL_ENGINE_URL || 'http://localhost:4001';
const PORT = Number(process.env.PORT) || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
// NOTE: AERIS is software-only. There is no camera/siren/YOLO/FFT detection
// microservice. Emergency activation is initiated directly by the
// authenticated ambulance operator (see POST /api/emergency/start).

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════
type SignalColor = 'RED' | 'YELLOW' | 'GREEN';
type LogType    = 'info' | 'warning' | 'success' | 'error' | 'system';
type UserRole   = 'driver' | 'police' | 'hospital' | 'admin';

interface Signal {
  id: string; name: string; junction: string;
  color: SignalColor; timer: number; manualOverride: boolean;
  // Set by updateGreenCorridor() when multiple ambulances are competing
  // for this signal simultaneously - lets the frontend show the conflict
  // resolution, not just its silent outcome.
  contested?: boolean;
  contenderCount?: number;
}

interface LogEntry {
  id: string; timestamp: string; message: string;
  type: LogType; sessionRID?: string;
}

interface AmbulanceSession {
  // Internal unique key for this session (Map key). A single ambulance
  // (rid) can have many sessions over time; keying by rid overwrote history.
  id: string;
  // Ambulance display/identity RID (e.g. AMB-101). Stable per driver,
  // shown in fleet views, logs and SSE payloads. NOT unique per session.
  rid: string;
  driverId: string;
  route: string[];
  routeName: string;
  currentNodeIndex: number;
  currentGPS: [number, number];
  // Software-only emergency state. Authorization comes from JWT/RBAC at
  // activation time (driver/admin only) - there is no camera/siren/hardware
  // verification step. An 'active' session IS an authorized emergency.
  startedAt: string;
  ticksSinceAdvance: number;
  status: 'active' | 'arrived' | 'cancelled';
  // When the session left 'active' - null while active. Needed for
  // incident history (response-time reporting) since neither
  // completion path previously recorded when it happened.
  endedAt: string | null;

  // Patient intake (Section 2/16 of the spec - previously entirely missing
  // from the data model, so Hospital dashboard had nothing real to show).
  patient: {
    condition: string;             // free-text or category, e.g. "Cardiac arrest"
    severity: 'critical' | 'serious' | 'stable';
    requiredDepartment: string;    // e.g. "Cardiology", "Trauma", "General Emergency"
    notes: string;
  };

  // The real hospital this ambulance is headed to - the driver's actual
  // choice (Section 6 of the spec), not a hardcoded single destination.
  hospital: { id: string; name: string; node: string };

  // Live patient vitals during transit (spec Section 23: "Advanced patient
  // vital integration" - previously listed as a future enhancement, never
  // built). Simulated with a random-walk so it moves realistically tick to
  // tick instead of just being static numbers, biased by severity so a
  // critical patient's vitals actually look concerning.
  vitals: { heartRate: number; bpSystolic: number; bpDiastolic: number; spo2: number };

  // Simulated vehicle telemetry, owned by the BACKEND (updated every tick)
  // so every dashboard shows the same numbers. Fuel drains slowly during an
  // emergency; engine temperature random-walks within a plausible band.
  fuelLevel: number;
  engineTemp: number;

  // Hospital acknowledgment + prep tracking - was previously hardcoded fake
  // data in the frontend (Hospital.tsx). Now backed by real state that
  // syncs to every dashboard over SSE.
  hospitalAcknowledged: boolean;
  hospitalAcknowledgedAt: string | null;
  prepTasks: { id: string; label: string; done: boolean }[];
}

interface SSEClient {
  id: string; res: express.Response; ip: string;
}

// Concurrent SSE connections are cheap individually but each holds a
// socket plus a heartbeat timer, and every tick iterates all clients -
// unbounded per-IP connections are the clearest local DoS surface here.
// 10 concurrent streams per IP is far above legitimate use (each dashboard
// holds exactly one), so normal SSE traffic is never affected.
const MAX_SSE_PER_IP = 10;

// ═══════════════════════════════════════════════════════════════
//  USERS (hashed passwords for real auth)
// ═══════════════════════════════════════════════════════════════
const USERS: Record<string, { id: string; name: string; role: UserRole; hash: string; ambulanceRid?: string; dispatchNode?: string; hospitalId?: string }> = {
  // Multiple driver accounts across TWO real dispatch bases - Indiranagar
  // (east) and Silk Board Junction (south) - giving genuine multi-base
  // ambulance coverage instead of every ambulance starting from one spot.
  'driver':   { id: uuidv4(), name: 'Ravi Kumar',           role: 'driver',   hash: bcrypt.hashSync('driver123', 8),   ambulanceRid: 'AMB-101', dispatchNode: 'Indiranagar Metro (Dispatch)' },
  'driver2':  { id: uuidv4(), name: 'Suresh Nair',          role: 'driver',   hash: bcrypt.hashSync('driver123', 8),   ambulanceRid: 'AMB-102', dispatchNode: 'Silk Board Junction' },
  'driver3':  { id: uuidv4(), name: 'Anitha Rao',           role: 'driver',   hash: bcrypt.hashSync('driver123', 8),   ambulanceRid: 'AMB-103', dispatchNode: 'Indiranagar Metro (Dispatch)' },
  'police':   { id: uuidv4(), name: 'Insp. Rajesh Verma',   role: 'police',   hash: bcrypt.hashSync('police123', 8) },
  // Real per-hospital accounts - previously one generic 'hospital' login
  // could edit ANY hospital's bed count or acknowledge/prep for ANY
  // hospital's incoming patients, which doesn't match how a real hospital
  // staff account should work (only their own hospital). 'hospital' is
  // kept as a valid login (mapped to Manipal) for backward compatibility
  // with existing documentation/tests; hospital2/hospital3 are new.
  'hospital':  { id: uuidv4(), name: 'Dr. Priya Sharma',   role: 'hospital', hash: bcrypt.hashSync('hospital123', 8), hospitalId: 'manipal' },
  'hospital2': { id: uuidv4(), name: 'Dr. Arjun Reddy',    role: 'hospital', hash: bcrypt.hashSync('hospital123', 8), hospitalId: 'stjohns' },
  'hospital3': { id: uuidv4(), name: 'Dr. Lakshmi Iyer',   role: 'hospital', hash: bcrypt.hashSync('hospital123', 8), hospitalId: 'victoria' },
  // Per-hospital staff accounts for the expanded network - each login can
  // only acknowledge/prep and manage beds for its OWN hospital.
  'hospital4': { id: uuidv4(), name: 'Dr. Meera Nair',     role: 'hospital', hash: bcrypt.hashSync('hospital123', 8), hospitalId: 'sakra' },
  'hospital5': { id: uuidv4(), name: 'Dr. Vikram Shah',    role: 'hospital', hash: bcrypt.hashSync('hospital123', 8), hospitalId: 'astercmi' },
  'hospital6': { id: uuidv4(), name: 'Dr. Kavya Menon',    role: 'hospital', hash: bcrypt.hashSync('hospital123', 8), hospitalId: 'fortis' },
  'hospital7': { id: uuidv4(), name: 'Dr. Rohan Das',      role: 'hospital', hash: bcrypt.hashSync('hospital123', 8), hospitalId: 'asterwhitefield' },
  'admin':    { id: uuidv4(), name: 'System Administrator', role: 'admin',    hash: bcrypt.hashSync('admin123', 8) },
};

// ═══════════════════════════════════════════════════════════════
//  DIJKSTRA CITY GRAPH + GPS COORDINATES
//  A real, much wider Bengaluru road network - Indiranagar in the
//  east through MG Road/Trinity Circle in central Bengaluru down to
//  Silk Board Junction in the south. Every coordinate below was
//  verified against real-world sources (Wikipedia, OSM node data,
//  BMTC/Namma Metro transit records, hospital addresses), not
//  invented. Edge weights are real approximate road distances in km.
//  Two real ambulance dispatch points and THREE real hospitals -
//  this is genuine hospital selection (Section 6 of the original
//  spec), not a single hardcoded destination.
// ═══════════════════════════════════════════════════════════════
type Graph = Record<string, Record<string, number>>;

const CITY_GRAPH: Graph = {
  // Indiranagar cluster (east)
  'Indiranagar Metro (Dispatch)': { '100 Feet Road Junction': 0.8, 'Domlur Flyover': 2.3, 'Halasuru (Ulsoor)': 1.4 },
  '100 Feet Road Junction':       { 'Indiranagar Metro (Dispatch)': 0.8, 'Domlur Flyover': 1.3 },
  'Domlur Flyover':               { '100 Feet Road Junction': 1.3, 'Indiranagar Metro (Dispatch)': 2.3, 'Kodihalli Junction': 0.6, 'Marathahalli (ORR)': 6.5, 'Adugodi': 3.8 },
  'Kodihalli Junction':           { 'Domlur Flyover': 0.6, 'Manipal Hospital': 0.3, 'Marathahalli (ORR)': 5.9 },
  'Marathahalli (ORR)':           { 'Domlur Flyover': 6.5, 'Kodihalli Junction': 5.9, 'Devarabeesanahalli': 2.2, 'Whitefield / ITPL Approach': 5.5, 'Silk Board Junction': 7.0 },
  'Manipal Hospital':             { 'Kodihalli Junction': 0.3 },

  // East / northeast expansion (ORR / Whitefield corridor)
  'Devarabeesanahalli':           { 'Marathahalli (ORR)': 2.2, 'Sakra World Hospital': 0.8 },
  'Sakra World Hospital':         { 'Devarabeesanahalli': 0.8 },
  'Whitefield / ITPL Approach':   { 'Marathahalli (ORR)': 5.5, 'Aster Whitefield': 0.9 },
  'Aster Whitefield':             { 'Whitefield / ITPL Approach': 0.9 },

  // Central corridor (MG Road / Trinity Circle / Ulsoor)
  'Halasuru (Ulsoor)':            { 'Indiranagar Metro (Dispatch)': 1.4, 'Trinity Circle': 1.1 },
  'Trinity Circle':               { 'Halasuru (Ulsoor)': 1.1, 'Victoria Hospital': 4.8, 'Adugodi': 3.4, 'Cunningham Road': 3.2 },
  'Victoria Hospital':            { 'Trinity Circle': 4.8 },

  // Central-north expansion (Cunningham Road / Hebbal corridor)
  'Cunningham Road':              { 'Trinity Circle': 3.2, 'Fortis Hospital': 0.5, 'Hebbal': 6.0 },
  'Fortis Hospital':              { 'Cunningham Road': 0.5 },
  'Hebbal':                       { 'Cunningham Road': 6.0, 'Aster CMI Approach': 1.6 },
  'Aster CMI Approach':           { 'Hebbal': 1.6, 'Aster CMI Hospital': 0.7 },
  'Aster CMI Hospital':           { 'Aster CMI Approach': 0.7 },

  // Southern corridor (Hosur Road / Koramangala / Silk Board)
  // Adugodi ↔ Domlur Flyover via Inner Ring Road closes a central loop so
  // cross-city routes (e.g. Silk Board → Manipal) have a genuine alternate.
  'Adugodi':                      { 'Trinity Circle': 3.4, 'Silk Board Junction': 3.3, 'Domlur Flyover': 3.8 },
  'Silk Board Junction':          { 'Adugodi': 3.3, "St. John's Medical College Hospital": 1.4, 'Marathahalli (ORR)': 7.0 },
  "St. John's Medical College Hospital": { 'Silk Board Junction': 1.4 },
};

// GPS coordinates - real, verified reference points for the software graph
// (simulated positions, not hardware GPS input). Original-cluster sources
// noted above; expansion nodes use published Bengaluru area locations.
const GPS_COORDS: Record<string, [number, number]> = {
  'Indiranagar Metro (Dispatch)':          [12.9786, 77.6388],
  '100 Feet Road Junction':                [12.9719, 77.6412],
  'Domlur Flyover':                        [12.9604, 77.6417],
  'Kodihalli Junction':                    [12.9601, 77.6472],
  'Marathahalli (ORR)':                    [12.9562, 77.7019],
  'Manipal Hospital':                      [12.9588, 77.6491],
  'Devarabeesanahalli':                    [12.9490, 77.7170],
  'Sakra World Hospital':                  [12.9455, 77.7250],
  'Whitefield / ITPL Approach':            [12.9690, 77.7500],
  'Aster Whitefield':                      [12.9730, 77.7600],
  'Halasuru (Ulsoor)':                     [12.9757, 77.6263],
  'Trinity Circle':                        [12.9730, 77.6170],
  'Victoria Hospital':                     [12.9634, 77.5738],
  'Cunningham Road':                       [12.9830, 77.5950],
  'Fortis Hospital':                       [12.9845, 77.5930],
  'Hebbal':                                [13.0350, 77.5970],
  'Aster CMI Approach':                    [13.0250, 77.5900],
  'Aster CMI Hospital':                    [13.0200, 77.5850],
  'Adugodi':                               [12.9435, 77.6091],
  'Silk Board Junction':                   [12.9170, 77.6220],  // Second ambulance dispatch base
  "St. John's Medical College Hospital":   [12.9293, 77.6201],
};

// Real hospitals - the driver picks one at activation (Section 6 of the
// spec: hospital selection was always meant to be a real choice, not a
// single hardcoded destination). Each is a real, addressable hospital.
// Bed capacity - mutable, updated live by hospital staff. This was
// documented in the original spec's DB schema ("emergencyCapacity:
// totalBeds, availableBeds") but never actually implemented until now.
interface Hospital {
  // `node` is the graph node id of this hospital in CITY_GRAPH (the single
  // source of truth for routing). `lat`/`lng` mirror GPS_COORDS[node] so
  // clients can render markers without a second lookup. These are simulated
  // hospital destinations representing real Bengaluru locations - AERIS is
  // not connected to any of these hospitals.
  id: string; name: string; shortName: string; area: string;
  node: string; lat: number; lng: number;
  departments: string[]; address: string;
  totalBeds: number; availableBeds: number;
}
const HOSPITALS: Hospital[] = [
  { id: 'manipal', name: 'Manipal Hospital', shortName: 'Manipal', area: 'Old Airport Road', node: 'Manipal Hospital', lat: 12.9588, lng: 77.6491, departments: ['Trauma', 'Cardiology', 'General Emergency', 'Neurology'], address: 'Old Airport Road, Kodihalli, Bengaluru', totalBeds: 40, availableBeds: 12 },
  { id: 'stjohns', name: "St. John's Medical College Hospital", shortName: "St. John's", area: 'Sarjapur Road', node: "St. John's Medical College Hospital", lat: 12.9293, lng: 77.6201, departments: ['Trauma', 'General Emergency', 'Pediatrics', 'ICU'], address: 'Sarjapur Road, Koramangala, Bengaluru', totalBeds: 55, availableBeds: 8 },
  { id: 'victoria', name: 'Victoria Hospital', shortName: 'Victoria', area: 'City Market', node: 'Victoria Hospital', lat: 12.9634, lng: 77.5738, departments: ['General Emergency', 'Trauma', 'Government/No-cost care'], address: 'Fort Road, Bengaluru', totalBeds: 90, availableBeds: 23 },
  { id: 'sakra', name: 'Sakra World Hospital', shortName: 'Sakra', area: 'Devarabeesanahalli, Marathahalli', node: 'Sakra World Hospital', lat: 12.9455, lng: 77.7250, departments: ['Trauma', 'Cardiology', 'Neurology', 'General Emergency'], address: 'Devarabeesanahalli, Marathahalli, Bengaluru', totalBeds: 40, availableBeds: 10 },
  { id: 'astercmi', name: 'Aster CMI Hospital', shortName: 'Aster CMI', area: 'Hebbal, Sahakara Nagar', node: 'Aster CMI Hospital', lat: 13.0200, lng: 77.5850, departments: ['Trauma', 'General Emergency', 'Oncology', 'ICU'], address: 'Sahakara Nagar, Hebbal, Bengaluru', totalBeds: 50, availableBeds: 14 },
  { id: 'fortis', name: 'Fortis Hospital', shortName: 'Fortis', area: 'Cunningham Road', node: 'Fortis Hospital', lat: 12.9845, lng: 77.5930, departments: ['Cardiology', 'General Emergency', 'Orthopedics'], address: 'Cunningham Road, Bengaluru', totalBeds: 45, availableBeds: 9 },
  { id: 'asterwhitefield', name: 'Aster Whitefield', shortName: 'Aster Whitefield', area: 'Whitefield, ITPL side', node: 'Aster Whitefield', lat: 12.9730, lng: 77.7600, departments: ['General Emergency', 'Trauma', 'Pediatrics'], address: 'Whitefield, ITPL Main Road, Bengaluru', totalBeds: 35, availableBeds: 7 },
];

// Real ambulance dispatch bases - drivers are assigned to one of two real
// starting points, giving genuine multi-base dispatch across the city
// rather than every ambulance starting from the same spot.
const AMBULANCE_BASES: Record<string, string> = {
  'Indiranagar Metro (Dispatch)': 'Indiranagar Metro (Dispatch)',
  'Silk Board Junction': 'Silk Board Junction',
};

// Distance threshold for green-corridor proximity checks (in km)
const PROXIMITY_THRESHOLD_KM = 0.5; // 500 meters

// Calculate distance between two GPS coordinates using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Realistic baseline vitals per severity - a critical patient should
// visibly look concerning (tachycardic, hypotensive, low SpO2), not just
// carry a "critical" label with numbers indistinguishable from "stable".
function initialVitals(severity: string) {
  const ranges: Record<string, { hr: [number, number]; sys: [number, number]; dia: [number, number]; spo2: [number, number] }> = {
    critical: { hr: [115, 138], sys: [82, 98],  dia: [52, 64], spo2: [86, 92] },
    serious:  { hr: [95, 112],  sys: [98, 118],  dia: [64, 78], spo2: [92, 96] },
    stable:   { hr: [68, 90],   sys: [108, 128], dia: [70, 84], spo2: [96, 99] },
  };
  const r = ranges[severity] || ranges.serious;
  const rand = ([lo, hi]: [number, number]) => Math.round(lo + Math.random() * (hi - lo));
  return { heartRate: rand(r.hr), bpSystolic: rand(r.sys), bpDiastolic: rand(r.dia), spo2: rand(r.spo2) };
}

// Small random-walk step, clamped to a physiologically plausible band per
// severity - vitals should drift realistically tick to tick, not teleport,
// and a critical patient's band should stay concerning rather than
// wandering into "stable" territory.
function stepVitals(current: { heartRate: number; bpSystolic: number; bpDiastolic: number; spo2: number }, severity: string) {
  const bounds: Record<string, { hr: [number, number]; sys: [number, number]; dia: [number, number]; spo2: [number, number] }> = {
    critical: { hr: [110, 145], sys: [78, 102], dia: [48, 68], spo2: [84, 93] },
    serious:  { hr: [90, 118],  sys: [95, 122],  dia: [60, 82], spo2: [90, 97] },
    stable:   { hr: [62, 95],   sys: [104, 132], dia: [66, 88], spo2: [95, 100] },
  };
  const b = bounds[severity] || bounds.serious;
  const walk = (value: number, [lo, hi]: [number, number], step: number) => {
    const next = value + (Math.random() - 0.5) * step;
    return Math.round(Math.min(hi, Math.max(lo, next)));
  };
  return {
    heartRate: walk(current.heartRate, b.hr, 4),
    bpSystolic: walk(current.bpSystolic, b.sys, 3),
    bpDiastolic: walk(current.bpDiastolic, b.dia, 2),
    spo2: walk(current.spo2, b.spo2, 1.5),
  };
}

// blockedEdges holds keys like "Domlur Flyover|Kodihalli Junction" (both
// orderings checked) - see ROADBLOCK MANAGEMENT below. Passed through to
// dijkstra() so a reported roadblock actually removes that road from
// consideration instead of just being logged and ignored.
function edgeKey(a: string, b: string): string { return [a, b].sort().join('|'); }

// Sanitizes free-text intake fields: non-strings (objects/arrays/numbers)
// fall back to the default instead of being stored (a stored object crashes
// React rendering downstream), strings are trimmed and length-capped so one
// request cannot bloat sessions, SSE payloads, logs, and history.
function cleanText(value: unknown, fallback: string, maxLen: number): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function dijkstra(start: string, end: string, blockedEdges: Set<string> = new Set()): string[] {
  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const unvisited = new Set<string>(Object.keys(CITY_GRAPH));

  Object.keys(CITY_GRAPH).forEach(n => { dist[n] = Infinity; prev[n] = null; });
  dist[start] = 0;

  while (unvisited.size > 0) {
    let u = '';
    let minD = Infinity;
    unvisited.forEach(n => { if (dist[n] < minD) { minD = dist[n]; u = n; } });
    if (!u || u === end) break;
    unvisited.delete(u);

    Object.entries(CITY_GRAPH[u] || {}).forEach(([v, w]) => {
      if (!unvisited.has(v)) return;
      if (blockedEdges.has(edgeKey(u, v))) return; // roadblock - skip this edge entirely
      const alt = dist[u] + w;
      if (alt < dist[v]) { dist[v] = alt; prev[v] = u; }
    });
  }

  const path: string[] = [];
  let curr: string | null = end;
  while (curr) { path.unshift(curr); curr = prev[curr]; }
  return path[0] === start ? path : [];
}

// Sums real edge weights along a path - used to report genuine distance/ETA
// for whichever dispatch base -> hospital pair is actually being routed,
// rather than a single precomputed number.
function pathDistanceKm(nodes: string[]): number {
  let total = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    total += CITY_GRAPH[nodes[i]]?.[nodes[i + 1]] ?? 0;
  }
  return total;
}

// Computes route option(s) from any real dispatch base to any real hospital.
// Always includes the Dijkstra-optimal path. If a genuinely different
// second path exists (found by temporarily blocking the optimal path's
// first edge and re-running Dijkstra), that's offered as a real alternate -
// not a fabricated one.
function computeRouteOptions(fromNode: string, hospital: Hospital, blocked: Set<string> = blockedEdges) {
  const optimalNodes = dijkstra(fromNode, hospital.node, blocked);
  if (optimalNodes.length === 0) return [];

  const optimalKm = pathDistanceKm(optimalNodes);
  // Signals on a route, so the driver can see the corridor shape
  // (node count, signal count, distance) before activating.
  const countRouteSignals = (nodes: string[]) =>
    signals.filter(s => nodes.includes(s.junction)).length;

  const options = [{
    id: 'R1',
    name: `Optimal Route (Dijkstra) to ${hospital.name}`,
    nodes: optimalNodes,
    distance: `${optimalKm.toFixed(1)} km`,
    estimatedTime: Math.max(2, Math.round(optimalKm * 2)),
    signals: countRouteSignals(optimalNodes),
  }];

  if (optimalNodes.length > 1) {
    const forcedBlock = new Set(blocked);
    forcedBlock.add(edgeKey(optimalNodes[0], optimalNodes[1]));
    const altNodes = dijkstra(fromNode, hospital.node, forcedBlock);
    if (altNodes.length > 0 && altNodes.join('|') !== optimalNodes.join('|')) {
      const altKm = pathDistanceKm(altNodes);
      options.push({
        id: 'R2',
        name: `Alternate Route to ${hospital.name}`,
        nodes: altNodes,
        distance: `${altKm.toFixed(1)} km`,
        estimatedTime: Math.max(2, Math.round(altKm * 2)),
        signals: countRouteSignals(altNodes),
      });
    }
  }
  return options;
}

// ═══════════════════════════════════════════════════════════════
//  GLOBAL STATE
// ═══════════════════════════════════════════════════════════════
// Session ID (UUID) → session. Keyed by session.id, NOT by ambulance
// rid, so consecutive emergencies from the same ambulance coexist and
// completed history survives. Use resolveSession() for all lookups: it
// accepts either a session id or an ambulance rid (resolving rid to the
// active session when several sessions share it).
const sessions = new Map<string, AmbulanceSession>();
const logs: LogEntry[] = [];
let sseClients: SSEClient[] = [];

interface SignalWithCoords extends Signal {
  lat: number;
  lng: number;
}

const signals: SignalWithCoords[] = [
  { id: 'S1', name: 'Signal — 100 Feet Road Jn', junction: '100 Feet Road Junction', color: 'RED', timer: 30, manualOverride: false, lat: 12.9719, lng: 77.6412 },
  { id: 'S2', name: 'Signal — Domlur Flyover',   junction: 'Domlur Flyover',         color: 'GREEN', timer: 18, manualOverride: false, lat: 12.9604, lng: 77.6417 },
  { id: 'S3', name: 'Signal — Kodihalli Jn',     junction: 'Kodihalli Junction',     color: 'RED', timer: 35, manualOverride: false, lat: 12.9601, lng: 77.6472 },
  { id: 'S4', name: 'Signal — Marathahalli',     junction: 'Marathahalli (ORR)',     color: 'YELLOW', timer: 5, manualOverride: false, lat: 12.9562, lng: 77.7019 },
  { id: 'S5', name: 'Signal — Halasuru (Ulsoor)', junction: 'Halasuru (Ulsoor)',     color: 'RED', timer: 22, manualOverride: false, lat: 12.9757, lng: 77.6263 },
  { id: 'S6', name: 'Signal — Trinity Circle',   junction: 'Trinity Circle',         color: 'RED', timer: 40, manualOverride: false, lat: 12.9730, lng: 77.6170 },
  { id: 'S7', name: 'Signal — Adugodi',          junction: 'Adugodi',                color: 'GREEN', timer: 15, manualOverride: false, lat: 12.9435, lng: 77.6091 },
  // Expansion signals for the new hospital-route junctions. Every signal's
  // `junction` is a real CITY_GRAPH node - no phantom entries.
  { id: 'S8', name: 'Signal — Devarabeesanahalli', junction: 'Devarabeesanahalli',   color: 'RED', timer: 28, manualOverride: false, lat: 12.9490, lng: 77.7170 },
  { id: 'S9', name: 'Signal — Whitefield / ITPL', junction: 'Whitefield / ITPL Approach', color: 'RED', timer: 32, manualOverride: false, lat: 12.9690, lng: 77.7500 },
  { id: 'S10', name: 'Signal — Cunningham Road', junction: 'Cunningham Road',        color: 'RED', timer: 26, manualOverride: false, lat: 12.9830, lng: 77.5950 },
  { id: 'S11', name: 'Signal — Hebbal',          junction: 'Hebbal',                 color: 'GREEN', timer: 20, manualOverride: false, lat: 13.0350, lng: 77.5970 },
];

// Signal command log (sent to the signal control engine)
const signalCommandLog: { signal: string; color: string; ts: string; ack: boolean }[] = [];

// System metrics
let systemLoad = 12;
let apiLatency = 48;
let totalCompleted = 0;

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════
function addLog(message: string, type: LogType = 'info', rid?: string) {
  const entry: LogEntry = { id: uuidv4(), timestamp: new Date().toISOString(), message, type, sessionRID: rid };
  logs.unshift(entry);
  if (logs.length > 100) logs.pop();
  broadcastSSE({ type: 'log', data: entry });
}

// Send signal command to the signal control engine via HTTP
function sendSignalCommand(signalName: string, color: string) {
  const entry = { signal: signalName, color, ts: new Date().toISOString(), ack: false };
  signalCommandLog.unshift(entry);
  if (signalCommandLog.length > 50) signalCommandLog.pop();

  // Attempt real HTTP call to the signal control engine
  const postData = JSON.stringify({ signal: signalName, color });
  const req = http.request(`${SIGNAL_ENGINE_URL}/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
  }, res => {
    entry.ack = res.statusCode === 200;
  });
  req.on('error', () => { /* signal engine offline — log only */ });
  req.write(postData);
  req.end();
}

// SSE broadcast
function broadcastSSE(payload: object) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  sseClients = sseClients.filter(c => {
    try { c.res.write(data); return true; }
    catch { return false; }
  });
}

// Verify JWT middleware
function verify(req: express.Request, res: express.Response, next: express.NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    // Pinned to HS256 - the only algorithm this server mints. Without this,
    // verification trusts whatever `alg` the token header requests (a
    // correctly-signed HS384 token was accepted before this pin).
    const payload = jwt.verify(auth.slice(7), JWT_SECRET, { algorithms: ['HS256'] }) as { sub: string; role: UserRole };
    (req as any).user = payload;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

// Resolve a session by internal id (UUID) or ambulance rid. Direct id
// lookup first; otherwise fall back to the active session carrying that
// rid (active ops such as stop/toggle/ack always mean the live one).
// Returns undefined when nothing matches.
function resolveSession(key: string): AmbulanceSession | undefined {
  if (!key) return undefined;
  const direct = sessions.get(key);
  if (direct) return direct;
  const active = [...sessions.values()].find(s => s.rid === key && s.status === 'active');
  if (active) return active;
  const any = [...sessions.values()].find(s => s.rid === key);
  return any;
}

// ═══════════════════════════════════════════════════════════════
//  SOFTWARE EMERGENCY STATE
//  No camera/siren/hardware verification exists. An emergency session is
//  authorized at creation time by JWT + RBAC (driver/admin only). While
//  'active', the session drives routing, green-corridor signals, and SSE.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  ROADBLOCK MANAGEMENT + DYNAMIC RECALCULATION (Section 9 of spec)
//  Police/Admin can mark a road segment blocked. Any active ambulance
//  currently routed across that segment gets a fresh Dijkstra path
//  computed from its CURRENT position to ITS OWN chosen hospital,
//  avoiding it. Different ambulances can be headed to different real
//  hospitals, so this must use each session's own destination.
// ═══════════════════════════════════════════════════════════════
const blockedEdges = new Set<string>(); // "NodeA|NodeB" sorted keys

function recalculateAffectedRoutes(blockedFrom: string, blockedTo: string) {
  const key = edgeKey(blockedFrom, blockedTo);
  let anyRecalculated = false;

  sessions.forEach(session => {
    if (session.status !== 'active') return;

    // Does this session's remaining path actually cross the blocked edge?
    const remaining = session.route.slice(session.currentNodeIndex);
    const crossesBlockedEdge = remaining.some((node, i) =>
      i < remaining.length - 1 && edgeKey(node, remaining[i + 1]) === key
    );
    if (!crossesBlockedEdge) return;

    const currentNode = session.route[session.currentNodeIndex];
    const newPath = dijkstra(currentNode, session.hospital.node, blockedEdges);

    if (newPath.length === 0) {
      addLog(`🚧 ROADBLOCK on ${blockedFrom} ↔ ${blockedTo}: NO alternative route found for ${session.rid} — ambulance may need to wait or reverse`, 'error', session.rid);
      return;
    }

    session.route = newPath;
    session.routeName = `Recalculated Route (roadblock: ${blockedFrom} ↔ ${blockedTo})`;
    session.currentNodeIndex = 0;
    session.ticksSinceAdvance = 0;
    session.currentGPS = GPS_COORDS[currentNode] || session.currentGPS;
    anyRecalculated = true;

    addLog(`🚧 ROADBLOCK reported: ${blockedFrom} ↔ ${blockedTo} — recalculating route for ${session.rid}`, 'warning', session.rid);
    addLog(`🗺️ New route for ${session.rid}: ${newPath.join(' → ')}`, 'success', session.rid);
  });

  if (anyRecalculated) {
    updateGreenCorridor();
    broadcastSSE({ type: 'state', data: buildStatePayload() });
  }
}

// ═══════════════════════════════════════════════════════════════
//  GREEN CORRIDOR ENGINE (Distance-Based Proximity)
//  Determines which signals should be GREEN based on the ambulance's
//  simulated position and distance threshold. Signals within proximity → GREEN.
// ═══════════════════════════════════════════════════════════════
// Multi-ambulance conflict resolution (Section 23 of the original spec:
// "Multiple ambulance conflict management" - previously the corridor
// logic silently gave the signal to whichever ambulance was closest,
// with no awareness that a farther-but-more-critical patient
// should take priority. Real EMS dispatch prioritizes by acuity, not
// just proximity.
const SEVERITY_RANK: Record<string, number> = { critical: 3, serious: 2, stable: 1 };

// Clear corridor-claim state (contested/contenderCount) on every signal.
// Called on each corridor exit path - the no-active early return below,
// the tick idle branch, emergency stop, admin delete and system reset - so
// a contested flag set while two ambulances competed can never stick
// around after the emergency ends. Color/timer handling stays with each
// caller; this resets only arbitration state. Never touches manualOverride.
function clearCorridor() {
  signals.forEach(sig => {
    sig.contested = false;
    sig.contenderCount = 0;
  });
}

function updateGreenCorridor() {
  const activeSessions = [...sessions.values()].filter(s => s.status === 'active');

  if (activeSessions.length === 0) {
    // No active sessions — all signals back to RED
    signals.forEach(sig => {
      if (!sig.manualOverride && sig.color !== 'RED') {
        sig.color = 'RED';
        sig.timer = 30;
        addLog(`🔴 CORRIDOR CLOSED: ${sig.name} (${sig.junction}) - No active emergencies`, 'info');
        sendSignalCommand(sig.name, 'RED');
      }
    });
    clearCorridor();
    return;
  }

  // Route-aware corridor: a signal is a corridor candidate ONLY when its
  // junction belongs to at least one active session's computed route
  // (signal.junction ∈ activeRoute.nodes). Unrelated signals stay out of
  // the corridor entirely - they are never turned green by an emergency
  // they have nothing to do with.
  const corridorJunctions = new Set<string>();
  activeSessions.forEach(s => s.route.forEach(node => corridorJunctions.add(node)));

  // For each route-member signal, find every ambulance within range - not
  // just the single nearest - so a genuine conflict (multiple ambulances
  // close to the same signal at once) is identified and resolved by severity.
  const signalCandidates = new Map<string, { distance: number; rid: string; severity: string }[]>();

  activeSessions.forEach(session => {
    const [ambLat, ambLng] = session.currentGPS;

    signals.forEach(sig => {
      if (!corridorJunctions.has(sig.junction)) return;
      const distance = calculateDistance(ambLat, ambLng, sig.lat, sig.lng);
      if (distance > PROXIMITY_THRESHOLD_KM) return;

      const list = signalCandidates.get(sig.id) || [];
      list.push({ distance, rid: session.rid, severity: session.patient.severity });
      signalCandidates.set(sig.id, list);
    });
  });

  // Resolve each signal's winner: higher patient severity wins outright;
  // ties broken by proximity (closer wins). This is the actual priority
  // arbitration - not just "whoever got there first."
  const signalProximity = new Map<string, { distance: number; rid: string }>();

  signalCandidates.forEach((candidates, sigId) => {
    candidates.sort((a, b) => {
      const rankDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (rankDiff !== 0) return rankDiff;
      return a.distance - b.distance;
    });
    const winner = candidates[0];
    signalProximity.set(sigId, { distance: winner.distance, rid: winner.rid });

    const sig = signals.find(s => s.id === sigId);
    if (sig) {
      sig.contested = candidates.length > 1;
      sig.contenderCount = candidates.length;
    }

    // Log the conflict explicitly when there genuinely was one - this is
    // the part that makes the arbitration demonstrable, not just silent.
    if (candidates.length > 1) {
      const runnerUp = candidates[1];
      if (winner.severity !== runnerUp.severity) {
        addLog(
          `⚠️ SIGNAL CONFLICT at ${sig?.name ?? sigId}: ${winner.rid} (${winner.severity}, ${Math.round(winner.distance * 1000)}m) prioritized over ${runnerUp.rid} (${runnerUp.severity}, ${Math.round(runnerUp.distance * 1000)}m) — higher acuity wins`,
          'warning'
        );
      } else {
        addLog(
          `⚠️ SIGNAL CONFLICT at ${sig?.name ?? sigId}: ${winner.rid} and ${runnerUp.rid} both ${winner.severity} — ${winner.rid} wins on proximity (${Math.round(winner.distance * 1000)}m vs ${Math.round(runnerUp.distance * 1000)}m)`,
          'warning'
        );
      }
    }
  });

  // Clear the contested flag on any signal that no longer has multiple
  // candidates (otherwise it would stick from a previous tick forever)
  signals.forEach(sig => {
    if (!signalCandidates.has(sig.id) || (signalCandidates.get(sig.id)?.length ?? 0) <= 1) {
      sig.contested = false;
      sig.contenderCount = signalCandidates.get(sig.id)?.length ?? 0;
    }
  });

  // Apply proximity-based signal control
  signals.forEach(sig => {
    if (sig.manualOverride) return;
    
    const proximity = signalProximity.get(sig.id);
    const isNearby = proximity && proximity.distance <= PROXIMITY_THRESHOLD_KM;
    const targetColor: SignalColor = isNearby ? 'GREEN' : 'RED';
    
    if (sig.color !== targetColor) {
      const prevColor = sig.color;
      sig.color = targetColor;
      sig.timer = targetColor === 'GREEN' ? 60 : 30;
      
      if (targetColor === 'GREEN' && proximity) {
        const distanceMeters = Math.round(proximity.distance * 1000);
        addLog(
          `🟢 CORRIDOR OPEN: ${sig.name} (${sig.junction}) - ${proximity.rid} approaching (${distanceMeters}m away)`,
          'success',
          proximity.rid
        );
        sendSignalCommand(sig.name, 'GREEN');
      } else if (targetColor === 'RED' && prevColor === 'GREEN') {
        addLog(`🔴 CORRIDOR CLOSED: ${sig.name} (${sig.junction}) - Ambulance passed`, 'info');
        sendSignalCommand(sig.name, 'RED');
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  SIMULATION TICK (runs every 1 second)
// ═══════════════════════════════════════════════════════════════
setInterval(() => {
  // Update signal timers
  signals.forEach(sig => {
    sig.timer = Math.max(0, sig.timer - 1);
    if (!sig.manualOverride && sig.timer === 0) {
      // Natural cycle when no emergency
      const hasActiveSessions = [...sessions.values()].some(s => s.status === 'active');
      if (!hasActiveSessions) {
        const cycle: SignalColor[] = sig.color === 'RED' ? ['GREEN'] : sig.color === 'GREEN' ? ['YELLOW'] : ['RED'];
        sig.color = cycle[0];
        sig.timer = sig.color === 'GREEN' ? 30 : sig.color === 'YELLOW' ? 5 : 35;
      } else {
        sig.timer = 30; // hold during emergency
      }
    }
  });

  // Update each active session
  sessions.forEach(session => {
    if (session.status !== 'active') return;

    session.vitals = stepVitals(session.vitals, session.patient.severity);
    // Simulated vehicle telemetry random-walk (backend-owned, SSE-synced
    // to every dashboard so all roles see identical numbers).
    session.fuelLevel = Math.max(15, session.fuelLevel - 0.025);
    session.engineTemp = Math.min(105, Math.max(80, session.engineTemp + (Math.random() * 0.3 - 0.1)));

    // Advance ambulance along route
    session.ticksSinceAdvance++;
    
    // Smooth position interpolation between nodes (software simulation)
    const currentNode = session.route[session.currentNodeIndex];
    const nextNode = session.route[session.currentNodeIndex + 1];
    if (nextNode) {
      // Defensive: fall back to last known position if a route ever
      // references a node with no coordinates (same pattern as the
      // roadblock-recalculation and node-arrival paths below) instead of
      // throwing inside the interval and crashing the process.
      const startGPS = GPS_COORDS[currentNode] || session.currentGPS;
      const endGPS = GPS_COORDS[nextNode] || session.currentGPS;
      const progress = Math.min(session.ticksSinceAdvance / 5, 1);
      session.currentGPS = [
        startGPS[0] + (endGPS[0] - startGPS[0]) * progress,
        startGPS[1] + (endGPS[1] - startGPS[1]) * progress,
      ];
    }
    
    if (session.ticksSinceAdvance >= 5 && session.currentNodeIndex < session.route.length - 1) {
      session.currentNodeIndex++;
      session.ticksSinceAdvance = 0;
      const newNode = session.route[session.currentNodeIndex];
      session.currentGPS = GPS_COORDS[newNode] || session.currentGPS;
      addLog(`📍 ${session.rid} reached: ${newNode}`, 'info', session.rid);

      // Approaching hospital - one node away from the destination
      if (session.currentNodeIndex === session.route.length - 2) {
        addLog(`🏥 ${session.rid} approaching ${session.hospital.name} — inbound team standby`, 'warning', session.rid);
      }

      // Arrived at hospital
      if (session.currentNodeIndex === session.route.length - 1) {
        session.status = 'arrived';
        session.endedAt = new Date().toISOString();
        totalCompleted++;
        addLog(`✅ ${session.rid} ARRIVED at ${session.hospital.name} — session complete`, 'success', session.rid);
        addLog(`🔓 Green corridor released for ${session.rid}`, 'system', session.rid);
      }
    }
  });

  // Update green corridor for all active sessions
  const hasActive = [...sessions.values()].some(s => s.status === 'active');
  if (hasActive) {
    updateGreenCorridor();
  } else {
    // No active sessions — all signals back to RED
    signals.forEach(sig => {
      if (!sig.manualOverride && sig.color === 'GREEN') {
        sig.color = 'RED';
        sig.timer = 30;
        sendSignalCommand(sig.name, 'RED');
      }
    });
    clearCorridor();
  }

  // Update system metrics
  systemLoad = hasActive ? 55 + Math.floor(Math.random() * 30) : 8 + Math.floor(Math.random() * 18);
  apiLatency = 35 + Math.floor(Math.random() * 25);

  // SSE push full state update
  broadcastSSE({ type: 'state', data: buildStatePayload() });
}, 1000);

// ═══════════════════════════════════════════════════════════════
//  STATE SERIALIZER
// ═══════════════════════════════════════════════════════════════
function buildStatePayload() {
  return {
    sessions: [...sessions.values()],
    signals,
    hospitals: HOSPITALS,
    systemLoad,
    apiLatency,
    totalCompleted,
    signalCommandLog: signalCommandLog.slice(0, 20),
  };
}

// ═══════════════════════════════════════════════════════════════
//  EXPRESS APP
// ═══════════════════════════════════════════════════════════════
const app = express();
// Fingerprinting: Express advertises itself via X-Powered-By by default.
app.disable('x-powered-by');
// Minimal security headers (no new dependency). Verified safe for the
// frontend (fetch/EventSource) and SSE streams - none of these alter
// response bodies, CORS behavior, or streaming.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(cors({ origin: FRONTEND_ORIGIN }));
// Request bodies in this API are small JSON documents (auth, intake,
// roadblocks, overrides). 1mb is generous headroom and bounds memory
// exhaustion from oversized payloads; oversized requests get a 413.
app.use(express.json({ limit: '1mb' }));

// ── AUTH ──────────────────────────────────────────────────────
// Lightweight in-memory rate limit: 10 attempts per 15 min per IP.
// Keyed by req.ip (socket address). Express does not trust
// X-Forwarded-For unless trust-proxy is enabled (it is not here), so
// clients cannot spoof their way around this limiter with forged headers.
// Single-instance memory: restarts/multi-instance deployments reset it -
// acceptable for this project; swap for a shared store if scaled further.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function loginRetryAfterSec(ip: string): number {
  const entry = loginAttempts.get(ip);
  if (!entry) return 0;
  return Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
}
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  // Hygiene: drop expired entries when the map grows, so abandoned IPs
  // cannot accumulate unboundedly over a long-lived process.
  if (loginAttempts.size > 500) {
    loginAttempts.forEach((e, k) => { if (now > e.resetAt) loginAttempts.delete(k); });
  }
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > LOGIN_MAX_ATTEMPTS;
}

app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (isRateLimited(ip)) {
    res.setHeader('Retry-After', String(loginRetryAfterSec(ip)));
    res.status(429).json({ error: 'Too many login attempts - try again in a few minutes' });
    return;
  }

  const { username, password } = req.body ?? {};
  // Strict credential shape: non-string usernames threw inside
  // .toLowerCase()/bcrypt (HTTP 500 + stack-trace page), and prototype
  // keys such as 'constructor' resolve on a plain object. Reject all of
  // these exactly like wrong credentials - no behavior change for valid
  // logins, no information about which field was wrong.
  const credentialsValid =
    typeof username === 'string' &&
    typeof password === 'string' &&
    username.length > 0 && username.length <= 64 &&
    password.length > 0 && password.length <= 256 &&
    Object.prototype.hasOwnProperty.call(USERS, username.toLowerCase());
  const user = credentialsValid ? USERS[username.toLowerCase()] : undefined;
  if (!user || !bcrypt.compareSync(password, user.hash)) {
    addLog(`❌ Failed login attempt: ${typeof username === 'string' ? username.slice(0, 64) : '(invalid shape)'}`, 'warning');
    res.status(401).json({ error: 'Invalid credentials' }); return;
  }
  // Credentials verified - this login was legitimate, so it must not count
  // toward the failed-attempt limit. Clear the counter only here, after
  // genuine success; failures above keep accumulating toward the 429.
  loginAttempts.delete(ip);
  // hospitalId travels in the token + login payload so hospital dashboards
  // can scope actions (acknowledge/prep) to their OWN hospital client-side.
  // Server-side RBAC still enforces this independently - the client copy is
  // only for disabling actions that would 403, never for authorization.
  const token = jwt.sign({ sub: user.id, username, role: user.role, name: user.name, hospitalId: user.hospitalId }, JWT_SECRET, { expiresIn: '8h' });
  addLog(`🔐 ${user.name} logged in as ${user.role}`, 'system');
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, username, hospitalId: user.hospitalId } });
});

app.post('/api/auth/logout', verify, (req: any, res) => {
  addLog(`🚪 ${req.user.name || req.user.role} logged out`, 'system');
  res.json({ success: true });
});

app.get('/api/auth/me', verify, (req: any, res) => {
  res.json(req.user);
});

// ── HOSPITALS (Section 6 of the spec: real hospital selection) ─
app.get('/api/hospitals', verify, (req: any, res) => {
  const userRecord = USERS[(req.user.username || '').toLowerCase()];
  const fromNode = userRecord?.dispatchNode || 'Indiranagar Metro (Dispatch)';

  const hospitalsWithDistance = HOSPITALS.map(h => {
    const nodes = dijkstra(fromNode, h.node, blockedEdges);
    const km = nodes.length > 0 ? pathDistanceKm(nodes) : null;
    return {
      ...h,
      distanceKm: km !== null ? Math.round(km * 10) / 10 : null,
      estimatedMinutes: km !== null ? Math.max(2, Math.round(km * 2)) : null,
      reachable: nodes.length > 0,
    };
  }).sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

  res.json(hospitalsWithDistance);
});

// PATCH bed capacity - hospital/admin only. There's currently one generic
// hospital account rather than per-hospital accounts, so any hospital
// staff login can update any hospital's count (a reasonable simplification
// given the current auth model - see USERS in this file if you want to
// split this into per-hospital logins later).
app.patch('/api/hospitals/:id/capacity', verify, (req: any, res) => {
  if (req.user.role !== 'hospital' && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Hospital staff only' }); return;
  }

  // A hospital-role login can only update THEIR OWN hospital's capacity,
  // not any hospital in the network - was previously unrestricted (any
  // hospital login could edit any hospital), which doesn't match how
  // real per-hospital staff accounts should behave. Admin is exempt.
  const userRecord = USERS[(req.user.username || '').toLowerCase()];
  if (req.user.role === 'hospital' && userRecord?.hospitalId !== req.params.id) {
    res.status(403).json({ error: 'You can only update your own hospital\'s bed capacity' });
    return;
  }

  const hospital = HOSPITALS.find(h => h.id === req.params.id);
  if (!hospital) { res.status(404).json({ error: 'Hospital not found' }); return; }

  const { availableBeds } = req.body ?? {};
  // Beds are whole units: reject NaN/Infinity/floats (NaN passed the old
  // range check and was stored, serializing as null downstream).
  if (!Number.isInteger(availableBeds) || availableBeds < 0 || availableBeds > hospital.totalBeds) {
    res.status(400).json({ error: `availableBeds must be an integer between 0 and ${hospital.totalBeds}` });
    return;
  }

  hospital.availableBeds = availableBeds;
  addLog(`🛏️ ${hospital.name} updated bed availability: ${availableBeds}/${hospital.totalBeds} (${req.user.name})`, 'info');

  res.json({ success: true, hospital });
});

// ── ROUTES (Dijkstra) ─────────────────────────────────────────
// Now computed dynamically for THIS driver's dispatch base -> the
// requested hospital, instead of a single hardcoded precomputed route.
app.get('/api/routes', verify, (req: any, res) => {
  const userRecord = USERS[(req.user.username || '').toLowerCase()];
  const fromNode = userRecord?.dispatchNode || 'Indiranagar Metro (Dispatch)';

  // hospitalId is required - never silently fall back to another hospital.
  const hospitalId = req.query.hospitalId as string | undefined;
  const hospital = hospitalId ? HOSPITALS.find(h => h.id === hospitalId) : undefined;
  if (!hospital) { res.status(400).json({ error: 'Valid hospitalId is required' }); return; }

  res.json(computeRouteOptions(fromNode, hospital));
});

// ── EMERGENCY MANAGEMENT ──────────────────────────────────────
app.post('/api/emergency/start', verify, (req: any, res) => {
  const { hospitalId, routeId, patient } = req.body;

  // Only drivers (and admin) may create ambulance emergencies - police and
  // hospital roles have no dispatch capability in the role model.
  if (req.user.role !== 'driver' && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Driver or Admin only' }); return;
  }

  // Check if this driver already has an active session
  const existingSession = [...sessions.values()].find(
    s => s.driverId === req.user.sub && s.status === 'active'
  );
  if (existingSession) {
    res.status(400).json({ error: 'You already have an active emergency session', id: existingSession.id, rid: existingSession.rid });
    return;
  }

  const userRecord = USERS[(req.user.username || '').toLowerCase()];
  const fromNode = userRecord?.dispatchNode || 'Indiranagar Metro (Dispatch)';

  // hospitalId is required - never silently dispatch to another hospital.
  // This runs before any session is created, so a 400 here creates nothing.
  const hospital = HOSPITALS.find(h => h.id === hospitalId);
  if (!hospital) { res.status(400).json({ error: 'Valid hospitalId is required' }); return; }
  const routeOptions = computeRouteOptions(fromNode, hospital, blockedEdges);
  if (routeOptions.length === 0) {
    res.status(422).json({ error: `No available route from ${fromNode} to ${hospital.name} - all roads blocked` });
    return;
  }
  const route = routeOptions.find(r => r.id === routeId) || routeOptions[0];

  // Use this driver's assigned ambulance RID if they have one (see USERS),
  // otherwise fall back to a random one - keeps each driver account mapped
  // to a consistent, recognizable ambulance across the Police/Admin fleet views.
  // The Map key is a fresh UUID per session (id) so a second emergency from
  // the same ambulance adds a new entry instead of overwriting history;
  // rid stays the stable ambulance display identity.
  const rid = userRecord?.ambulanceRid || `AMB-${uuidv4().slice(0, 6).toUpperCase()}`;
  const id = uuidv4();

  // Default prep checklist - hospital can check these off as they're done;
  // this is what used to be hardcoded static data in Hospital.tsx.
  const defaultPrepTasks = [
    { id: 'trolley',   label: 'Resuscitation trolley prepared', done: false },
    { id: 'team',      label: 'Emergency team notified',        done: false },
    { id: 'bed',       label: 'Bed / bay assigned',              done: false },
    { id: 'bloodbank', label: 'Blood bank alerted (if needed)',  done: false },
    { id: 'specialist',label: 'On-call specialist paged',        done: false },
  ];

  const validatedSeverity: 'critical' | 'serious' | 'stable' =
    ['critical', 'serious', 'stable'].includes(patient?.severity) ? patient.severity : 'serious';

  const session: AmbulanceSession = {
    id, rid, driverId: req.user.sub,
    route: route.nodes, routeName: route.name,
    currentNodeIndex: 0,
    currentGPS: GPS_COORDS[route.nodes[0]] || [12.9786, 77.6388],
    startedAt: new Date().toISOString(),
    ticksSinceAdvance: 0,
    status: 'active',
    endedAt: null,
    patient: {
      condition: cleanText(patient?.condition, 'Not specified', 200),
      severity: validatedSeverity,
      requiredDepartment: cleanText(patient?.requiredDepartment, 'General Emergency', 100),
      notes: cleanText(patient?.notes, '', 1000),
    },
    vitals: initialVitals(validatedSeverity),
    fuelLevel: 85,
    engineTemp: 92,
    hospital: { id: hospital.id, name: hospital.name, node: hospital.node },
    hospitalAcknowledged: false,
    hospitalAcknowledgedAt: null,
    prepTasks: defaultPrepTasks,
  };

  sessions.set(id, session);
  addLog(`🚨 EMERGENCY ACTIVATED — RID: ${rid} (Driver: ${req.user.name}) from ${fromNode}`, 'error', rid);
  addLog(`🏥 Destination: ${hospital.name} (${hospital.address})`, 'info', rid);
  addLog(`📍 Route computed via Dijkstra: ${route.nodes.join(' → ')} (${route.distance})`, 'info', rid);
  addLog(`✅ Emergency authorized — activated by ${req.user.name} (${req.user.role})`, 'success', rid);
  addLog(`🏥 Patient: ${session.patient.severity.toUpperCase()} — ${session.patient.condition} (needs ${session.patient.requiredDepartment})`, 'info', rid);

  // Immediately send corridor state to the signal control engine
  updateGreenCorridor();

  res.status(201).json({ id, rid, route: route.nodes, routeName: route.name, hospital: session.hospital, patient: session.patient });
});

app.post('/api/emergency/stop', verify, (req: any, res) => {
  const { rid } = req.body;
  const session = resolveSession(rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  // Only the owning driver or an admin may stop a session - a driver must
  // not cancel another driver's emergency, and police/hospital roles have
  // no stop capability.
  if (req.user.role !== 'admin' && session.driverId !== req.user.sub) {
    res.status(403).json({ error: 'You can only stop your own emergency session' }); return;
  }

  // Terminal-state guard: an arrived session is complete and must never be
  // reclassified as cancelled (that would corrupt status, endedAt, duration
  // and history). Only active sessions can be stopped.
  if (session.status === 'arrived') {
    res.status(400).json({ error: 'Session has already arrived and cannot be stopped' }); return;
  }

  session.status = 'cancelled';
  session.endedAt = new Date().toISOString();
  addLog(`🛑 Emergency ${session.rid} manually cancelled by ${req.user.name}`, 'warning', session.rid);

  // Release corridor
  signals.forEach(sig => {
    if (!sig.manualOverride) { sig.color = 'RED'; sig.timer = 30; sendSignalCommand(sig.name, 'RED'); }
  });
  // Drop any contested claim from this session before recomputing for
  // remaining ambulances (recompute repopulates when still contested).
  clearCorridor();
  updateGreenCorridor();

  res.json({ success: true });
});

// ── HOSPITAL ACKNOWLEDGMENT + PREP TRACKING (Section 16) ──────
// Replaces the previously-hardcoded static checklist in Hospital.tsx with
// real backend state that syncs to every dashboard over SSE.
app.post('/api/emergency/:rid/acknowledge', verify, (req: any, res) => {
  if (req.user.role !== 'hospital' && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Hospital staff only' }); return;
  }
  const session = resolveSession(req.params.rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  // Terminal-state guard (mirrors the stop guard): acknowledging a
  // completed/cancelled session would rewrite a closed record.
  if (session.status !== 'active') {
    res.status(400).json({ error: 'Only an active emergency can be acknowledged' }); return;
  }

  // A hospital login can only acknowledge patients actually headed to
  // THEIR hospital, not any ambulance in the network.
  const userRecord = USERS[(req.user.username || '').toLowerCase()];
  if (req.user.role === 'hospital' && userRecord?.hospitalId !== session.hospital.id) {
    res.status(403).json({ error: 'This ambulance is not headed to your hospital' });
    return;
  }

  session.hospitalAcknowledged = true;
  session.hospitalAcknowledgedAt = new Date().toISOString();
  addLog(`🏥 Hospital acknowledged incoming ${session.rid} (${req.user.name})`, 'success', session.rid);

  res.json({ success: true, hospitalAcknowledged: true, hospitalAcknowledgedAt: session.hospitalAcknowledgedAt });
});

app.post('/api/emergency/:rid/prep', verify, (req: any, res) => {
  if (req.user.role !== 'hospital' && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Hospital staff only' }); return;
  }
  const session = resolveSession(req.params.rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  // Terminal-state guard (mirrors the stop guard): prep on a closed
  // session would rewrite a closed record.
  if (session.status !== 'active') {
    res.status(400).json({ error: 'Only an active emergency can be updated' }); return;
  }

  const userRecord = USERS[(req.user.username || '').toLowerCase()];
  if (req.user.role === 'hospital' && userRecord?.hospitalId !== session.hospital.id) {
    res.status(403).json({ error: 'This ambulance is not headed to your hospital' });
    return;
  }

  const { taskId, done } = req.body ?? {};
  const task = session.prepTasks.find(t => t.id === taskId);
  if (!task) { res.status(404).json({ error: 'Unknown prep task' }); return; }

  task.done = !!done;
  const allDone = session.prepTasks.every(t => t.done);
  addLog(`🏥 ${session.rid} prep: "${task.label}" ${task.done ? 'completed' : 'unchecked'}${allDone ? ' — all prep tasks complete' : ''}`, allDone ? 'success' : 'info', session.rid);

  res.json({ success: true, prepTasks: session.prepTasks });
});
app.post('/api/signal/override', verify, (req: any, res) => {
  if (!['police', 'admin'].includes(req.user.role)) {
    res.status(403).json({ error: 'Police or Admin only' }); return;
  }
  const { signalId, color } = req.body;
  const sig = signals.find(s => s.id === signalId);
  if (!sig) { res.status(404).json({ error: 'Signal not found' }); return; }

  // Strict validation before any state mutation - an invalid color must
  // neither change the signal nor reach the signal control engine.
  if (color !== 'RED' && color !== 'YELLOW' && color !== 'GREEN') {
    res.status(400).json({ error: 'color must be RED, YELLOW or GREEN' }); return;
  }

  sig.color = color as SignalColor;
  sig.manualOverride = true;
  sig.timer = color === 'GREEN' ? 60 : color === 'YELLOW' ? 10 : 45;
  addLog(`⚠️ Manual Override: ${sig.name} → ${color} by ${req.user.name}`, 'warning');
  sendSignalCommand(sig.name, color);
  setTimeout(() => { sig.manualOverride = false; }, 30000);

  res.json({ success: true, signal: sig });
});

// ── ROADBLOCK REPORTING (Police/Admin) ────────────────────────
// GET current blocked edges - any authenticated role can view (map display)
app.get('/api/roadblock', verify, (_req, res) => {
  res.json({ blocked: [...blockedEdges].map(k => k.split('|')) });
});

// POST report a roadblock between two adjacent junctions.
// Triggers immediate Dijkstra recalculation for any active ambulance
// currently routed across that segment (Section 9 of the spec).
app.post('/api/roadblock', verify, (req: any, res) => {
  if (!['police', 'admin'].includes(req.user.role)) {
    res.status(403).json({ error: 'Police or Admin only' }); return;
  }
  const { from, to } = req.body;
  if (!from || !to || !CITY_GRAPH[from] || !(to in (CITY_GRAPH[from] || {}))) {
    res.status(400).json({ error: 'from/to must be a valid, adjacent pair of junctions' });
    return;
  }

  const key = edgeKey(from, to);
  if (blockedEdges.has(key)) {
    res.status(409).json({ error: 'That segment is already reported as blocked' });
    return;
  }
  blockedEdges.add(key);
  addLog(`🚧 Roadblock reported between ${from} and ${to} by ${req.user.name}`, 'warning');

  recalculateAffectedRoutes(from, to);

  res.json({ success: true, blocked: [...blockedEdges].map(k => k.split('|')) });
});

// DELETE clear a previously reported roadblock (road reopened)
app.delete('/api/roadblock', verify, (req: any, res) => {
  if (!['police', 'admin'].includes(req.user.role)) {
    res.status(403).json({ error: 'Police or Admin only' }); return;
  }
  const { from, to } = req.body;
  const key = edgeKey(from, to);
  if (!blockedEdges.has(key)) {
    res.status(404).json({ error: 'That segment is not currently blocked' });
    return;
  }
  blockedEdges.delete(key);
  addLog(`✅ Road reopened: ${from} ↔ ${to} by ${req.user.name}`, 'success');
  // Note: we don't auto-revert active ambulances back to their original
  // route once a road reopens - they stay on the (still valid) recalculated
  // route rather than jumping mid-journey. New sessions will use the
  // now-unblocked graph automatically.
  res.json({ success: true, blocked: [...blockedEdges].map(k => k.split('|')) });
});

// ── SOFTWARE-ONLY NOTE ──────────────────────────────────────────
// Camera/siren/YOLO/FFT detection endpoints were removed as part of the
// software-only architecture conversion. Emergency activation is
// authorized by JWT + RBAC in POST /api/emergency/start - no detection
// prerequisite exists.



// ── INCIDENT HISTORY (completed/cancelled emergency sessions) ─
// Real post-incident reporting - every session already lives in the
// `sessions` map after it ends (only /api/system/reset clears it), this
// just surfaces the non-active ones with the response-time metrics a
// real EMS system would want to review.
app.get('/api/emergency/history', verify, (req: any, res) => {
  const roleFilter = req.query.status as string | undefined; // 'arrived' | 'cancelled' | undefined (all)

  const history = [...sessions.values()]
    .filter(s => s.status !== 'active')
    .filter(s => !roleFilter || s.status === roleFilter)
    .map(s => {
      const startMs = new Date(s.startedAt).getTime();
      const endMs = s.endedAt ? new Date(s.endedAt).getTime() : null;
      const durationSeconds = endMs !== null ? Math.round((endMs - startMs) / 1000) : null;
      return {
        id: s.id,
        rid: s.rid,
        status: s.status,
        hospital: s.hospital,
        patient: s.patient,
        routeName: s.routeName,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSeconds,
        hospitalAcknowledged: s.hospitalAcknowledged,
      };
    })
    .sort((a, b) => new Date(b.endedAt || b.startedAt).getTime() - new Date(a.endedAt || a.startedAt).getTime());

  const completedOnly = history.filter(h => h.status === 'arrived' && h.durationSeconds !== null);
  const avgResponseSeconds = completedOnly.length > 0
    ? Math.round(completedOnly.reduce((sum, h) => sum + (h.durationSeconds || 0), 0) / completedOnly.length)
    : null;

  res.json({
    history,
    summary: {
      total: history.length,
      completed: history.filter(h => h.status === 'arrived').length,
      cancelled: history.filter(h => h.status === 'cancelled').length,
      avgResponseSeconds,
    },
  });
});

// ── REAL-TIME STATE (REST fallback) ──────────────────────────
app.get('/api/status', verify, (_req, res) => {
  res.json(buildStatePayload());
});

app.get('/api/logs', verify, (_req, res) => {
  const limit = parseInt((_req.query as any).limit) || 60;
  res.json(logs.slice(0, limit));
});

app.get('/api/routes/computed', (_req, res) => {
  // Public endpoint showing real Dijkstra-computed paths from every
  // ambulance dispatch base to every real hospital in the network.
  const bases = Object.keys(AMBULANCE_BASES);
  const results = bases.flatMap(base =>
    HOSPITALS.map(hospital => {
      // Same blocked-edge state as live emergency routing - never advertise
      // a path through a reported roadblock. Unreachable pairs keep the
      // existing shape: path [] with distanceKm null.
      const path = dijkstra(base, hospital.node, blockedEdges);
      return {
        from: base,
        to: hospital.name,
        path,
        distanceKm: path.length > 0 ? Math.round(pathDistanceKm(path) * 10) / 10 : null,
      };
    })
  );
  res.json({ routes: results });
});

// ── ROAD GRAPH (single source of truth for clients) ─────────────
// The frontend must not hard-code junctions, coordinates, or adjacency:
// nodes/edges live here and are fetched via this endpoint.
app.get('/api/graph', verify, (_req, res) => {
  const nodes = Object.keys(CITY_GRAPH).map(id => ({
    id,
    name: id,
    lat: (GPS_COORDS[id] || [0, 0])[0],
    lng: (GPS_COORDS[id] || [0, 0])[1],
  }));
  const seen = new Set<string>();
  const edges: { from: string; to: string; distanceKm: number; travelTimeMin: number }[] = [];
  Object.entries(CITY_GRAPH).forEach(([from, neighbors]) => {
    Object.entries(neighbors).forEach(([to, km]) => {
      const key = edgeKey(from, to);
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ from, to, distanceKm: Math.round(km * 10) / 10, travelTimeMin: Math.max(2, Math.round(km * 2)) });
    });
  });
  res.json({ nodes, edges });
});

app.get('/api/signal-engine', verify, async (_req, res) => {
  // Reports this backend's own view of signal state (always available),
  // plus live stats from the signal control engine process if it's
  // currently reachable. No hardware fields anywhere - this is a report on
  // two cooperating software services, not a device status page.
  const localSignalView = signals.map(s => ({
    name: s.name,
    state: s.color,
    commandsReceived: signalCommandLog.filter(c => c.signal === s.name).length,
  }));

  try {
    const engineRes = await fetch(`${SIGNAL_ENGINE_URL}/status`);
    if (engineRes.ok) {
      const engineStatus: any = await engineRes.json();
      res.json({
        connected: true,
        engineId: engineStatus.engineId || 'AERIS-SIGNAL-ENGINE-001',
        version: engineStatus.version || 'v1.4.2',
        uptime: engineStatus.uptime,
        totalCommands: engineStatus.totalCommands,
        signals: engineStatus.signals || localSignalView,
        commandLog: signalCommandLog.slice(0, 30),
      });
      return;
    }
  } catch {
    // Signal engine process isn't running - fall through to a local-only report
  }

  res.json({
    connected: false,
    engineId: 'AERIS-SIGNAL-ENGINE-001',
    version: 'v1.4.2',
    signals: localSignalView,
    commands: signalCommandLog,
    commandLog: signalCommandLog.slice(0, 30),
  });
});

// ── SERVER-SENT EVENTS (Real-time push) ──────────────────────
app.get('/api/stream', (req, res) => {
  // Validate token from query param (EventSource can't set headers)
  const tokenParam = (req.query as any).token;
  if (!tokenParam) { res.status(401).end(); return; }
  try { jwt.verify(tokenParam, JWT_SECRET, { algorithms: ['HS256'] }); } catch { res.status(401).end(); return; }

  // Per-IP concurrent-stream cap (see MAX_SSE_PER_IP). Checked after auth
  // so unauthenticated floods still get a plain 401, not cap accounting.
  const streamIp = req.ip || 'unknown';
  if (sseClients.filter(c => c.ip === streamIp).length >= MAX_SSE_PER_IP) {
    res.setHeader('Retry-After', '30');
    res.status(429).end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const client: SSEClient = { id: uuidv4(), res, ip: streamIp };
  sseClients.push(client);

  // Send initial snapshot
  res.write(`data: ${JSON.stringify({ type: 'state', data: buildStatePayload() })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'log', data: logs.slice(0, 30) })}\n\n`);

  // Heartbeat every 15s
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(heartbeat); }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter(c => c.id !== client.id);
  });
});

// ── ADMIN: manage sessions ────────────────────────────────────
app.delete('/api/session/:rid', verify, (req: any, res) => {
  if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
  const { rid } = req.params;
  const session = resolveSession(rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  // Active emergencies carry live corridor, SSE and history state - they
  // must be stopped/cancelled first (which records endedAt) rather than
  // destructively deleted with no terminal state.
  if (session.status === 'active') {
    res.status(400).json({ error: 'Cannot delete an active emergency - stop/cancel it first' }); return;
  }
  sessions.delete(session.id);
  addLog(`🗑️ Session ${session.rid} deleted by admin`, 'system', session.rid);
  clearCorridor();
  updateGreenCorridor();
  res.json({ success: true });
});

app.post('/api/system/reset', verify, (req: any, res) => {
  if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
  sessions.clear();
  logs.splice(0, logs.length);
  signals.forEach(s => { s.color = 'RED'; s.timer = 30; s.manualOverride = false; });
  // Full reset must also drop contested claims (see clearCorridor).
  clearCorridor();
  // A hard reset returns the city to its initial runtime state: no
  // roadblocks, no completions counted, no login-attempt history. Static
  // configuration (users, hospitals, graph, signal definitions) is untouched.
  blockedEdges.clear();
  totalCompleted = 0;
  loginAttempts.clear();
  signalCommandLog.splice(0, signalCommandLog.length);
  addLog('🔄 System hard reset by administrator', 'system');
  signals.forEach(s => sendSignalCommand(s.name, 'RED'));
  res.json({ success: true });
});

// ── STARTUP ──────────────────────────────────────────────────
addLog('🚀 AERIS backend started. JWT Auth active.', 'system');
addLog(`📡 Dijkstra graph loaded — ${Object.keys(CITY_GRAPH).length} nodes`, 'system');
addLog(`🔗 Signal control engine configured at ${SIGNAL_ENGINE_URL}`, 'system');
addLog(`📡 SSE real-time stream ready at /api/stream`, 'system');
addLog(`✅ Software-only emergency authorization: JWT + RBAC (driver/admin)`, 'system');

Object.keys(AMBULANCE_BASES).forEach(base => {
  HOSPITALS.forEach(hospital => {
    const opts = computeRouteOptions(base, hospital, blockedEdges);
    opts.forEach(r => addLog(`🗺️  ${base} → ${hospital.name}: ${r.name} (${r.distance})`, 'info'));
  });
});

app.listen(PORT, () => {
  console.log(`\n✅ AERIS Backend: http://localhost:${PORT}`);
  console.log(`   Auth: JWT (bcrypt password hashing)`);
  console.log(`   Algorithm: Dijkstra on ${Object.keys(CITY_GRAPH).length}-node city graph`);
  console.log(`   Real-time: SSE at /api/stream`);
  console.log(`   Emergency authorization: JWT + RBAC, software-only (no detection)`);
  console.log(`   Signal Engine Target: ${SIGNAL_ENGINE_URL}/signal\n`);
});
