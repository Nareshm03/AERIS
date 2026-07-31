import { useEffect, useState, useCallback, useRef } from 'react';
import { authStore } from '../api';
import type { SystemState, LogEntry } from '../api';

// ─── Server-Sent Events hook with enhanced error handling ────────────────────
// Connects to /api/stream for real-time server push (no polling needed)
export function useSSE() {
  const [state, setState]     = useState<SystemState | null>(null);
  const [logs, setLogs]       = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 2000; // 2 seconds

  const connect = useCallback(() => {
    const token = authStore.get();
    if (!token) {
      console.warn('SSE: No auth token available');
      setError('Authentication required');
      return;
    }

    // Clear any existing connection
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    console.log('SSE: Connecting to real-time stream...');
    const es = new EventSource(`http://localhost:4000/api/stream?token=${token}`);
    esRef.current = es;

    es.onopen = () => {
      console.log('SSE: Connected successfully');
      setConnected(true);
      setError(null);
      setReconnectAttempts(0);
    };

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; data: any };
        
        if (msg.type === 'state') {
          // Update system state (ambulance positions, signals, etc.)
          const newState = msg.data as SystemState;
          setState(newState);
          
          // Log state updates for debugging
          if (newState.sessions.length > 0) {
            console.log('SSE: State update -', {
              sessions: newState.sessions.length,
              activeSignals: newState.signals.filter(s => s.color === 'GREEN').length,
              systemLoad: newState.systemLoad
            });
          }
        } else if (msg.type === 'log') {
          // Update logs
          if (Array.isArray(msg.data)) {
            // Initial log batch
            setLogs(msg.data as LogEntry[]);
            console.log('SSE: Received initial logs -', msg.data.length, 'entries');
          } else {
            // Single log entry
            setLogs(prev => [msg.data as LogEntry, ...prev].slice(0, 100));
          }
        } else if (msg.type === 'ping') {
          // Heartbeat - keep connection alive
          console.log('SSE: Heartbeat received');
        } else {
          console.warn('SSE: Unknown message type:', msg.type);
        }
      } catch (err) {
        console.error('SSE: Failed to parse message:', err, event.data);
      }
    };

    es.onerror = (event) => {
      console.error('SSE: Connection error', event);
      setConnected(false);
      es.close();
      esRef.current = null;

      // Implement exponential backoff for reconnection
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = Math.min(baseReconnectDelay * Math.pow(1.5, reconnectAttempts), 30000);
        setError(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`);
        console.log(`SSE: Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          connect();
        }, delay);
      } else {
        setError('Connection failed. Please refresh the page.');
        console.error('SSE: Max reconnection attempts reached');
      }
    };
  }, [reconnectAttempts]);

  useEffect(() => {
    connect();
    
    return () => {
      console.log('SSE: Cleaning up connection');
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    console.log('SSE: Manual reconnect triggered');
    setReconnectAttempts(0);
    connect();
  }, [connect]);

  return { state, logs, connected, error, reconnect };
}

// ─── Polling fallback hook (for pages that need simple polling) ──────────────
import { fetchStatus, fetchLogs as apiFetchLogs } from '../api';

export function useStatusPoll(intervalMs = 2500) {
  const [state, setState] = useState<SystemState | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { 
      setState(await fetchStatus()); 
      setError(false); 
    } catch (err) { 
      console.error('Status poll error:', err);
      setError(true); 
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { state, error, loading, refresh };
}

export function useLogsPoll(intervalMs = 2500) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const poll = async () => {
      try { 
        setLogs(await apiFetchLogs()); 
      } catch (err) { 
        console.error('Logs poll error:', err);
      } finally {
        setLoading(false);
      }
    };
    poll();
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return { logs, loading };
}
