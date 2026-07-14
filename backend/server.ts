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
const JWT_SECRET = 'AERIS_JWT_SECRET_2024_COLLEGE_PROJECT';
const ESP32_HOST = 'http://localhost:4001'; // ESP32 simulator
const PORT = 4000;

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
}

interface SSEClient {
  id: string; res: express.Response;
}

// ═══════════════════════════════════════════════════════════════
//  USERS (hashed passwords for real auth)
// ═══════════════════════════════════════════════════════════════
const USERS: Record<string, { id: string; name: string; role: UserRole; hash: string }> = {
  'driver':   { id: uuidv4(), name: 'Ravi Kumar',           role: 'driver',   hash: bcrypt.hashSync('driver123', 8) },
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

function dijkstra(start: string, end: string): string[] {
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
function simulateDetection(session: AmbulanceSession) {
  // Camera detection (YOLO concept — confidence varies realistically)
  const prevCam = session.cameraDetected;
  session.cameraConfidence = session.status === 'active'
    ? 82 + Math.floor(Math.random() * 15)   // 82-96% during active
    : Math.floor(Math.random() * 20);        // 0-20% at idle
  session.cameraDetected = session.cameraConfidence >= 75;

  // Siren detection (audio FFT — frequency varies)
  const prevSiren = session.sirenDetected;
  session.sirenFrequency = session.status === 'active'
    ? 850 + Math.floor(Math.random() * 200)  // 850-1050 Hz (active siren)
    : Math.floor(Math.random() * 100);        // 0-100 Hz (ambient)
  session.sirenDetected = session.sirenFrequency >= 700;

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
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// ── AUTH ──────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
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
  const { routeId } = req.body;

  // Check if this driver already has an active session
  const existingSession = [...sessions.values()].find(
    s => s.driverId === req.user.sub && s.status === 'active'
  );
  if (existingSession) {
    res.status(400).json({ error: 'You already have an active emergency session', rid: existingSession.rid });
    return;
  }

  const route = ROUTE_OPTIONS.find(r => r.id === routeId) || ROUTE_OPTIONS[0];
  const rid = `AMB-${uuidv4().slice(0, 6).toUpperCase()}`;

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
  };

  sessions.set(rid, session);
  addLog(`🚨 EMERGENCY ACTIVATED — RID: ${rid} (Driver: ${req.user.name})`, 'error', rid);
  addLog(`📍 Route computed via Dijkstra: ${route.nodes.join(' → ')}`, 'info', rid);
  addLog(`🔍 Initial verification: Camera ✓ Siren ✓`, 'success', rid);

  // Immediately send corridor to ESP32
  updateGreenCorridor();

  res.status(201).json({ rid, route: route.nodes, routeName: route.name });
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

// ── SIGNAL OVERRIDE (Police only) ────────────────────────────
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

// In a real system: camera sends frame here, processed by YOLO model
app.post('/api/detect/camera', verify, (req: any, res) => {
  const { rid } = req.body;
  const session = sessions.get(rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  // Simulate YOLO inference result (in real: process req.body.frame with YOLO)
  const confidence = session.status === 'active' ? 80 + Math.floor(Math.random() * 18) : Math.floor(Math.random() * 25);
  session.cameraConfidence = confidence;
  session.cameraDetected = confidence >= 75;
  res.json({ detected: session.cameraDetected, confidence, class: 'ambulance' });
});

// In a real system: siren sensor sends audio energy/frequency here
app.post('/api/detect/siren', verify, (req: any, res) => {
  const { rid, frequency } = req.body;
  const session = sessions.get(rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  // Use provided frequency from sensor, or simulate if not provided
  const freq = frequency ?? (session.status === 'active' ? 850 + Math.floor(Math.random() * 200) : Math.floor(Math.random() * 100));
  session.sirenFrequency = freq;
  session.sirenDetected = freq >= 700;
  res.json({ detected: session.sirenDetected, frequency: freq, threshold: 700 });
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
