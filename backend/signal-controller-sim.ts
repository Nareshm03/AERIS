/**
 * AERIS – Traffic Signal Control Engine (software simulation)
 * ──────────────────────────────────────────────────────────────
 * Runs on port 4001. This is the software component responsible for
 * traffic signal state - it receives signal commands from the main
 * backend (green corridor activation, manual police override, roadblock
 * rerouting) and tracks each signal's current color and command history.
 *
 * This project is entirely software - there is no physical signal hardware
 * anywhere in this system. This engine models exactly what a real signal
 * controller would need to do (receive a color command, track state,
 * report status), so the interface is realistic without requiring or
 * assuming any physical device.
 */
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

type SignalColor = 'RED' | 'YELLOW' | 'GREEN';

interface SignalRecord {
  name: string;
  state: SignalColor;
  lastUpdate: string;
  commandsReceived: number;
}

const KNOWN_SIGNALS = ['Signal A', 'Signal B', 'Signal C', 'Signal D', 'Signal E', 'Signal F'];

const signalStates: Record<string, SignalRecord> = {};

// Initialize all known signals to RED
KNOWN_SIGNALS.forEach(name => {
  signalStates[name] = { name, state: 'RED', lastUpdate: new Date().toISOString(), commandsReceived: 0 };
});

const commandLog: { ts: string; signal: string; color: string }[] = [];
let totalCommands = 0;

// POST /signal — AERIS backend sends signal commands here
app.post('/signal', (req, res) => {
  const { signal, color } = req.body as { signal: string; color: SignalColor };

  if (!signal || !color) { res.status(400).json({ error: 'signal and color required' }); return; }
  if (!['RED', 'YELLOW', 'GREEN'].includes(color)) { res.status(400).json({ error: 'Invalid color' }); return; }

  const rec = signalStates[signal];
  if (rec) { rec.state = color; rec.lastUpdate = new Date().toISOString(); rec.commandsReceived++; }
  else {
    // Unknown signal — add dynamically
    signalStates[signal] = { name: signal, state: color, lastUpdate: new Date().toISOString(), commandsReceived: 1 };
  }

  totalCommands++;
  const entry = { ts: new Date().toISOString(), signal, color };
  commandLog.unshift(entry);
  if (commandLog.length > 100) commandLog.pop();

  console.log(`[SignalEngine] ${signal} → ${color}`);

  res.json({ ok: true, signal, color, message: `Signal ${signal} set to ${color}` });
});

// GET /status — Backend or admin can query the signal engine's current state
app.get('/status', (_req, res) => {
  res.json({
    engineId: 'AERIS-SIGNAL-ENGINE-001',
    version: 'v1.4.2',
    uptime: process.uptime(),
    totalCommands,
    signals: Object.values(signalStates),
    commandLog: commandLog.slice(0, 30),
  });
});

// GET /health — Simple ping endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'online', ts: new Date().toISOString() });
});

app.listen(4001, () => {
  console.log('\n✅ Signal Control Engine: http://localhost:4001');
  console.log('   POST /signal   — receive signal commands');
  console.log('   GET  /status   — current signal states');
  console.log('   GET  /health   — engine ping\n');
  KNOWN_SIGNALS.forEach(sig => console.log(`   ${sig.padEnd(12)} → RED (initial)`));
  console.log('');
});
