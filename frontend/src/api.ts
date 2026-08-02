import axios from 'axios';
import type { AxiosInstance, AxiosError } from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Signal {
  id: string; name: string; junction: string;
  color: 'RED' | 'YELLOW' | 'GREEN'; timer: number; manualOverride: boolean;
}

export interface RouteOption {
  id: string; name: string; nodes: string[]; distance: string; estimatedTime: number;
}

export interface AmbulanceSession {
  rid: string; driverId: string;
  route: string[]; routeName: string;
  currentNodeIndex: number;
  currentGPS: [number, number];
  cameraDetected: boolean; cameraConfidence: number;
  sirenDetected: boolean; sirenFrequency: number;
  isVerified: boolean; startedAt: string;
  ticksSinceAdvance: number;
  status: 'active' | 'arrived' | 'cancelled';
  patient: {
    condition: string;
    severity: 'critical' | 'serious' | 'stable';
    requiredDepartment: string;
    notes: string;
  };
  hospitalAcknowledged: boolean;
  hospitalAcknowledgedAt: string | null;
  prepTasks: { id: string; label: string; done: boolean }[];
}

export interface SystemState {
  sessions: AmbulanceSession[];
  signals: Signal[];
  routes: RouteOption[];
  systemLoad: number;
  apiLatency: number;
  totalCompleted: number;
  signalCommandLog: { signal: string; color: string; ts: string; ack: boolean }[];
}

export interface LogEntry {
  id: string; timestamp: string; message: string;
  type: 'info' | 'warning' | 'success' | 'error' | 'system';
  sessionRID?: string;
}

export interface AuthUser {
  sub: string; name: string; role: string; username: string;
}

export interface SignalEngineStatus {
  connected: boolean;
  engineId: string;
  version: string;
  uptime?: number;
  commands?: any[];
  totalCommands?: number;
  signals?: { name: string; state: string; lastUpdate?: string; commandsReceived?: number }[];
  commandLog?: { ts: string; signal: string; color: string }[];
}

export interface DetectionToggleResponse {
  success: boolean;
  cameraDetected?: boolean;
  cameraConfidence?: number;
  sirenDetected?: boolean;
  sirenFrequency?: number;
  isVerified: boolean;
  verificationStatus: {
    emergencyActive: boolean;
    cameraDetected: boolean;
    sirenDetected: boolean;
    isVerified: boolean;
  };
}

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

// ─── Auth token management ────────────────────────────────────────────────────
const TOKEN_KEY = 'aeris_token';

