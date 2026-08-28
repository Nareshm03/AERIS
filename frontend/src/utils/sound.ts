// Sound notification system for AERIS
const SOUND_PREF_KEY = 'aeris-sound-enabled';

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem(SOUND_PREF_KEY);
  return stored === null ? true : stored === 'true'; // on by default
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SOUND_PREF_KEY, String(enabled));
}

export class SoundManager {
  private audioContext: AudioContext | null = null;

  // Lazily created and resumed on first real use, rather than at module
  // load time - browsers suspend an AudioContext created before any user
  // gesture (click/keypress), and this module used to construct one
  // immediately on import, which would silently do nothing in most
  // browsers rather than actually playing anything.
  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioContext) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      this.audioContext = new Ctor();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => { /* still no user gesture yet - fine, next call retries */ });
    }
    return this.audioContext;
  }

  // Play emergency siren sound
  playEmergencyAlert() {
    if (!isSoundEnabled()) return;
    const ctx = this.getContext();
    if (!ctx) return;
    
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.setValueAtTime(800, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3);
    oscillator.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.6);
    
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.6);
  }

  // Play success notification
  playSuccess() {
    if (!isSoundEnabled()) return;
    const ctx = this.getContext();
    if (!ctx) return;
    
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.setValueAtTime(523.25, ctx.currentTime);
    oscillator.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);
    
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  }

  // Play warning beep
  playWarning() {
    if (!isSoundEnabled()) return;
    const ctx = this.getContext();
    if (!ctx) return;
    
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.setValueAtTime(440, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.2);
  }
}

export const soundManager = new SoundManager();
