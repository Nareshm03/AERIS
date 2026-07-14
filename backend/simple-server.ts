import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

const logs: { timestamp: string; message: string }[] = [];

function addLog(message: string) {
  logs.push({ timestamp: new Date().toISOString(), message });
}

// In-memory state as requested
const state = {
  emergencyActive: false,
  ambulancePositionIndex: 0,
  detectionStatus: {
    camera: false,
    siren: false,
  },
  signals: [
    { id: 'S1', color: 'RED' },
    { id: 'S2', color: 'RED' },
    { id: 'S3', color: 'RED' }
  ]
};

// Login
app.post('/login', (req, res) => {
  const { username } = req.body;
  addLog(`User login: ${username || 'Unknown'}`);
  res.json({ success: true, message: 'Logged in' });
});

// Start Emergency
app.post('/emergency/start', (req, res) => {
  state.emergencyActive = true;
  state.ambulancePositionIndex = 0;
  addLog('Emergency activated. Routing ambulance.');
  
  // Set signals to green corridor
  state.signals.forEach(s => s.color = 'GREEN');
  addLog('Signal changes: updating corridor to GREEN.');

  // Dummy simulation info
  state.detectionStatus.camera = true;
  state.detectionStatus.siren = true;
  addLog('Detection update: Camera and Siren sensors detected ambulance.');

  res.json({ success: true, message: 'Emergency started', state });
});

// Stop Emergency
app.post('/emergency/stop', (req, res) => {
  state.emergencyActive = false;
  state.ambulancePositionIndex = 0;
  addLog('Emergency stopped manually.');

  // Restore normal signals
  state.signals.forEach(s => s.color = 'RED');
  addLog('Signal changes: restoring corridor signals to RED.');

  state.detectionStatus.camera = false;
  state.detectionStatus.siren = false;
  addLog('Detection update: Camera and Siren tracking suspended.');
  
  res.json({ success: true, message: 'Emergency stopped', state });
});

// Get logs
app.get('/logs', (req, res) => {
  res.json(logs);
});

// Get status
app.get('/status', (req, res) => {
  if (state.emergencyActive) {
    state.ambulancePositionIndex++;
  }
  res.json(state);
});

app.listen(PORT, () => {
  console.log(`Simple backend listening on http://localhost:${PORT}`);
});