export const authStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// ─── Axios instance with enhanced configuration ───────────────────────────────
const http: AxiosInstance = axios.create({ 
  baseURL: 'http://localhost:4000/api',
  timeout: 10000, // 10 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Attach JWT to every request
http.interceptors.request.use(
  config => {
    const token = authStore.get();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors globally
http.interceptors.response.use(
  response => response,
  (error: AxiosError) => {
    // Handle 401 Unauthorized - clear token and redirect to login
    if (error.response?.status === 401) {
      authStore.clear();
      window.location.href = '/';
      return Promise.reject(new Error('Session expired. Please login again.'));
    }

    // Handle network errors
    if (!error.response) {
      console.error('Network error:', error.message);
      return Promise.reject(new Error('Network error. Please check your connection.'));
    }

    // Handle other HTTP errors
    const apiError: ApiError = {
      message: (error.response?.data as any)?.error || error.message || 'An error occurred',
      status: error.response?.status,
      code: error.code,
    };

    console.error('API Error:', apiError);
    return Promise.reject(apiError);
  }
);

// ─── Error handler utility ────────────────────────────────────────────────────
export const handleApiError = (error: any): string => {
  if (error.message) return error.message;
  if (error.response?.data?.error) return error.response.data.error;
  if (error.response?.statusText) return error.response.statusText;
  return 'An unexpected error occurred';
};

// ─── API functions with error handling ────────────────────────────────────────

// Authentication
export const loginUser = async (username: string, password: string): Promise<{ token: string; user: AuthUser }> => {
  try {
    const res = await http.post('/auth/login', { username, password });
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const logoutUser = async (): Promise<void> => {
  try {
    await http.post('/auth/logout');
  } catch (error) {
    console.error('Logout error:', error);
    // Don't throw - logout should always succeed locally
  }
};

export const getMe = async (): Promise<AuthUser> => {
  try {
    const res = await http.get('/auth/me');
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

// System State
export const fetchStatus = async (): Promise<SystemState> => {
  try {
    const res = await http.get('/status');
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const fetchLogs = async (limit = 60): Promise<LogEntry[]> => {
  try {
    const res = await http.get(`/logs?limit=${limit}`);
    return res.data;
  } catch (error) {
    console.error('Fetch logs error:', error);
    return []; // Return empty array on error
  }
};

// Routes
export const fetchRoutes = async (): Promise<RouteOption[]> => {
  try {
    const res = await http.get('/routes');
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

// Emergency Management
export interface PatientInfo {
  condition: string;
  severity: 'critical' | 'serious' | 'stable';
  requiredDepartment: string;
  notes: string;
}

export const startEmergency = async (routeId: string, patient?: PatientInfo): Promise<{ rid: string; route: string[]; routeName: string; patient: PatientInfo }> => {
  try {
    const res = await http.post('/emergency/start', { routeId, patient });
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const acknowledgeEmergency = async (rid: string): Promise<{ success: boolean; hospitalAcknowledged: boolean; hospitalAcknowledgedAt: string }> => {
  try {
    const res = await http.post(`/emergency/${rid}/acknowledge`);
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const togglePrepTask = async (rid: string, taskId: string, done: boolean): Promise<{ success: boolean; prepTasks: { id: string; label: string; done: boolean }[] }> => {
  try {
    const res = await http.post(`/emergency/${rid}/prep`, { taskId, done });
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const stopEmergency = async (rid: string): Promise<{ success: boolean }> => {
  try {
    const res = await http.post('/emergency/stop', { rid });
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

// Signal Control
export const overrideSignal = async (signalId: string, color: string): Promise<{ success: boolean; signal: Signal }> => {
  try {
    const res = await http.post('/signal/override', { signalId, color });
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

// Detection System
export const toggleCameraDetection = async (rid: string): Promise<DetectionToggleResponse> => {
  try {
    const res = await http.post('/detect/camera/toggle', { rid });
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const toggleSirenDetection = async (rid: string): Promise<DetectionToggleResponse> => {
  try {
    const res = await http.post('/detect/siren/toggle', { rid });
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const detectCamera = async (rid: string): Promise<{ detected: boolean; confidence: number; class: string }> => {
  try {
    const res = await http.post('/detect/camera', { rid });
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

// Real YOLO detection - sends an actual captured frame (e.g. from a file
// input or a <canvas> snapshot) to be run through your trained best.onnx
// model via the detection microservice. Falls back gracefully server-side
// to the old simulated behavior if the detection service is unreachable.
export interface RealDetectionResult {
  detected: boolean;
  confidence: number;
  sirenDetected: boolean;
  sirenConfidence: number;
  combinedStatus: 'high_confidence' | 'partial' | 'unverified';
  boundingBox: { x1: number; y1: number; x2: number; y2: number } | null;
  allDetections: { class: string; classId: number; confidence: number; box: any }[];
}

export const detectCameraReal = async (rid: string, frameFile: File | Blob): Promise<RealDetectionResult> => {
  const frameBase64 = await blobToBase64(frameFile);
  try {
    const res = await http.post('/detect/camera', { rid, frameBase64 });
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

// Real FFT-based audio siren detection - sends an actual WAV clip to be
// analyzed for the characteristic siren sweep pattern (see
// detection-service/siren_detector.py). Falls back gracefully server-side
// if the detection service is unreachable.
export const detectSirenReal = async (rid: string, audioFile: File | Blob): Promise<{ sirenDetected: boolean; confidence: number; energyRatio?: number; periodicityScore?: number }> => {
  const audioBase64 = await blobToBase64(audioFile);
  try {
    const res = await http.post('/detect/siren', { rid, audioBase64 });
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip the data:image/...;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Roadblock reporting (Section 9 of the spec) ─────────────────────────
export interface RoadblockList { blocked: [string, string][]; }

export const listRoadblocks = async (): Promise<RoadblockList> => {
  try {
    const res = await http.get('/roadblock');
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const reportRoadblock = async (from: string, to: string): Promise<RoadblockList & { success: boolean }> => {
  try {
    const res = await http.post('/roadblock', { from, to });
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const clearRoadblock = async (from: string, to: string): Promise<RoadblockList & { success: boolean }> => {
  try {
    const res = await http.delete('/roadblock', { data: { from, to } });
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const detectSiren = async (rid: string, frequency?: number): Promise<{ detected: boolean; frequency: number; threshold: number }> => {
  try {
    const res = await http.post('/detect/siren', { rid, frequency });
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

// Signal control engine (pure software - see backend/signal-controller-sim.ts)
export const fetchSignalEngine = async (): Promise<SignalEngineStatus> => {
  try {
    const res = await http.get('/signal-engine');
    return res.data;
  } catch (error) {
    console.error('Fetch signal engine error:', error);
    throw new Error(handleApiError(error));
  }
};

// Admin Functions
export const resetSystem = async (): Promise<{ success: boolean }> => {
  try {
    const res = await http.post('/system/reset');
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const deleteSession = async (rid: string): Promise<{ success: boolean }> => {
  try {
    const res = await http.delete(`/session/${rid}`);
    return res.data;
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

// ─── Health Check ─────────────────────────────────────────────────────────────
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    await http.get('/status', { timeout: 3000 });
    return true;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
};
