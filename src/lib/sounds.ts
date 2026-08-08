/* ── GaGa Chat Sound + Vibration Engine ───────────
   Web Audio API + Navigator Vibration API
   Multiple sound profiles, autoplay-safe, quiet-hours aware.
   ─────────────────────────────────────────────── */

let audioCtx: AudioContext | null = null;
let globalEnabled = true;
let activeRingtone: { stop: () => void } | null = null;

export type SoundProfile = 'gaga' | 'classic' | 'minimal' | 'playful';

/* ── Helpers ─────────────────────────────────── */

function getCtx(): AudioContext | null {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

export async function resumeAudio(): Promise<void> {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
      /* initialized */
    } catch {
      /* noop — user hasn't interacted yet */
    }
  } else {
    /* initialized */
  }
}

function now(): number {
  const ctx = getCtx();
  return ctx ? ctx.currentTime : 0;
}

function playTone({
  freq,
  duration,
  type = 'sine',
  attack = 0.01,
  decay = 0.01,
  volume = 0.3,
  detune = 0,
  delay = 0,
}: {
  freq: number;
  duration: number;
  type?: OscillatorType;
  attack?: number;
  decay?: number;
  volume?: number;
  detune?: number;
  delay?: number;
}) {
  const ctx = getCtx();
  if (!ctx || !globalEnabled || isQuietHours()) return;
  const t = now() + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (detune) osc.detune.setValueAtTime(detune, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration - decay);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

function playDualTone({
  freq1,
  freq2,
  duration,
  volume = 0.25,
  delay = 0,
}: {
  freq1: number;
  freq2: number;
  duration: number;
  volume?: number;
  delay?: number;
}) {
  playTone({ freq: freq1, duration, volume: volume * 0.7, delay });
  playTone({ freq: freq2, duration: duration * 0.9, volume: volume * 0.5, type: 'triangle', delay: delay + 0.03 });
}

/* ── Sound Profile Definitions ────────────────── */

interface ProfileSounds {
  messageReceived: () => void;
  messageSent: () => void;
  notification: () => void;
  friendRequest: () => void;
  timeline: () => void;
  error: () => void;
}

const profiles: Record<SoundProfile, ProfileSounds> = {
  gaga: {
    messageReceived: () => {
      playDualTone({ freq1: 830, freq2: 1245, duration: 0.15, volume: 0.25, delay: 0 });
      playDualTone({ freq1: 660, freq2: 990, duration: 0.2, volume: 0.2, delay: 0.12 });
    },
    messageSent: () => {
      playTone({ freq: 880, duration: 0.08, volume: 0.15, type: 'sine' });
      playTone({ freq: 1100, duration: 0.06, volume: 0.1, type: 'sine', delay: 0.05 });
    },
    notification: () => {
      playTone({ freq: 700, duration: 0.08, volume: 0.2, type: 'sine' });
      playTone({ freq: 900, duration: 0.1, volume: 0.18, type: 'sine', delay: 0.06 });
      playTone({ freq: 1200, duration: 0.12, volume: 0.15, type: 'sine', delay: 0.14 });
    },
    friendRequest: () => {
      playTone({ freq: 660, duration: 0.1, volume: 0.2, type: 'sine' });
      playTone({ freq: 880, duration: 0.1, volume: 0.2, type: 'sine', delay: 0.08 });
      playTone({ freq: 1100, duration: 0.15, volume: 0.18, type: 'sine', delay: 0.16 });
    },
    timeline: () => {
      playTone({ freq: 800, duration: 0.06, volume: 0.18, type: 'sine' });
      playTone({ freq: 1000, duration: 0.08, volume: 0.15, type: 'sine', delay: 0.05 });
    },
    error: () => {
      playTone({ freq: 200, duration: 0.2, volume: 0.2, type: 'sawtooth' });
    },
  },
  classic: {
    messageReceived: () => {
      playTone({ freq: 600, duration: 0.2, volume: 0.3, type: 'sine' });
      playTone({ freq: 600, duration: 0.2, volume: 0.3, type: 'sine', delay: 0.3 });
    },
    messageSent: () => {
      playTone({ freq: 1000, duration: 0.15, volume: 0.2, type: 'sine' });
    },
    notification: () => {
      playTone({ freq: 800, duration: 0.2, volume: 0.25, type: 'sine' });
      playTone({ freq: 800, duration: 0.2, volume: 0.25, type: 'sine', delay: 0.25 });
    },
    friendRequest: () => {
      playTone({ freq: 523, duration: 0.3, volume: 0.25, type: 'sine' });
      playTone({ freq: 659, duration: 0.3, volume: 0.25, type: 'sine', delay: 0.2 });
      playTone({ freq: 784, duration: 0.3, volume: 0.25, type: 'sine', delay: 0.4 });
    },
    timeline: () => {
      playTone({ freq: 750, duration: 0.15, volume: 0.2, type: 'sine' });
      playTone({ freq: 750, duration: 0.15, volume: 0.2, type: 'sine', delay: 0.2 });
    },
    error: () => {
      playTone({ freq: 150, duration: 0.3, volume: 0.25, type: 'sawtooth' });
      playTone({ freq: 150, duration: 0.3, volume: 0.25, type: 'sawtooth', delay: 0.35 });
    },
  },
  minimal: {
    messageReceived: () => {
      playTone({ freq: 900, duration: 0.05, volume: 0.15, type: 'sine' });
    },
    messageSent: () => {
      playTone({ freq: 900, duration: 0.03, volume: 0.1, type: 'sine' });
    },
    notification: () => {
      playTone({ freq: 700, duration: 0.05, volume: 0.15, type: 'sine' });
    },
    friendRequest: () => {
      playTone({ freq: 800, duration: 0.08, volume: 0.15, type: 'sine' });
    },
    timeline: () => {
      playTone({ freq: 750, duration: 0.04, volume: 0.12, type: 'sine' });
    },
    error: () => {
      playTone({ freq: 250, duration: 0.1, volume: 0.15, type: 'sawtooth' });
    },
  },
  playful: {
    messageReceived: () => {
      playTone({ freq: 1100, duration: 0.06, volume: 0.2, type: 'sine' });
      playTone({ freq: 1400, duration: 0.06, volume: 0.2, type: 'sine', delay: 0.06 });
      playTone({ freq: 1700, duration: 0.08, volume: 0.18, type: 'sine', delay: 0.12 });
    },
    messageSent: () => {
      playTone({ freq: 1200, duration: 0.05, volume: 0.15, type: 'sine' });
      playTone({ freq: 1500, duration: 0.05, volume: 0.12, type: 'sine', delay: 0.04 });
    },
    notification: () => {
      playTone({ freq: 1000, duration: 0.06, volume: 0.2, type: 'sine' });
      playTone({ freq: 1300, duration: 0.06, volume: 0.18, type: 'sine', delay: 0.05 });
      playTone({ freq: 1600, duration: 0.08, volume: 0.15, type: 'sine', delay: 0.11 });
    },
    friendRequest: () => {
      playTone({ freq: 900, duration: 0.08, volume: 0.2, type: 'sine' });
      playTone({ freq: 1200, duration: 0.08, volume: 0.2, type: 'sine', delay: 0.06 });
      playTone({ freq: 1500, duration: 0.1, volume: 0.18, type: 'sine', delay: 0.14 });
      playTone({ freq: 1800, duration: 0.12, volume: 0.15, type: 'sine', delay: 0.22 });
    },
    timeline: () => {
      playTone({ freq: 1100, duration: 0.05, volume: 0.18, type: 'sine' });
      playTone({ freq: 1400, duration: 0.06, volume: 0.15, type: 'sine', delay: 0.04 });
    },
    error: () => {
      playTone({ freq: 300, duration: 0.12, volume: 0.2, type: 'sawtooth' });
      playTone({ freq: 250, duration: 0.12, volume: 0.2, type: 'sawtooth', delay: 0.15 });
    },
  },
};

function getSettings() {
  try {
    const raw = localStorage.getItem('gaga-settings');
    if (!raw) return {};
    return JSON.parse(raw)?.state?.settings?.notifications ?? {};
  } catch {
    return {};
  }
}

function getActiveProfile(): SoundProfile {
  return getSettings().soundProfile || 'gaga';
}

function getProfileSounds(): ProfileSounds {
  return profiles[getActiveProfile()];
}

/* ── Public API ──────────────────────────────── */

export function setSoundEnabled(enabled: boolean) {
  globalEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return globalEnabled;
}

export function stopAllSounds() {
  if (activeRingtone) {
    activeRingtone.stop();
    activeRingtone = null;
  }
  const ctx = getCtx();
  if (ctx) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.connect(ctx.destination);
    gain.disconnect();
  }
}

