/* ── GaGa Chat Sound + Vibration Engine ───────────
   Web Audio API + Navigator Vibration API
   Multiple sound profiles, autoplay-safe, quiet-hours aware.
   ─────────────────────────────────────────────── */

let audioCtx: AudioContext | null = null;
let globalEnabled = true;
let activeRingtone: { stop: () => void } | null = null;
// Chrome blocks AudioContext creation and navigator.vibrate() until the user
// has interacted with the page. Track that so we don't spam console errors.
let hasUserInteracted = false;

export type SoundProfile = 'gaga' | 'classic' | 'minimal' | 'playful';

/* ── Helpers ─────────────────────────────────── */

function getCtx(): AudioContext | null {
  // Chrome blocks AudioContext creation until the user has interacted with
  // the page. Don't create it (or spam console errors) before that.
  if (!hasUserInteracted) return null;
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
    const raw = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('gaga-settings') : null;
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

/* ── Custom MP3 Ringtone (Thug Life x GTA) ─── */

/**
 * URL-safe filename of the GTA ringtone asset deployed under /public.
 * The original filename was renamed from "Thug Life x GTA Ringtone __ ... .mp4"
 * to this slug for predictable fetching. MP4 is used here because mobile browsers
 * natively support MP4 audio (AAC) everywhere — and since the
 * original was provided as MP4, we avoid a re-encoding step at build time.
 */
const RINGTONE_SRC = '/gta-ringtone.mp4';

/**
 * Plays the GaGa Chat custom ringtone (Thug Life x GTA) from the
 * deployed asset. The returned controller is:
 *   - Preloads the asset via <audio preload="auto" so it starts instantly
 *   - Loops it for the entire ringback / incoming ring until stop() is called
 *   - If the asset load fails (network, CORS, 404) it immediately falls back to the
 *     synthesized WeChat-style ringtone (never silent)
 *   - Resumes a 1.2× boost on the GainNode to be audible in quiet environments
 */
function playCustomRingtone({
  loop = true,
  volume = 0.9,
  fallbackSynthesized,
}: {
  loop?: boolean;
  volume?: number;
  fallbackSynthesized?: () => { stop: () => void };
}): { stop: () => void } {
  if (typeof window === 'undefined') return { stop: () => { } };
  let fallback: { stop: () => void } | null = fallbackSynthesized?.() ?? null;
  let audio: HTMLAudioElement | null = null;
  let ctxGain: GainNode | null = null;
  let ctxSource: MediaElementAudioSourceNode | null = null;
  let stopped = false;
  try {
    audio = new Audio();
    audio.src = RINGTONE_SRC;
    audio.preload = 'auto';
    audio.loop = loop;
    audio.volume = volume;
    audio.crossOrigin = 'anonymous';
    // Route through Web Audio GainNode so audio-context unlock via
    // resumeAudio() also unlocks the ringtone (iOS Safari rules)
    const ctx = getCtx();
    if (ctx) {
      try {
        ctxGain = ctx.createGain();
        ctxGain.gain.value = 1.2;
        ctxGain.connect(ctx.destination);
        ctxSource = ctx.createMediaElementSource(audio);
        ctxSource.connect(ctxGain);
      } catch {
        ctxGain = null;
        ctxSource = null;
      }
    }
    let settled = false;
    const fallbackTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!settled && !stopped && !fallback && fallbackSynthesized) fallback = fallbackSynthesized();
    }, 1500);
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          settled = true;
          if (fallbackTimer) clearTimeout(fallbackTimer);
          if (fallback) { fallback.stop(); fallback = null; }
        })
        .catch(() => {
          settled = true;
          if (fallbackTimer) clearTimeout(fallbackTimer);
          if (!stopped && !fallback && fallbackSynthesized) fallback = fallbackSynthesized();
        });
    } else {
      settled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
    }
    audio.addEventListener('error', () => {
      if (!stopped && !fallback && fallbackSynthesized) fallback = fallbackSynthesized();
    });
  } catch {
    if (!fallback && fallbackSynthesized) fallback = fallbackSynthesized();
  }
  return {
    stop() {
      stopped = true;
      try {
        if (audio) {
          audio.pause();
          audio.src = '';
          audio.load();
        }
      } catch { /* noop */ }
      try { ctxGain?.disconnect(); } catch { /* noop */ }
      try { ctxSource?.disconnect(); } catch { /* noop */ }
      ctxGain = null;
      ctxSource = null;
      audio = null;
      if (fallback) { try { fallback.stop(); } catch { /* noop */ } }
      fallback = null;
    },
  };
}

