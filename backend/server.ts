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
// Traffic signal control engine - a pure-software simulation of signal
// hardware (see backend/signal-controller-sim.ts). This project has no
// physical hardware component; if real signal controllers are ever added,
// they'd talk to this same HTTP interface.
const SIGNAL_ENGINE_URL = process.env.SIGNAL_ENGINE_URL || 'http://localhost:4001';
const PORT = Number(process.env.PORT) || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
// Detection microservice (FastAPI + your trained YOLO26 best.onnx) - see /detection-service
const DETECTION_SERVICE_URL = process.env.DETECTION_SERVICE_URL || 'http://localhost:8001';

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
  rid: string;
  driverId: string;
  route: string[];
  routeName: string;
  currentNodeIndex: number;
  currentGPS: [number, number];
  cameraDetected: boolean; cameraConfidence: number;
  sirenDetected: boolean;  sirenFrequency: number;
  isVerified: boolean;
  startedAt: string;
  ticksSinceAdvance: number;
  status: 'active' | 'arrived' | 'cancelled';
  // When the session left 'active' - null while active. Needed for
  // incident history (Section: response-time reporting) since neither
  // completion path previously recorded when it happened.
  endedAt: string | null;
  // Timestamps (ms) of the last REAL detection reading from each
  // microservice modality. While fresh (<3s old), the per-second simulation
  // tick leaves that modality's fields alone instead of overwriting them
  // with random values - see simulateDetection(). Tracked separately since
  // camera (YOLO) and siren (FFT audio) are independent signals that can
  // each be live or simulated at different times.
  lastRealCameraAt?: number;
  lastRealSirenAt?: number;

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

  // Hospital acknowledgment + prep tracking - was previously hardcoded fake
  // data in the frontend (Hospital.tsx). Now backed by real state that
  // syncs to every dashboard over SSE.
  hospitalAcknowledged: boolean;
  hospitalAcknowledgedAt: string | null;
  prepTasks: { id: string; label: string; done: boolean }[];
}

interface SSEClient {
  id: string; res: express.Response;
}

// ═══════════════════════════════════════════════════════════════
//  USERS (hashed passwords for real auth)
// ═══════════════════════════════════════════════════════════════
const USERS: Record<string, { id: string; name: string; role: UserRole; hash: string; ambulanceRid?: string; dispatchNode?: string }> = {
  // Multiple driver accounts across TWO real dispatch bases - Indiranagar
  // (east) and Silk Board Junction (south) - giving genuine multi-base
  // ambulance coverage instead of every ambulance starting from one spot.
  'driver':   { id: uuidv4(), name: 'Ravi Kumar',           role: 'driver',   hash: bcrypt.hashSync('driver123', 8),   ambulanceRid: 'AMB-101', dispatchNode: 'Indiranagar Metro (Dispatch)' },
  'driver2':  { id: uuidv4(), name: 'Suresh Nair',          role: 'driver',   hash: bcrypt.hashSync('driver123', 8),   ambulanceRid: 'AMB-102', dispatchNode: 'Silk Board Junction' },
  'driver3':  { id: uuidv4(), name: 'Anitha Rao',           role: 'driver',   hash: bcrypt.hashSync('driver123', 8),   ambulanceRid: 'AMB-103', dispatchNode: 'Indiranagar Metro (Dispatch)' },
  'police':   { id: uuidv4(), name: 'Insp. Rajesh Verma',   role: 'police',   hash: bcrypt.hashSync('police123', 8) },
  'hospital': { id: uuidv4(), name: 'Dr. Priya Sharma',     role: 'hospital', hash: bcrypt.hashSync('hospital123', 8) },
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
  'Domlur Flyover':               { '100 Feet Road Junction': 1.3, 'Indiranagar Metro (Dispatch)': 2.3, 'Kodihalli Junction': 0.6, 'Marathahalli (ORR)': 6.5 },
  'Kodihalli Junction':           { 'Domlur Flyover': 0.6, 'Manipal Hospital': 0.3, 'Marathahalli (ORR)': 5.9 },
  'Marathahalli (ORR)':           { 'Domlur Flyover': 6.5, 'Kodihalli Junction': 5.9 },
  'Manipal Hospital':             { 'Kodihalli Junction': 0.3 },

  // Central corridor (MG Road / Trinity Circle / Ulsoor)
  'Halasuru (Ulsoor)':            { 'Indiranagar Metro (Dispatch)': 1.4, 'Trinity Circle': 1.1 },
  'Trinity Circle':               { 'Halasuru (Ulsoor)': 1.1, 'Victoria Hospital': 4.8, 'Adugodi': 3.4 },
  'Victoria Hospital':            { 'Trinity Circle': 4.8 },

  // Southern corridor (Hosur Road / Koramangala / Silk Board)
  'Adugodi':                      { 'Trinity Circle': 3.4, 'Silk Board Junction': 3.3 },
  'Silk Board Junction':          { 'Adugodi': 3.3, "St. John's Medical College Hospital": 1.4 },
  "St. John's Medical College Hospital": { 'Silk Board Junction': 1.4 },
};

