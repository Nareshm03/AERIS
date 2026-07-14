/**
 * AERIS – ESP32 Hardware Simulator
 * ──────────────────────────────────────────────────────────────
 * Runs on port 4001 — simulates the ESP32 that controls physical
 * traffic signal LEDs via GPIO pins.
 *
 * In a real deployment:
 *   • Replace this file with actual ESP32 firmware (Arduino/MicroPython)
 *   • The backend sends HTTP POST requests to http://<esp32-ip>/signal
 *   • ESP32 toggles GPIO pins connected to signal relay board
 *   • GPIO mapping: Signal A → GPIO5, B → GPIO10, C → GPIO15...
 *
 * Signal → GPIO mapping:
 *   Signal A (Junction A)       → GREEN:GPIO5  YELLOW:GPIO6  RED:GPIO7
 *   Signal B (Junction B)       → GREEN:GPIO10 YELLOW:GPIO11 RED:GPIO12
 *   Signal C (Central Junction) → GREEN:GPIO15 YELLOW:GPIO16 RED:GPIO17
 *   Signal D (Medical Zone)     → GREEN:GPIO20 YELLOW:GPIO21 RED:GPIO22
 *   Signal E (Ring Road)        → GREEN:GPIO25 YELLOW:GPIO26 RED:GPIO27
 *   Signal F (North Gate)       → GREEN:GPIO30 YELLOW:GPIO31 RED:GPIO32
 */
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

type SignalState = 'RED' | 'YELLOW' | 'GREEN';
type GPIOState   = { pin: number; on: boolean };

interface SignalRecord {
  name: string;
  state: SignalState;
  lastUpdate: string;
  gpios: { green: number; yellow: number; red: number };
  commandsReceived: number;
}

const GPIO_MAP: Record<string, { green: number; yellow: number; red: number }> = {
  'Signal A': { green: 5,  yellow: 6,  red: 7  },
  'Signal B': { green: 10, yellow: 11, red: 12 },
  'Signal C': { green: 15, yellow: 16, red: 17 },
  'Signal D': { green: 20, yellow: 21, red: 22 },
  'Signal E': { green: 25, yellow: 26, red: 27 },
  'Signal F': { green: 30, yellow: 31, red: 32 },
};

const signalStates: Record<string, SignalRecord> = {};

// Initialize all signals to RED
Object.entries(GPIO_MAP).forEach(([name, gpios]) => {
  signalStates[name] = { name, state: 'RED', lastUpdate: new Date().toISOString(), gpios, commandsReceived: 0 };
});

const commandLog: { ts: string; signal: string; color: string; gpioSet: string }[] = [];
let totalCommands = 0;

// POST /signal  — AERIS backend sends signal commands here
app.post('/signal', (req, res) => {
  const { signal, color } = req.body as { signal: string; color: SignalState };

  if (!signal || !color) { res.status(400).json({ error: 'signal and color required' }); return; }
  if (!['RED', 'YELLOW', 'GREEN'].includes(color)) { res.status(400).json({ error: 'Invalid color' }); return; }

  // Update state
  const rec = signalStates[signal];
  if (rec) { rec.state = color; rec.lastUpdate = new Date().toISOString(); rec.commandsReceived++; }
  else {
    // Unknown signal — add dynamically
    signalStates[signal] = { name: signal, state: color, lastUpdate: new Date().toISOString(), gpios: { green: 0, yellow: 0, red: 0 }, commandsReceived: 1 };
  }

  totalCommands++;
  const gpios = GPIO_MAP[signal];
  const gpioSet = gpios
    ? `GPIO${gpios.green}=${color === 'GREEN' ? 'HIGH' : 'LOW'}, GPIO${gpios.yellow}=${color === 'YELLOW' ? 'HIGH' : 'LOW'}, GPIO${gpios.red}=${color === 'RED' ? 'HIGH' : 'LOW'}`
    : 'GPIO: not mapped';

  const entry = { ts: new Date().toISOString(), signal, color, gpioSet };
  commandLog.unshift(entry);
  if (commandLog.length > 100) commandLog.pop();

  console.log(`[ESP32] ${signal} → ${color.padEnd(6)} | ${gpioSet}`);

  res.json({
    ok: true, signal, color, gpio: gpios,
    message: `GPIO updated — ${gpioSet}`,
  });
});

// GET /status  — Backend or admin can query ESP32 current state
app.get('/status', (_req, res) => {
  res.json({
    deviceId:    'ESP32-AERIS-001',
    firmware:    'v1.4.2',
    ip:          '192.168.1.45',
    uptime:      process.uptime(),
    totalCommands,
    signals:     Object.values(signalStates),
    commandLog:  commandLog.slice(0, 30),
  });
});

// GET /health — Simple ping endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'online', ts: new Date().toISOString() });
});

app.listen(4001, () => {
  console.log('\n✅ ESP32 Simulator: http://localhost:4001');
  console.log('   POST /signal             — receive signal commands');
  console.log('   GET  /status             — current GPIO states');
  console.log('   GET  /health             — device ping\n');
  Object.entries(GPIO_MAP).forEach(([sig, g]) => {
    console.log(`   ${sig.padEnd(12)} → GPIO${g.green}(G) GPIO${g.yellow}(Y) GPIO${g.red}(R)`);
  });
  console.log('');
});