/* ── Message Sounds (profile-based) ──────────── */

export function playMessageReceived() {
  getProfileSounds().messageReceived();
}

export function playMessageSent() {
  getProfileSounds().messageSent();
}

/* ── Call Sounds (profile-independent) ──────── */

export function playIncomingCall(): { stop: () => void } {
  const ctx = getCtx();
  if (!ctx || !globalEnabled || !areCallSoundsEnabled() || isQuietHours()) return { stop: () => {} };

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.35, ctx.currentTime);
  masterGain.connect(ctx.destination);

  let running = true;
  const intervals: ReturnType<typeof setInterval>[] = [];

  const playRing = () => {
    if (!running) return;
    const t = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(440, t);
    osc1.frequency.linearRampToValueAtTime(660, t + 0.2);
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(0.35, t + 0.05);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc1.connect(g1);
    g1.connect(masterGain);
    osc1.start(t);
    osc1.stop(t + 0.4);

    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, t + 0.5);
    osc2.frequency.linearRampToValueAtTime(1100, t + 0.7);
    g2.gain.setValueAtTime(0, t + 0.5);
    g2.gain.linearRampToValueAtTime(0.3, t + 0.55);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc2.connect(g2);
    g2.connect(masterGain);
    osc2.start(t + 0.5);
    osc2.stop(t + 0.9);
  };

  playRing();
  const interval = setInterval(playRing, 2500);
  intervals.push(interval);

  const stop = () => {
    running = false;
    intervals.forEach(clearInterval);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
    setTimeout(() => masterGain.disconnect(), 200);
  };

  activeRingtone = { stop };
  return { stop };
}

