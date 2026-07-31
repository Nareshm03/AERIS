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
const ESP32_HOST = process.env.ESP32_HOST || 'http://localhost:4001'; // ESP32 simulator
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
const USERS: Record<string, { id: string; name: string; role: UserRole; hash: string; ambulanceRid?: string }> = {
  // Multiple driver accounts -> multiple concurrent ambulances. Each gets a
  // fixed "home" ambulance RID prefix so it's recognizable across restarts
  // (in-memory state still resets on restart, only the USERS map is fixed).
  'driver':   { id: uuidv4(), name: 'Ravi Kumar',           role: 'driver',   hash: bcrypt.hashSync('driver123', 8),   ambulanceRid: 'AMB-101' },
  'driver2':  { id: uuidv4(), name: 'Suresh Nair',          role: 'driver',   hash: bcrypt.hashSync('driver123', 8),   ambulanceRid: 'AMB-102' },
  'driver3':  { id: uuidv4(), name: 'Anitha Rao',           role: 'driver',   hash: bcrypt.hashSync('driver123', 8),   ambulanceRid: 'AMB-103' },
  'police':   { id: uuidv4(), name: 'Insp. Rajesh Verma',   role: 'police',   hash: bcrypt.hashSync('police123', 8) },
  'hospital': { id: uuidv4(), name: 'Dr. Priya Sharma',     role: 'hospital', hash: bcrypt.hashSync('hospital123', 8) },
  'admin':    { id: uuidv4(), name: 'System Administrator', role: 'admin',    hash: bcrypt.hashSync('admin123', 8) },
};

// ═══════════════════════════════════════════════════════════════
//  DIJKSTRA CITY GRAPH + GPS COORDINATES
// ═══════════════════════════════════════════════════════════════
type Graph = Record<string, Record<string, number>>;

const CITY_GRAPH: Graph = {
  'Dispatch Bay':     { 'Junction A': 3, 'Ring Road': 5 },
  'Junction A':       { 'Dispatch Bay': 3, 'Junction B': 4, 'Central Junction': 6 },
  'Junction B':       { 'Junction A': 4, 'Central Junction': 3, 'Medical Zone': 5 },
  'Central Junction': { 'Junction A': 6, 'Junction B': 3, 'Medical Zone': 4, 'North Gate': 7 },
  'Medical Zone':     { 'Junction B': 5, 'Central Junction': 4, 'City Hospital': 2 },
  'Ring Road':        { 'Dispatch Bay': 5, 'North Gate': 4 },
  'North Gate':       { 'Ring Road': 4, 'Central Junction': 7, 'City Hospital': 6 },
  'City Hospital':    { 'Medical Zone': 2, 'North Gate': 6 },
};

// GPS coordinates for each junction (simulated city layout)
const GPS_COORDS: Record<string, [number, number]> = {
  'Dispatch Bay':     [28.6139, 77.2090],  // Starting point
  'Junction A':       [28.6180, 77.2120],
  'Junction B':       [28.6220, 77.2150],
  'Central Junction': [28.6250, 77.2180],
  'Medical Zone':     [28.6280, 77.2200],
  'Ring Road':        [28.6160, 77.2050],
  'North Gate':       [28.6300, 77.2100],
  'City Hospital':    [28.6320, 77.2220],  // Destination
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

// blockedEdges holds keys like "Junction A|Junction B" (both orderings
// checked) - see ROADBLOCK MANAGEMENT below. Passed through to dijkstra()
// so a reported roadblock actually removes that road from consideration
// instead of just being logged and ignored.
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

// Precompute route options from Dispatch Bay → City Hospital
const ROUTE_OPTIONS = [
  { id: 'R1', name: 'Optimal Route (Dijkstra)', nodes: dijkstra('Dispatch Bay', 'City Hospital'), distance: '4.2 km', estimatedTime: 8 },
  { id: 'R2', name: 'Highway Route',            nodes: ['Dispatch Bay', 'Ring Road', 'North Gate', 'City Hospital'], distance: '5.8 km', estimatedTime: 10 },
  { id: 'R3', name: 'Short Cut Route',          nodes: ['Dispatch Bay', 'Junction A', 'Junction B', 'Medical Zone', 'City Hospital'], distance: '3.6 km', estimatedTime: 7 },
];

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
  { id: 'S1', name: 'Signal A', junction: 'Junction A',       color: 'RED', timer: 30, manualOverride: false, lat: 28.6180, lng: 77.2120 },
  { id: 'S2', name: 'Signal B', junction: 'Junction B',       color: 'RED', timer: 25, manualOverride: false, lat: 28.6220, lng: 77.2150 },
  { id: 'S3', name: 'Signal C', junction: 'Central Junction', color: 'GREEN', timer: 18, manualOverride: false, lat: 28.6250, lng: 77.2180 },
  { id: 'S4', name: 'Signal D', junction: 'Medical Zone',     color: 'RED', timer: 35, manualOverride: false, lat: 28.6280, lng: 77.2200 },
  { id: 'S5', name: 'Signal E', junction: 'Ring Road',        color: 'YELLOW', timer: 5, manualOverride: false, lat: 28.6160, lng: 77.2050 },
  { id: 'S6', name: 'Signal F', junction: 'North Gate',       color: 'RED', timer: 40, manualOverride: false, lat: 28.6300, lng: 77.2100 },
];