/* ── Call Sounds (profile-independent) ──────── */

/**
 * (Synthesized fallback) WeChat-style incoming call ringtone — 15-second melodic phrase.
 */
function playIncomingCallSynth(): { stop: () => void } {
  const ctx = getCtx();
  if (!ctx || !globalEnabled || !areCallSoundsEnabled() || isQuietHours()) return { stop: () => { } };

  const RING_CYCLE_MS = 15000; // full melodic phrase length before it repeats

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.6, ctx.currentTime); // high volume ringtone
  masterGain.connect(ctx.destination);

  let running = true;
  let cycleTimer: ReturnType<typeof setInterval> | null = null;
  const scheduled: OscillatorNode[] = [];

  const PHRASE: Array<[number, number, number, number]> = [
    [0.00, 1046.5, 0.35, 0.50],
    [0.40, 783.99, 0.45, 0.50],
    [1.10, 1046.5, 0.35, 0.50],
    [1.50, 783.99, 0.60, 0.55],
    [2.40, 987.77, 0.35, 0.45],
    [2.80, 739.99, 0.45, 0.45],
    [3.50, 987.77, 0.35, 0.45],
    [3.90, 739.99, 0.60, 0.50],
    [4.90, 659.25, 0.30, 0.45],
    [5.25, 830.61, 0.30, 0.45],
    [5.60, 1046.5, 0.55, 0.55],
    [6.20, 1318.5, 0.70, 0.50],
    [7.20, 1046.5, 0.40, 0.40],
    [7.70, 880.00, 0.70, 0.40],
    [8.50, 1046.5, 0.90, 0.35],
  ];

  const playNote = (at: number, freq: number, dur: number, vol: number) => {
    if (!running) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);

    const overtone = ctx.createOscillator();
    const g2 = ctx.createGain();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(freq * 2, t);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(vol * 0.25, t + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7);
    overtone.connect(g2);
    g2.connect(masterGain);
    overtone.start(t);
    overtone.stop(t + dur);

    scheduled.push(osc, overtone);
  };

  const playPhrase = () => {
    if (!running) return;
    for (const [at, freq, dur, vol] of PHRASE) playNote(at, freq, dur, vol);
  };

  playPhrase();
  cycleTimer = setInterval(playPhrase, RING_CYCLE_MS);

  const stop = () => {
    running = false;
    if (cycleTimer) clearInterval(cycleTimer);
    for (const osc of scheduled) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    scheduled.length = 0;
    try {
      masterGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
    } catch { /* noop */ }
    setTimeout(() => masterGain.disconnect(), 200);
  };

  return { stop };
}

/**
 * (Synthesized fallback) WeChat-style ringback — soft "doo…" every 4s while waiting.
 */
function playOutgoingCallSynth(): { stop: () => void } {
  const ctx = getCtx();
  if (!ctx || !globalEnabled || !areCallSoundsEnabled() || isQuietHours()) return { stop: () => { } };

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.4, ctx.currentTime);
  masterGain.connect(ctx.destination);

  let running = true;
  const intervals: ReturnType<typeof setInterval>[] = [];

  const playRingback = () => {
    if (!running) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.05);
    g.gain.setValueAtTime(0.35, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 1.0);
  };

  playRingback();
  const interval = setInterval(playRingback, 4000);
  intervals.push(interval);

  const stop = () => {
    running = false;
    intervals.forEach(clearInterval);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
    setTimeout(() => masterGain.disconnect(), 200);
  };

  return { stop };
}

/**
 * Incoming call ringtone.
 *
 * Primary source = custom Thug Life x GTA MP4 asset (`/gta-ringtone.mp4`).
 * Falls back to the synthesized WeChat-style ringtone immediately if the
 * asset fails to load within 1.5s (network, 404, permission).
 * Used for the callee device (receiver) — the user hearing the call.
 */