export function playOutgoingCall(): { stop: () => void } {
  const ctx = getCtx();
  if (!ctx || !globalEnabled || !areCallSoundsEnabled() || isQuietHours()) return { stop: () => {} };

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.2, ctx.currentTime);
  masterGain.connect(ctx.destination);

  let running = true;
  const intervals: ReturnType<typeof setInterval>[] = [];

  const playRingback = () => {
    if (!running) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.4);
  };

  playRingback();
  const interval = setInterval(playRingback, 2000);
  intervals.push(interval);

  const stop = () => {
    running = false;
    intervals.forEach(clearInterval);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
    setTimeout(() => masterGain.disconnect(), 200);
  };

  activeRingtone = { stop };
  return { stop };
}

export function playCallConnected() {
  if (!globalEnabled || !areCallSoundsEnabled() || isQuietHours()) return;
  playTone({ freq: 523, duration: 0.1, volume: 0.2, type: 'sine' });
  playTone({ freq: 659, duration: 0.1, volume: 0.2, type: 'sine', delay: 0.08 });
  playTone({ freq: 784, duration: 0.15, volume: 0.25, type: 'sine', delay: 0.16 });
}

export function playCallEnded() {
  if (!globalEnabled || !areCallSoundsEnabled() || isQuietHours()) return;
  playTone({ freq: 784, duration: 0.1, volume: 0.2, type: 'sine' });
  playTone({ freq: 659, duration: 0.1, volume: 0.2, type: 'sine', delay: 0.08 });
  playTone({ freq: 523, duration: 0.15, volume: 0.15, type: 'sine', delay: 0.16 });
}