// ESP32 command log
const esp32Log: { signal: string; color: string; ts: string; ack: boolean }[] = [];

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

// Send signal command to ESP32 via HTTP
function sendToESP32(signalName: string, color: string) {
  const entry = { signal: signalName, color, ts: new Date().toISOString(), ack: false };
  esp32Log.unshift(entry);
  if (esp32Log.length > 50) esp32Log.pop();

  // Attempt real HTTP call to ESP32 simulator
  const postData = JSON.stringify({ signal: signalName, color });
  const req = http.request(`${ESP32_HOST}/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
  }, res => {
    entry.ack = res.statusCode === 200;
  });
  req.on('error', () => { /* ESP32 offline — log only */ });
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
//  computed from its CURRENT position to City Hospital, avoiding it.
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
    const newPath = dijkstra(currentNode, 'City Hospital', blockedEdges);

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
  'Junction A': 'S1', 'Junction B': 'S2',
  'Central Junction': 'S3', 'Medical Zone': 'S4',
  'Ring Road': 'S5', 'North Gate': 'S6',
};

function updateGreenCorridor() {
  const activeSessions = [...sessions.values()].filter(s => s.status === 'active');
  
  if (activeSessions.length === 0) {
    // No active sessions — all signals back to RED
    signals.forEach(sig => {
      if (!sig.manualOverride && sig.color !== 'RED') {
        sig.color = 'RED';
        sig.timer = 30;
        addLog(`🔴 CORRIDOR CLOSED: ${sig.name} (${sig.junction}) - No active emergencies`, 'info');
        sendToESP32(sig.name, 'RED');
      }
    });
    return;
  }

  // Calculate distance from each ambulance to each signal
  const signalProximity = new Map<string, { distance: number; rid: string }>();
  
  activeSessions.forEach(session => {
    const [ambLat, ambLng] = session.currentGPS;
    
    signals.forEach(sig => {
      const distance = calculateDistance(ambLat, ambLng, sig.lat, sig.lng);
      
      // Track closest ambulance to each signal
      const existing = signalProximity.get(sig.id);
      if (!existing || distance < existing.distance) {
        signalProximity.set(sig.id, { distance, rid: session.rid });
      }
    });
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
        sendToESP32(sig.name, 'GREEN');
      } else if (targetColor === 'RED' && prevColor === 'GREEN') {
        addLog(`🔴 CORRIDOR CLOSED: ${sig.name} (${sig.junction}) - Ambulance passed`, 'info');
        sendToESP32(sig.name, 'RED');
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
        totalCompleted++;
        addLog(`✅ ${session.rid} ARRIVED at City Hospital — session complete`, 'success', session.rid);
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
        sendToESP32(sig.name, 'RED');
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
    routes: ROUTE_OPTIONS,
    systemLoad,
    apiLatency,
    totalCompleted,
    esp32Log: esp32Log.slice(0, 20),
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

// ── ROUTES (Dijkstra) ─────────────────────────────────────────
app.get('/api/routes', verify, (_req, res) => {
  res.json(ROUTE_OPTIONS);
});

// ── EMERGENCY MANAGEMENT ──────────────────────────────────────
app.post('/api/emergency/start', verify, (req: any, res) => {
  const { routeId, patient } = req.body;

  // Check if this driver already has an active session
  const existingSession = [...sessions.values()].find(
    s => s.driverId === req.user.sub && s.status === 'active'
  );
  if (existingSession) {
    res.status(400).json({ error: 'You already have an active emergency session', rid: existingSession.rid });
    return;
  }

  let route = ROUTE_OPTIONS.find(r => r.id === routeId) || ROUTE_OPTIONS[0];

  // If the chosen precomputed route crosses a currently-reported roadblock,
  // compute a fresh one around it rather than dispatching into a dead end.
  const routeCrossesBlockedEdge = route.nodes.some((node, i) =>
    i < route.nodes.length - 1 && blockedEdges.has(edgeKey(node, route.nodes[i + 1]))
  );
  if (routeCrossesBlockedEdge) {
    const altNodes = dijkstra('Dispatch Bay', 'City Hospital', blockedEdges);
    if (altNodes.length > 0) {
      route = { id: route.id, name: `${route.name} (rerouted around roadblock)`, nodes: altNodes, distance: route.distance, estimatedTime: route.estimatedTime };
      addLog(`🚧 Selected route crosses a known roadblock — dispatching via alternate path instead`, 'warning');
    }
  }

  // Use this driver's assigned ambulance RID if they have one (see USERS),
  // otherwise fall back to a random one - keeps each driver account mapped
  // to a consistent, recognizable ambulance across the Police/Admin fleet views.
  const userRecord = USERS[(req.user.username || '').toLowerCase()];
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

  const session: AmbulanceSession = {
    rid, driverId: req.user.sub,
    route: route.nodes, routeName: route.name,
    currentNodeIndex: 0,
    currentGPS: GPS_COORDS[route.nodes[0]] || [28.6139, 77.2090],
    cameraDetected: true, cameraConfidence: 91,
    sirenDetected: true,  sirenFrequency: 970,
    isVerified: true,
    startedAt: new Date().toISOString(),
    ticksSinceAdvance: 0,
    status: 'active',
    patient: {
      condition: patient?.condition || 'Not specified',
      severity: (['critical', 'serious', 'stable'].includes(patient?.severity) ? patient.severity : 'serious'),
      requiredDepartment: patient?.requiredDepartment || 'General Emergency',
      notes: patient?.notes || '',
    },
    hospitalAcknowledged: false,
    hospitalAcknowledgedAt: null,
    prepTasks: defaultPrepTasks,
  };

  sessions.set(rid, session);
  addLog(`🚨 EMERGENCY ACTIVATED — RID: ${rid} (Driver: ${req.user.name})`, 'error', rid);
  addLog(`📍 Route computed via Dijkstra: ${route.nodes.join(' → ')}`, 'info', rid);
  addLog(`🔍 Initial verification: Camera ✓ Siren ✓`, 'success', rid);
  addLog(`🏥 Patient: ${session.patient.severity.toUpperCase()} — ${session.patient.condition} (needs ${session.patient.requiredDepartment})`, 'info', rid);

  // Immediately send corridor to ESP32
  updateGreenCorridor();

  res.status(201).json({ rid, route: route.nodes, routeName: route.name, patient: session.patient });
});

app.post('/api/emergency/stop', verify, (req: any, res) => {
  const { rid } = req.body;
  const session = sessions.get(rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  session.status = 'cancelled';
  addLog(`🛑 Emergency ${rid} manually cancelled by ${req.user.name}`, 'warning', rid);

  // Release corridor
  signals.forEach(sig => {
    if (!sig.manualOverride) { sig.color = 'RED'; sig.timer = 30; sendToESP32(sig.name, 'RED'); }
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
  sendToESP32(sig.name, color);
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

// ── REAL-TIME STATE (REST fallback) ──────────────────────────
app.get('/api/status', verify, (_req, res) => {
  res.json(buildStatePayload());
});

app.get('/api/logs', verify, (_req, res) => {
  const limit = parseInt((_req.query as any).limit) || 60;
  res.json(logs.slice(0, limit));
});

app.get('/api/routes/computed', (_req, res) => {
  // Public endpoint showing Dijkstra computed paths between all nodes
  const start = 'Dispatch Bay';
  const dest  = 'City Hospital';
  const path  = dijkstra(start, dest);
  res.json({ start, dest, path, weight: path.length - 1 });
});

app.get('/api/esp32', verify, (_req, res) => {
  res.json({
    connected: true,
    deviceId: 'ESP32-AERIS-001',
    ip: '192.168.1.45',
    firmware: 'v1.4.2',
    commands: esp32Log,
    signalStates: signals.map(s => ({ id: s.id, junction: s.junction, pin: `GPIO${parseInt(s.id.slice(1)) * 5}`, state: s.color })),
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
  esp32Log.splice(0, esp32Log.length);
  addLog('🔄 System hard reset by administrator', 'system');
  signals.forEach(s => sendToESP32(s.name, 'RED'));
  res.json({ success: true });
});

// ── STARTUP ──────────────────────────────────────────────────
addLog('🚀 AERIS backend started. JWT Auth active.', 'system');
addLog(`📡 Dijkstra graph loaded — ${Object.keys(CITY_GRAPH).length} nodes`, 'system');
addLog(`🔗 ESP32 controller configured at ${ESP32_HOST}`, 'system');
addLog(`📡 SSE real-time stream ready at /api/stream`, 'system');
addLog(`🔍 Detection system: Camera (YOLO) + Siren (Audio FFT)`, 'system');
addLog(`✅ Verification logic: Emergency ON AND (Camera OR Siren)`, 'system');

ROUTE_OPTIONS.forEach(r => {
  addLog(`🗺️  ${r.name}: ${r.nodes.join(' → ')} (${r.distance})`, 'info');
});

app.listen(PORT, () => {
  console.log(`\n✅ AERIS Backend: http://localhost:${PORT}`);
  console.log(`   Auth: JWT (bcrypt password hashing)`);
  console.log(`   Algorithm: Dijkstra on ${Object.keys(CITY_GRAPH).length}-node city graph`);
  console.log(`   Real-time: SSE at /api/stream`);
  console.log(`   Detection: Camera + Siren (Manual toggle available)`);
  console.log(`   Verification: Emergency ON AND (Camera OR Siren)`);
  console.log(`   ESP32 Target: ${ESP32_HOST}/signal\n`);
});