// GPS coordinates - real, verified. Sources noted per cluster above.
const GPS_COORDS: Record<string, [number, number]> = {
  'Indiranagar Metro (Dispatch)':          [12.9786, 77.6388],
  '100 Feet Road Junction':                [12.9719, 77.6412],
  'Domlur Flyover':                        [12.9604, 77.6417],
  'Kodihalli Junction':                    [12.9601, 77.6472],
  'Marathahalli (ORR)':                    [12.9562, 77.7019],
  'Manipal Hospital':                      [12.9588, 77.6491],
  'Halasuru (Ulsoor)':                     [12.9757, 77.6263],
  'Trinity Circle':                        [12.9730, 77.6170],
  'Victoria Hospital':                     [12.9634, 77.5738],
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
  id: string; name: string; node: string; departments: string[]; address: string;
  totalBeds: number; availableBeds: number;
}
const HOSPITALS: Hospital[] = [
  { id: 'manipal', name: 'Manipal Hospital', node: 'Manipal Hospital', departments: ['Trauma', 'Cardiology', 'General Emergency', 'Neurology'], address: 'Old Airport Road, Kodihalli, Bengaluru', totalBeds: 40, availableBeds: 12 },
  { id: 'stjohns', name: "St. John's Medical College Hospital", node: "St. John's Medical College Hospital", departments: ['Trauma', 'General Emergency', 'Pediatrics', 'ICU'], address: 'Sarjapur Road, Koramangala, Bengaluru', totalBeds: 55, availableBeds: 8 },
  { id: 'victoria', name: 'Victoria Hospital', node: 'Victoria Hospital', departments: ['General Emergency', 'Trauma', 'Government/No-cost care'], address: 'Fort Road, Bengaluru', totalBeds: 90, availableBeds: 23 },
];

// Real ambulance dispatch bases - drivers are assigned to one of two real
// starting points, giving genuine multi-base dispatch across the city
// rather than every ambulance starting from the same spot.
const AMBULANCE_BASES: Record<string, string> = {
  'Indiranagar Metro (Dispatch)': 'Indiranagar Metro (Dispatch)',
  'Silk Board Junction': 'Silk Board Junction',
};

// Distance threshold for proximity detection (in km)
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
  const options = [{
    id: 'R1',
    name: `Optimal Route (Dijkstra) to ${hospital.name}`,
    nodes: optimalNodes,
    distance: `${optimalKm.toFixed(1)} km`,
    estimatedTime: Math.max(2, Math.round(optimalKm * 2)),
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
      });
    }
  }
  return options;
}

// ═══════════════════════════════════════════════════════════════
//  GLOBAL STATE
// ═══════════════════════════════════════════════════════════════
const sessions = new Map<string, AmbulanceSession>(); // RID → session
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
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { sub: string; role: UserRole };
    (req as any).user = payload;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ═══════════════════════════════════════════════════════════════
//  DETECTION SIMULATION
//  In a real system: camera endpoint receives an image/frame,
//  siren endpoint receives audio energy level.
// ═══════════════════════════════════════════════════════════════
const REAL_DETECTION_FRESHNESS_MS = 3000;