/* ── Notification Sounds (profile-based) ────── */

export function playNotification() {
  getProfileSounds().notification();
}

export function playFriendRequest() {
  getProfileSounds().friendRequest();
}

export function playTimelineNotification() {
  getProfileSounds().timeline();
}

export function playErrorSound() {
  getProfileSounds().error();
}

/* ── Vibration ───────────────────────────────── */

export function isVibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

export function isVibrationEnabled(): boolean {
  return getSettings().vibrationEnabled !== false;
}

function vibrate(pattern: number | number[]) {
  if (!isVibrationSupported() || !isVibrationEnabled() || isQuietHours()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* noop */
  }
}

export function vibrateMessageReceived() {
  vibrate([30, 50, 30]);
}

export function vibrateMessageSent() {
  vibrate(15);
}

export function vibrateIncomingCall() {
  vibrate([800, 400, 800, 400, 800]);
}

export function vibrateOutgoingCall() {
  vibrate([400, 400, 400]);
}

export function vibrateCallConnected() {
  vibrate([100, 50, 100]);
}

export function vibrateCallEnded() {
  vibrate(200);
}

export function vibrateNotification() {
  vibrate([50, 100, 50]);
}

export function vibrateFriendRequest() {
  vibrate([50, 30, 50, 30, 50]);
}

export function vibrateError() {
  vibrate([80, 40, 80]);
}

/* ── Quiet Hours Check ───────────────────────── */

export function isQuietHours(): boolean {
  const notif = getSettings();
  if (!notif.quietHours) return false;
  const now = new Date();
  const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const start = notif.quietHoursStart || '22:00';
  const end = notif.quietHoursEnd || '07:00';
  return start <= end ? cur >= start && cur <= end : cur >= start || cur <= end;
}

export function areSoundsEnabled(): boolean {
  return getSettings().messageSound !== false;
}

export function areCallSoundsEnabled(): boolean {
  return getSettings().callSound !== false;
}

/* ── Auto-resume on first user interaction ─────── */

let interactionListenersAdded = false;

export function initAudioOnInteraction() {
  if (interactionListenersAdded) return;
  interactionListenersAdded = true;

  const resume = () => {
    resumeAudio();
  };

  window.addEventListener('click', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });
  window.addEventListener('touchstart', resume, { once: true });
}

/* ── Convenience: play with checks ────────────── */

export function safePlay(soundFn: () => void, vibrateFn?: () => void) {
  if (!globalEnabled || isQuietHours() || !areSoundsEnabled()) {
    vibrateFn?.();
    return;
  }
  resumeAudio().then(() => {
    setTimeout(() => { soundFn(); vibrateFn?.(); }, 50);
  }).catch(() => { vibrateFn?.(); });
}

export function safePlayCall(soundFn: () => void, vibrateFn?: () => void) {
  if (!globalEnabled || isQuietHours() || !areCallSoundsEnabled()) {
    vibrateFn?.();
    return;
  }
  resumeAudio().then(() => {
    setTimeout(() => { soundFn(); vibrateFn?.(); }, 50);
  }).catch(() => { vibrateFn?.(); });
}

/* ── Profile preview (for settings UI) ─────────── */

export function previewSound(profile: SoundProfile) {
  const p = profiles[profile];
  if (!p) return;
  resumeAudio().then(() => {
    p.messageReceived();
    setTimeout(() => p.messageSent(), 500);
  }).catch(() => {});
}