export function playIncomingCall(): { stop: () => void } {
  if (!globalEnabled || !areCallSoundsEnabled() || isQuietHours()) return { stop: () => { } };
  const ctrl = playCustomRingtone({
    loop: true,
    volume: 0.9,
    fallbackSynthesized: playIncomingCallSynth,
  });
  activeRingtone = ctrl;
  return ctrl;
}

/**
 * Outgoing call ringback tone.
 *
 * Primary source = custom Thug Life x GTA MP4 (`/gta-ringtone.mp4`)
 * played to the caller (the person placing the call) while waiting.
 * Falls back to synthesized ringback if asset unavailable.
 */
export function playOutgoingCall(): { stop: () => void } {
  if (!globalEnabled || !areCallSoundsEnabled() || isQuietHours()) return { stop: () => { } };
  const ctrl = playCustomRingtone({
    loop: true,
    volume: 0.75,
    fallbackSynthesized: playOutgoingCallSynth,
  });
  activeRingtone = ctrl;
  return ctrl;
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

/* ── Extra notification sounds (WeChat-style) ── */

/** Mentioned in a group chat (@you) — bright double-ping. */
export function playMention() {
  if (!globalEnabled || isQuietHours()) return;
  playTone({ freq: 1174.7, duration: 0.12, volume: 0.28, type: 'triangle' }); // D6
  playTone({ freq: 1568.0, duration: 0.16, volume: 0.24, type: 'triangle', delay: 0.10 }); // G6
}

/** Group chat message — softer, shorter ping so busy groups don't annoy. */
export function playGroupMessage() {
  if (!globalEnabled || isQuietHours()) return;
  playTone({ freq: 987.77, duration: 0.08, volume: 0.16, type: 'sine' }); // B5
  playTone({ freq: 1318.5, duration: 0.10, volume: 0.13, type: 'sine', delay: 0.06 }); // E6
}

/** Money received (transfer / red packet) — WeChat-style "ka-ching". */
export function playMoneyReceived() {
  if (!globalEnabled || isQuietHours()) return;
  playTone({ freq: 1046.5, duration: 0.10, volume: 0.26, type: 'triangle' }); // C6
  playTone({ freq: 1318.5, duration: 0.10, volume: 0.26, type: 'triangle', delay: 0.08 }); // E6
  playTone({ freq: 1568.0, duration: 0.14, volume: 0.26, type: 'triangle', delay: 0.16 }); // G6
  playTone({ freq: 2093.0, duration: 0.22, volume: 0.22, type: 'sine', delay: 0.24 }); // C7
}

/** Missed call alert — descending double tone after the ringtone stops. */
export function playMissedCall() {
  if (!globalEnabled || !areCallSoundsEnabled() || isQuietHours()) return;
  playTone({ freq: 880.0, duration: 0.18, volume: 0.26, type: 'sine' });
  playTone({ freq: 659.25, duration: 0.26, volume: 0.24, type: 'sine', delay: 0.18 });
}

/** New friend request accepted — warm ascending chime. */
export function playFriendAccepted() {
  if (!globalEnabled || isQuietHours()) return;
  playTone({ freq: 523.25, duration: 0.12, volume: 0.22, type: 'triangle' }); // C5
  playTone({ freq: 659.25, duration: 0.12, volume: 0.22, type: 'triangle', delay: 0.10 }); // E5
  playTone({ freq: 783.99, duration: 0.20, volume: 0.24, type: 'triangle', delay: 0.20 }); // G5
}

/* ── Vibration ───────────────────────────────── */

export function isVibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

export function isVibrationEnabled(): boolean {
  return getSettings().vibrationEnabled !== false;
}

function vibrate(pattern: number | number[]) {
  // Chrome blocks navigator.vibrate() until the user has interacted with the
  // page. Don't call it (or spam console errors) before that.
  if (!hasUserInteracted || !isVibrationSupported() || !isVibrationEnabled() || isQuietHours()) return;
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
    hasUserInteracted = true;
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
  }).catch(() => { });
}