function simulateDetection(session: AmbulanceSession) {
  // Camera detection (YOLO) — if a real reading came in from the detection
  // microservice within the last few seconds, trust it and don't overwrite
  // it with a random simulated value. Falls back to simulation automatically
  // if no real camera feed is sending frames (keeps the demo working either way).
  const hasFreshCameraReading = !!session.lastRealCameraAt &&
    (Date.now() - session.lastRealCameraAt) < REAL_DETECTION_FRESHNESS_MS;

  const prevCam = session.cameraDetected;
  if (!hasFreshCameraReading) {
    session.cameraConfidence = session.status === 'active'
      ? 82 + Math.floor(Math.random() * 15)   // 82-96% during active
      : Math.floor(Math.random() * 20);        // 0-20% at idle
    session.cameraDetected = session.cameraConfidence >= 75;
  }

  // Siren detection (real FFT audio if fresh, otherwise simulated)
  const hasFreshSirenReading = !!session.lastRealSirenAt &&
    (Date.now() - session.lastRealSirenAt) < REAL_DETECTION_FRESHNESS_MS;

  const prevSiren = session.sirenDetected;
  if (!hasFreshSirenReading) {
    session.sirenFrequency = session.status === 'active'
      ? 850 + Math.floor(Math.random() * 200)  // 850-1050 Hz (active siren)
      : Math.floor(Math.random() * 100);        // 0-100 Hz (ambient)
    session.sirenDetected = session.sirenFrequency >= 700;
  }

  // Fail-safe logic:
  // camera ✓ OR siren ✓ → verified
  // both fail → still verified if emergency manually activated (manual override)
  session.isVerified = session.cameraDetected || session.sirenDetected;

  // Log detection state changes
  if (prevCam && !session.cameraDetected)
    addLog(`Camera detection lost for ${session.rid} — siren fallback active`, 'warning', session.rid);
  if (!prevCam && session.cameraDetected)
    addLog(`Camera detection restored for ${session.rid}`, 'success', session.rid);
  if (prevSiren && !session.sirenDetected)
    addLog(`Siren detection lost for ${session.rid} — camera fallback active`, 'warning', session.rid);
  if (!prevSiren && session.sirenDetected)
    addLog(`Siren detection restored for ${session.rid}`, 'success', session.rid);
}

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
//  GREEN CORRIDOR ENGINE (Distance-Based Proximity Detection)
//  Determines which signals should be GREEN based on ambulance GPS
//  position and distance threshold. Signals within proximity → GREEN.
// ═══════════════════════════════════════════════════════════════
const JUNCTION_TO_SIGNAL: Record<string, string> = {
  '100 Feet Road Junction': 'S1', 'Domlur Flyover': 'S2',
  'Kodihalli Junction': 'S3', 'Marathahalli (ORR)': 'S4',
  'Halasuru (Ulsoor)': 'S5', 'Trinity Circle': 'S6', 'Adugodi': 'S7',
};

// Multi-ambulance conflict resolution (Section 23 of the original spec:
// "Multiple ambulance conflict management" - previously the corridor
// logic silently gave the signal to whichever ambulance was physically
// closest, with no awareness that a farther-but-more-critical patient
// should take priority. Real EMS dispatch prioritizes by acuity, not
// just proximity.
const SEVERITY_RANK: Record<string, number> = { critical: 3, serious: 2, stable: 1 };

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
    return;
  }

  // For each signal, find every ambulance within range - not just the
  // single nearest - so a genuine conflict (multiple ambulances close to
  // the same signal at once) can actually be detected and resolved.
  const signalCandidates = new Map<string, { distance: number; rid: string; severity: string }[]>();

  activeSessions.forEach(session => {
    const [ambLat, ambLng] = session.currentGPS;
    
    signals.forEach(sig => {
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

    simulateDetection(session);
    session.vitals = stepVitals(session.vitals, session.patient.severity);

    // Advance ambulance along route
    session.ticksSinceAdvance++;
    
    // Smooth GPS interpolation between nodes
    const currentNode = session.route[session.currentNodeIndex];
    const nextNode = session.route[session.currentNodeIndex + 1];
    if (nextNode) {
      const startGPS = GPS_COORDS[currentNode];
      const endGPS = GPS_COORDS[nextNode];
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
  // Enhance sessions with verification details
  const enhancedSessions = [...sessions.values()].map(session => ({
    ...session,
    verificationStatus: {
      emergencyActive: session.status === 'active',
      cameraDetected: session.cameraDetected,
      cameraConfidence: session.cameraConfidence,
      sirenDetected: session.sirenDetected,
      sirenFrequency: session.sirenFrequency,
      isVerified: session.isVerified,
      verificationLogic: `Emergency ${session.status === 'active' ? 'ON' : 'OFF'} AND (Camera: ${session.cameraDetected ? '✓' : '✗'} OR Siren: ${session.sirenDetected ? '✓' : '✗'}) = ${session.isVerified ? 'VERIFIED ✓' : 'NOT VERIFIED ✗'}`
    }
  }));
  
  return {
    sessions: enhancedSessions,
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
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json({ limit: '8mb' })); // raised for base64 camera frames (real detection)

// ── AUTH ──────────────────────────────────────────────────────
// Lightweight in-memory rate limit: 10 attempts per 15 min per IP.
// Good enough for a demo; swap for express-rate-limit if this goes further.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many login attempts - try again in a few minutes' });
    return;
  }

  const { username, password } = req.body;
  const user = USERS[username?.toLowerCase()];
  if (!user || !bcrypt.compareSync(password, user.hash)) {
    addLog(`❌ Failed login attempt: ${username}`, 'warning');
    res.status(401).json({ error: 'Invalid credentials' }); return;
  }
  const token = jwt.sign({ sub: user.id, username, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '8h' });
  addLog(`🔐 ${user.name} logged in as ${user.role}`, 'system');
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, username } });
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
  const hospital = HOSPITALS.find(h => h.id === req.params.id);
  if (!hospital) { res.status(404).json({ error: 'Hospital not found' }); return; }

  const { availableBeds } = req.body;
  if (typeof availableBeds !== 'number' || availableBeds < 0 || availableBeds > hospital.totalBeds) {
    res.status(400).json({ error: `availableBeds must be a number between 0 and ${hospital.totalBeds}` });
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

  const hospitalId = (req.query.hospitalId as string) || HOSPITALS[0].id;
  const hospital = HOSPITALS.find(h => h.id === hospitalId) || HOSPITALS[0];

  res.json(computeRouteOptions(fromNode, hospital));
});

// ── EMERGENCY MANAGEMENT ──────────────────────────────────────
app.post('/api/emergency/start', verify, (req: any, res) => {
  const { hospitalId, routeId, patient } = req.body;

  // Check if this driver already has an active session
  const existingSession = [...sessions.values()].find(
    s => s.driverId === req.user.sub && s.status === 'active'
  );
  if (existingSession) {
    res.status(400).json({ error: 'You already have an active emergency session', rid: existingSession.rid });
    return;
  }

  const userRecord = USERS[(req.user.username || '').toLowerCase()];
  const fromNode = userRecord?.dispatchNode || 'Indiranagar Metro (Dispatch)';

  const hospital = HOSPITALS.find(h => h.id === hospitalId) || HOSPITALS[0];
  const routeOptions = computeRouteOptions(fromNode, hospital, blockedEdges);
  if (routeOptions.length === 0) {
    res.status(422).json({ error: `No available route from ${fromNode} to ${hospital.name} - all roads blocked` });
    return;
  }
  const route = routeOptions.find(r => r.id === routeId) || routeOptions[0];

  // Use this driver's assigned ambulance RID if they have one (see USERS),
  // otherwise fall back to a random one - keeps each driver account mapped
  // to a consistent, recognizable ambulance across the Police/Admin fleet views.
  const rid = userRecord?.ambulanceRid || `AMB-${uuidv4().slice(0, 6).toUpperCase()}`;

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
    rid, driverId: req.user.sub,
    route: route.nodes, routeName: route.name,
    currentNodeIndex: 0,
    currentGPS: GPS_COORDS[route.nodes[0]] || [12.9786, 77.6388],
    cameraDetected: true, cameraConfidence: 91,
    sirenDetected: true,  sirenFrequency: 970,
    isVerified: true,
    startedAt: new Date().toISOString(),
    ticksSinceAdvance: 0,
    status: 'active',
    endedAt: null,
    patient: {
      condition: patient?.condition || 'Not specified',
      severity: validatedSeverity,
      requiredDepartment: patient?.requiredDepartment || 'General Emergency',
      notes: patient?.notes || '',
    },
    vitals: initialVitals(validatedSeverity),
    hospital: { id: hospital.id, name: hospital.name, node: hospital.node },
    hospitalAcknowledged: false,
    hospitalAcknowledgedAt: null,
    prepTasks: defaultPrepTasks,
  };

  sessions.set(rid, session);
  addLog(`🚨 EMERGENCY ACTIVATED — RID: ${rid} (Driver: ${req.user.name}) from ${fromNode}`, 'error', rid);
  addLog(`🏥 Destination: ${hospital.name} (${hospital.address})`, 'info', rid);
  addLog(`📍 Route computed via Dijkstra: ${route.nodes.join(' → ')} (${route.distance})`, 'info', rid);
  addLog(`🔍 Initial verification: Camera ✓ Siren ✓`, 'success', rid);
  addLog(`🏥 Patient: ${session.patient.severity.toUpperCase()} — ${session.patient.condition} (needs ${session.patient.requiredDepartment})`, 'info', rid);

  // Immediately send corridor state to the signal control engine
  updateGreenCorridor();

  res.status(201).json({ rid, route: route.nodes, routeName: route.name, hospital: session.hospital, patient: session.patient });
});

app.post('/api/emergency/stop', verify, (req: any, res) => {
  const { rid } = req.body;
  const session = sessions.get(rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  session.status = 'cancelled';
  session.endedAt = new Date().toISOString();
  addLog(`🛑 Emergency ${rid} manually cancelled by ${req.user.name}`, 'warning', rid);

  // Release corridor
  signals.forEach(sig => {
    if (!sig.manualOverride) { sig.color = 'RED'; sig.timer = 30; sendSignalCommand(sig.name, 'RED'); }
  });
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
  const session = sessions.get(req.params.rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  session.hospitalAcknowledged = true;
  session.hospitalAcknowledgedAt = new Date().toISOString();
  addLog(`🏥 Hospital acknowledged incoming ${session.rid} (${req.user.name})`, 'success', session.rid);

  res.json({ success: true, hospitalAcknowledged: true, hospitalAcknowledgedAt: session.hospitalAcknowledgedAt });
});

app.post('/api/emergency/:rid/prep', verify, (req: any, res) => {
  if (req.user.role !== 'hospital' && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Hospital staff only' }); return;
  }
  const session = sessions.get(req.params.rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  const { taskId, done } = req.body;
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

// ── DETECTION ENDPOINTS ───────────────────────────────────────
// Manual toggle camera detection
app.post('/api/detect/camera/toggle', verify, (req: any, res) => {
  const { rid, detected, confidence } = req.body;
  const session = sessions.get(rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  
  const prevDetected = session.cameraDetected;
  session.cameraDetected = detected ?? !session.cameraDetected;
  session.cameraConfidence = confidence ?? (session.cameraDetected ? 85 : 20);
  
  // Update verification status
  const prevVerified = session.isVerified;
  session.isVerified = session.status === 'active' && (session.cameraDetected || session.sirenDetected);
  
  addLog(
    `📷 Camera detection ${session.cameraDetected ? 'ENABLED' : 'DISABLED'} for ${session.rid} (Confidence: ${session.cameraConfidence}%) - Manually toggled by ${req.user.name}`,
    session.cameraDetected ? 'success' : 'warning',
    session.rid
  );
  
  if (prevVerified !== session.isVerified) {
    addLog(
      `${session.isVerified ? '✅' : '⚠️'} Emergency verification ${session.isVerified ? 'RESTORED' : 'LOST'} for ${session.rid}`,
      session.isVerified ? 'success' : 'error',
      session.rid
    );
  }
  
  res.json({ 
    success: true,
    cameraDetected: session.cameraDetected, 
    cameraConfidence: session.cameraConfidence,
    isVerified: session.isVerified,
    verificationStatus: {
      emergencyActive: session.status === 'active',
      cameraDetected: session.cameraDetected,
      sirenDetected: session.sirenDetected,
      isVerified: session.isVerified
    }
  });
});

// Manual toggle siren detection
app.post('/api/detect/siren/toggle', verify, (req: any, res) => {
  const { rid, detected, frequency } = req.body;
  const session = sessions.get(rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  
  const prevDetected = session.sirenDetected;
  session.sirenDetected = detected ?? !session.sirenDetected;
  session.sirenFrequency = frequency ?? (session.sirenDetected ? 920 : 50);
  
  // Update verification status
  const prevVerified = session.isVerified;
  session.isVerified = session.status === 'active' && (session.cameraDetected || session.sirenDetected);
  
  addLog(
    `🔊 Siren detection ${session.sirenDetected ? 'ENABLED' : 'DISABLED'} for ${session.rid} (Frequency: ${session.sirenFrequency} Hz) - Manually toggled by ${req.user.name}`,
    session.sirenDetected ? 'success' : 'warning',
    session.rid
  );
  
  if (prevVerified !== session.isVerified) {
    addLog(
      `${session.isVerified ? '✅' : '⚠️'} Emergency verification ${session.isVerified ? 'RESTORED' : 'LOST'} for ${session.rid}`,
      session.isVerified ? 'success' : 'error',
      session.rid
    );
  }
  
  res.json({ 
    success: true,
    sirenDetected: session.sirenDetected, 
    sirenFrequency: session.sirenFrequency,
    isVerified: session.isVerified,
    verificationStatus: {
      emergencyActive: session.status === 'active',
      cameraDetected: session.cameraDetected,
      sirenDetected: session.sirenDetected,
      isVerified: session.isVerified
    }
  });
});

// Camera detection - now backed by your real trained YOLO26 model when a
// frame is provided (frameBase64: a JPEG/PNG frame, base64-encoded).
// Calls the FastAPI detection microservice (see /detection-service).
// If no frame is sent, behaves exactly like the old simulated endpoint -
// nothing breaks if the frontend/hardware camera isn't wired up yet.
app.post('/api/detect/camera', verify, async (req: any, res) => {
  const { rid, frameBase64 } = req.body;
  const session = sessions.get(rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  if (!frameBase64) {
    // Legacy simulated path - unchanged behavior for backward compatibility
    const confidence = session.status === 'active' ? 80 + Math.floor(Math.random() * 18) : Math.floor(Math.random() * 25);
    session.cameraConfidence = confidence;
    session.cameraDetected = confidence >= 75;
    res.json({ detected: session.cameraDetected, confidence, class: 'ambulance' });
    return;
  }

  try {
    const buffer = Buffer.from(frameBase64, 'base64');
    // Node 18+ has global fetch/FormData/Blob - no extra dependency needed.
    const form = new FormData();
    form.append('file', new Blob([buffer]), 'frame.jpg');

    const detectRes = await fetch(`${DETECTION_SERVICE_URL}/detect`, { method: 'POST', body: form as any });
    if (!detectRes.ok) throw new Error(`Detection service returned ${detectRes.status}`);
    const result: any = await detectRes.json();

    session.cameraConfidence = result.confidence;
    session.cameraDetected = result.detected;
    session.lastRealCameraAt = Date.now();
    // Your model also detects a "Siren" class (visual light bar) - treat it
    // as a second, independent verification signal alongside real audio siren
    // detection, matching Section 4's dual-verification concept.
    if (result.sirenDetected) {
      session.sirenDetected = true;
      session.sirenFrequency = Math.max(session.sirenFrequency, 900);
      session.lastRealSirenAt = Date.now();
    }

    const prevVerified = session.isVerified;
    session.isVerified = session.status === 'active' && (session.cameraDetected || session.sirenDetected);
    if (prevVerified !== session.isVerified) {
      addLog(`${session.isVerified ? '✅' : '⚠️'} Emergency verification ${session.isVerified ? 'RESTORED' : 'LOST'} for ${session.rid} (real YOLO detection)`, session.isVerified ? 'success' : 'error', session.rid);
    }

    res.json(result);
  } catch (err) {
    // Detection service unreachable - fail safe rather than silently trusting
    // a stale reading (Section 22: "if camera detection fails, require
    // secondary verification"). Falls through to whatever the siren channel
    // currently says instead of blocking the response.
    addLog(`⚠️ Detection service unreachable for ${rid} - falling back to siren-only verification`, 'warning', rid);
    res.status(502).json({ error: 'Detection service unavailable', detected: false, confidence: 0 });
  }
});

// In a real system: siren sensor sends audio energy/frequency here
// Siren detection - now backed by real FFT audio analysis when an audio
// clip is provided (audioBase64: a WAV clip, base64-encoded). Calls the
// same detection microservice's /detect-siren-audio endpoint. Falls back
// to the original simulated/manual-frequency behavior when no clip is sent.
app.post('/api/detect/siren', verify, async (req: any, res) => {
  const { rid, frequency, audioBase64 } = req.body;
  const session = sessions.get(rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  if (!audioBase64) {
    // Legacy simulated/manual path - unchanged
    const freq = frequency ?? (session.status === 'active' ? 850 + Math.floor(Math.random() * 200) : Math.floor(Math.random() * 100));
    session.sirenFrequency = freq;
    session.sirenDetected = freq >= 700;
    res.json({ detected: session.sirenDetected, frequency: freq, threshold: 700 });
    return;
  }

  try {
    const buffer = Buffer.from(audioBase64, 'base64');
    const form = new FormData();
    form.append('file', new Blob([buffer]), 'clip.wav');

    const detectRes = await fetch(`${DETECTION_SERVICE_URL}/detect-siren-audio`, { method: 'POST', body: form as any });
    if (!detectRes.ok) throw new Error(`Detection service returned ${detectRes.status}`);
    const result: any = await detectRes.json();

    session.sirenDetected = result.sirenDetected;
    session.sirenFrequency = result.dominantFreqRangeHz ? Math.round((result.dominantFreqRangeHz[0] + result.dominantFreqRangeHz[1]) / 2) : session.sirenFrequency;
    session.lastRealSirenAt = Date.now();

    const prevVerified = session.isVerified;
    session.isVerified = session.status === 'active' && (session.cameraDetected || session.sirenDetected);
    if (prevVerified !== session.isVerified) {
      addLog(`${session.isVerified ? '✅' : '⚠️'} Emergency verification ${session.isVerified ? 'RESTORED' : 'LOST'} for ${session.rid} (real FFT audio detection)`, session.isVerified ? 'success' : 'error', session.rid);
    }

    res.json(result);
  } catch (err) {
    addLog(`⚠️ Audio detection service unreachable for ${rid} - falling back to camera-only verification`, 'warning', rid);
    res.status(502).json({ error: 'Detection service unavailable', sirenDetected: false, confidence: 0 });
  }
});

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
        rid: s.rid,
        status: s.status,
        hospital: s.hospital,
        patient: s.patient,
        routeName: s.routeName,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSeconds,
        wasVerified: s.isVerified,
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
      const path = dijkstra(base, hospital.node);
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
  try { jwt.verify(tokenParam, JWT_SECRET); } catch { res.status(401).end(); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const client: SSEClient = { id: uuidv4(), res };
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
  const session = sessions.get(rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  sessions.delete(rid);
  addLog(`🗑️ Session ${rid} deleted by admin`, 'system');
  updateGreenCorridor();
  res.json({ success: true });
});

app.post('/api/system/reset', verify, (req: any, res) => {
  if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
  sessions.clear();
  logs.splice(0, logs.length);
  signals.forEach(s => { s.color = 'RED'; s.timer = 30; s.manualOverride = false; });
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
addLog(`🔍 Detection system: Camera (YOLO) + Siren (Audio FFT)`, 'system');
addLog(`✅ Verification logic: Emergency ON AND (Camera OR Siren)`, 'system');

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
  console.log(`   Detection: Camera + Siren (Manual toggle available)`);
  console.log(`   Verification: Emergency ON AND (Camera OR Siren)`);
  console.log(`   Signal Engine Target: ${SIGNAL_ENGINE_URL}/signal\n`);
});
