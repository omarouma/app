import { getSupabase, isSupabaseConfigured } from './supabase';
import { getFirestoreDB } from './firebase';
import { subscribeToDoc, setDocById, updateDocById, arrayUnion, COLLECTIONS, attachRealtimeResilience } from './firestore';
import env from '@/config/env';

const isClient = typeof window !== 'undefined';

export type WebRTCCallState = 'idle' | 'ringing' | 'connected' | 'ended' | 'error';

interface SignalingData {
  offer?: { sdp: string; type: string };
  answer?: { sdp: string; type: string };
  callerIce?: RTCIceCandidateInit[];
  calleeIce?: RTCIceCandidateInit[];
}

export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  if (!isClient) return servers;

  const turnUrl = env.VITE_TURN_SERVER_URL;
  const turnUser = env.VITE_TURN_SERVER_USERNAME;
  const turnCred = env.VITE_TURN_SERVER_CREDENTIAL;
  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
  } else if (turnUrl || turnUser || turnCred) {
    if (env.DEV) {
      console.warn(
        '[WebRTC] TURN server partially configured. Set all three: VITE_TURN_SERVER_URL, VITE_TURN_SERVER_USERNAME, VITE_TURN_SERVER_CREDENTIAL. ' +
        'Without a TURN server, calls may fail on strict NAT networks.'
      );
    }
  }
  return servers;
}

export class WebRTCCall {
  private _pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private readonly isVideo: boolean;
  private callId: string | null = null;
  private myUserId: string;
  private otherUserId: string;
  private onStateChange?: (state: WebRTCCallState) => void;
  private onRemoteStream?: (stream: MediaStream) => void;
  private onLocalStream?: (stream: MediaStream) => void;
  private onQualityChange?: (quality: 'good' | 'poor' | 'reconnecting') => void;
  private signalingUnsub: (() => void) | null = null;
  private remoteDescSet = false;
  private pendingIce: RTCIceCandidateInit[] = [];
  private pendingCallerIceCount = 0;
  private pendingCalleeIceCount = 0;
  private isCaller = false;
  private lastCallerIceCount = 0;
  private lastCalleeIceCount = 0;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private lastQuality: 'good' | 'poor' | 'reconnecting' = 'good';
  private wasConnected = false;
  private iceRestartAttempts = 0;
  private readonly maxIceRestarts = 3;

  setOnQualityChange(cb: ((quality: 'good' | 'poor' | 'reconnecting') => void) | undefined) {
    this.onQualityChange = cb;
  }

  private setQuality(q: 'good' | 'poor' | 'reconnecting') {
    if (q === this.lastQuality) return;
    this.lastQuality = q;
    const cb = this.onQualityChange;
    if (cb) cb(q);
  }

  // Monitor connection quality via getStats. When the outbound bitrate or
  // round-trip time degrades, surface a "poor" quality signal so the UI can
  // warn the user (and optionally offer a video→voice fallback).
  private startQualityMonitor() {
    if (!isClient || this.statsTimer || !this._pc) return;
    let badSamples = 0;
    this.statsTimer = setInterval(async () => {
      const pc = this._pc;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let rtt = 0;
        let packetsLost = 0;
        let packetsTotal = 0;
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (typeof report.currentRoundTripTime === 'number') rtt = report.currentRoundTripTime;
          }
          if (report.type === 'inbound-rtp' && typeof report.packetsLost === 'number') {
            packetsLost += report.packetsLost;
            if (typeof report.packetsReceived === 'number') packetsTotal += report.packetsReceived;
          }
        });
        const lossRatio = packetsTotal > 0 ? packetsLost / packetsTotal : 0;
        if (rtt > 0.5 || lossRatio > 0.1) {
          badSamples += 1;
          if (badSamples >= 2) this.setQuality('poor');
        } else {
          badSamples = 0;
          this.setQuality('good');
        }
      } catch { /* ignore */ }
    }, 3000);
  }

private stopQualityMonitor() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  // Attempt an ICE restart to recover a degraded peer connection. Bounded to
  // `maxIceRestarts` so a persistently failing call eventually ends instead of
  // loop-restarting forever. Surfaces the "reconnecting" quality state so the
  // UI can inform the user recovery is in progress.
  private attemptIceRestart() {
    if (this.iceRestartAttempts >= this.maxIceRestarts) {
      this.setState('ended');
      return;
    }
    this.iceRestartAttempts += 1;
    this.setQuality('reconnecting');
    this.scheduleRecoveryTimeout();
    try {
      this._pc?.restartIce();
    } catch { /* restartIce may not be supported on all engines */ }
  }

  constructor(
    myUserId: string,
    otherUserId: string,
    isVideo: boolean,
    onStateChange?: (state: WebRTCCallState) => void,
    onRemoteStream?: (stream: MediaStream) => void,
    onLocalStream?: (stream: MediaStream) => void,
  ) {
    if (!isClient) {
      this.myUserId = myUserId;
      this.otherUserId = otherUserId;
      this.isVideo = isVideo;
      return;
    }
    this.myUserId = myUserId;
    this.otherUserId = otherUserId;
    this.isVideo = isVideo;
    this.onStateChange = onStateChange;
    this.onRemoteStream = onRemoteStream;
    this.onLocalStream = onLocalStream;
  }

  get peerConnection() {
    return this._pc;
  }

  private setState(state: WebRTCCallState) {
    const cb = this.onStateChange;
    if (cb) cb(state);
  }

  setOnStateChange(cb: ((state: WebRTCCallState) => void) | undefined) {
    this.onStateChange = cb;
  }

  private clearDisconnectTimer() {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  private scheduleRecoveryTimeout() {
    if (this.disconnectTimer) return;
    this.disconnectTimer = setTimeout(() => {
      this.disconnectTimer = null;
      // Only end the call if the connection didn't recover in the grace period.
      if (this._pc && this.wasConnected && this._pc.connectionState !== 'connected' && this._pc.connectionState !== 'connecting') {
        this.setState('ended');
      }
    }, 10000);
  }

  private ensurePeerConnection() {
    if (this._pc || !isClient) return this._pc;

    this._pc = new RTCPeerConnection({ iceServers: getIceServers() });

    this._pc.ontrack = (e: RTCTrackEvent) => {
      if (!this.remoteStream) this.remoteStream = new MediaStream();
      this.remoteStream.addTrack(e.track);
      if (this.onRemoteStream) this.onRemoteStream(this.remoteStream);
    };

    this._pc.onconnectionstatechange = () => {
      const s = this._pc?.connectionState;
      if (s === 'connected') {
        this.iceRestartAttempts = 0;
        this.wasConnected = true;
        this.clearDisconnectTimer();
        this.startQualityMonitor();
        this.setQuality('good');
        this.setState('connected');
      }
      if (s === 'failed') {
        // Try to recover via ICE restart before giving up.
        this.attemptIceRestart();
      }
      if (s === 'disconnected') {
        // Don't tear down immediately on a transient network blip. Give the
        // connection a grace period to recover (ICE restart / reconnection).
        this.setQuality('reconnecting');
        this.scheduleRecoveryTimeout();
      }
      if (s === 'closed') {
        this.stopQualityMonitor();
        this.setState('ended');
      }
    };

    this._pc.oniceconnectionstatechange = () => {
      const s = this._pc?.iceConnectionState;
      if (s === 'failed') {
        if (this.wasConnected) {
          // A transient failure after connection — try to restart ICE up to a
          // bounded number of times before giving up on the call.
          this.attemptIceRestart();
        } else {
          // Never connected — no point waiting.
          this.setState('ended');
        }
      }
      if (s === 'disconnected') {
        this.setQuality('reconnecting');
        this.scheduleRecoveryTimeout();
      }
      if (s === 'connected' || s === 'completed') {
        this.iceRestartAttempts = 0;
        this.clearDisconnectTimer();
        this.setQuality('good');
      }
    };

    return this._pc;
  }

  private async startLocalMedia() {
    if (!isClient) return;
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: this.isVideo
        ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 60 },
          }
        : false,
    };

    try {
      const permApi = navigator.permissions;
      if (permApi) {
        const micPerm = await permApi.query({ name: 'microphone' as PermissionName });
        if (micPerm.state === 'denied') throw new Error('Microphone permission denied');
      }
    } catch {
      // ignore
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.onLocalStream) this.onLocalStream(this.localStream);

      const pc = this.ensurePeerConnection();
      if (!pc) return;
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Failed to access media devices');
      this.setState('error');
      throw err;
    }
  }

  // ─── Signaling via Supabase ───
  private async initSupabaseSignaling() {
    if (!this.callId) return;
    const supabase = getSupabase();
    if (!supabase) return;

    // Ensure signaling row exists WITHOUT wiping an existing offer/answer/ICE
    // (upsert only sets the provided columns — new rows get the DB defaults).
    await supabase.from('call_signaling').upsert({
      call_id: this.callId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'call_id' });

// Subscribe to changes
    const channel = supabase.channel(`call_signaling_${this.callId}`);
    const wireChanges = () => {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'call_signaling',
        filter: `call_id=eq.${this.callId}`,
      }, async (payload) => {
        const data = payload.new as Record<string, unknown> | null;
        if (!data) return;
        await this.handleSignalingData({
          offer: data.offer as { sdp: string; type: string } | undefined,
          answer: data.answer as { sdp: string; type: string } | undefined,
          callerIce: (data.caller_ice as RTCIceCandidateInit[]) || [],
          calleeIce: (data.callee_ice as RTCIceCandidateInit[]) || [],
        });
      });
    };
    wireChanges();
    attachRealtimeResilience(channel, wireChanges);
    channel.subscribe();

    // Supabase realtime does NOT replay the current row on subscribe.
    // Fetch the existing offer/answer once so a callee that joins after the
    // offer was written still receives it.
    Promise.resolve(
      supabase
        .from('call_signaling')
        .select('offer, answer, caller_ice, callee_ice')
        .eq('call_id', this.callId)
        .single()
    )
      .then(({ data }) => {
        if (!data || !this.callId) return;
        void this.handleSignalingData({
          offer: data.offer,
          answer: data.answer,
          callerIce: data.caller_ice || [],
          calleeIce: data.callee_ice || [],
        });
      })
      .catch(() => { /* row may not exist yet — caller writes it next */ });

    this.signalingUnsub = () => supabase.removeChannel(channel);
  }

  // ─── Signaling via Firestore (fallback) ───
  private async initFirestoreSignaling() {
    if (!this.callId) return;
    const db = getFirestoreDB();
    if (!db) return;

    this.signalingUnsub = subscribeToDoc(
      COLLECTIONS.CALL_HISTORY,
      this.callId,
      async (docData) => {
        if (!docData) return;
        const sig = docData.signaling as SignalingData | undefined;
        if (!sig) return;
        await this.handleSignalingData(sig);
      },
    );
  }

  private async handleSignalingData(sig: SignalingData) {
    const pc = this.ensurePeerConnection();
    if (!pc) return;

    // If the remote description isn't set yet, buffer the remote ICE
    // candidates so they aren't lost if they arrive before the offer/answer.
    // This is critical because Supabase Realtime does not guarantee message
    // ordering — ICE candidates may arrive before the offer/answer row update.
    if (!this.remoteDescSet) {
      const remoteIce = this.isCaller
        ? (sig.calleeIce || [])
        : (sig.callerIce || []);
      const knownIce = this.isCaller ? this.pendingCalleeIceCount : this.pendingCallerIceCount;
      if (remoteIce.length > knownIce) {
        const newIce = remoteIce.slice(knownIce);
        for (const ice of newIce) {
          if (!this.pendingIce.some((c) => JSON.stringify(c) === JSON.stringify(ice))) {
            this.pendingIce.push(ice);
          }
        }
        if (this.isCaller) this.pendingCalleeIceCount = remoteIce.length;
        else this.pendingCallerIceCount = remoteIce.length;
      }
    }

    // Handle remote description (offer for callee, answer for caller)
    if (this.isCaller && sig.answer && !this.remoteDescSet) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.answer as RTCSessionDescriptionInit));
        this.remoteDescSet = true;
        // Supabase sends the FULL array each time; avoid re-adding what was
        // already applied by tracking the last count.
        const freshCalleeIce = this.lastCalleeIceCount === 0
          ? (sig.calleeIce || [])
          : (sig.calleeIce || []).slice(this.lastCalleeIceCount);
        const allIce = [...freshCalleeIce, ...this.pendingIce];
        for (const ice of allIce) {
          try { await pc.addIceCandidate(new RTCIceCandidate(ice)); } catch { /* ignore */ }
        }
        this.pendingIce = [];
        this.lastCalleeIceCount = (sig.calleeIce || []).length;
        this.pendingCalleeIceCount = (sig.calleeIce || []).length;
      } catch { /* ignore */ }
    } else if (!this.isCaller && sig.offer && !this.remoteDescSet) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.offer as RTCSessionDescriptionInit));
        this.remoteDescSet = true;
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.writeAnswer({ sdp: answer.sdp || null, type: answer.type });
        // Supabase sends the FULL array each time; avoid re-adding what was
        // already applied by tracking the last count.
        const freshCallerIce = this.lastCallerIceCount === 0
          ? (sig.callerIce || [])
          : (sig.callerIce || []).slice(this.lastCallerIceCount);
        const allIce = [...freshCallerIce, ...this.pendingIce];
        for (const ice of allIce) {
          try { await pc.addIceCandidate(new RTCIceCandidate(ice)); } catch { /* ignore */ }
        }
        this.pendingIce = [];
        this.lastCallerIceCount = (sig.callerIce || []).length;
        this.pendingCallerIceCount = (sig.callerIce || []).length;
      } catch { /* ignore */ }
    }

    // Handle new ICE candidates after remote description is set
    if (this.remoteDescSet) {
      const remoteIce = this.isCaller ? sig.calleeIce : sig.callerIce;
      const lastCount = this.isCaller ? this.lastCalleeIceCount : this.lastCallerIceCount;
      const currentCount = remoteIce?.length || 0;
      if (currentCount > lastCount) {
        const newIce = remoteIce!.slice(lastCount);
        for (const ice of newIce) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(ice));
          } catch { /* ignore */ }
        }
        if (this.isCaller) this.lastCalleeIceCount = currentCount;
        else this.lastCallerIceCount = currentCount;
      }
    }
  }

  private async writeOffer(offer: { sdp: string | null; type: string }) {
    if (isSupabaseConfigured() && this.callId) {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('call_signaling').upsert({
          call_id: this.callId,
          offer: { sdp: offer.sdp, type: offer.type },
          caller_ice: [],
          callee_ice: [],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'call_id' });
        return;
      }
    }
    const db = getFirestoreDB();
    if (db && this.callId) {
      await setDocById(COLLECTIONS.CALL_HISTORY, this.callId, {
        signaling: {
          offer: { sdp: offer.sdp, type: offer.type },
          callerIce: [],
          calleeIce: [],
        },
      });
    }
  }

  private async writeAnswer(answer: { sdp: string | null; type: string }) {
    if (isSupabaseConfigured() && this.callId) {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('call_signaling').update({
          answer: { sdp: answer.sdp, type: answer.type },
          updated_at: new Date().toISOString(),
        }).eq('call_id', this.callId);
        return;
      }
    }
    const db = getFirestoreDB();
    if (db && this.callId) {
      await updateDocById(COLLECTIONS.CALL_HISTORY, this.callId, { 'signaling.answer': { sdp: answer.sdp, type: answer.type } });
    }
  }

  private async appendIceCandidate(candidate: RTCIceCandidateInit, isCaller: boolean) {
    if (isSupabaseConfigured() && this.callId) {
      const supabase = getSupabase();
      if (supabase) {
        const field = isCaller ? 'caller_ice' : 'callee_ice';
        // Use array_append via RPC to avoid read-modify-write race
        const { error } = await supabase.rpc('append_ice_candidate', {
          p_call_id: this.callId,
          p_field: field,
          p_candidate: candidate,
        });
        if (!error) return;
        // Fallback to read-modify-write if RPC not available
        const { data: current } = await supabase
          .from('call_signaling')
          .select(field)
          .eq('call_id', this.callId)
          .single();
        const existing = ((current as Record<string, unknown>)?.[field] as RTCIceCandidateInit[] | undefined) || [];
        await supabase.from('call_signaling').update({
          [field]: [...existing, candidate],
          updated_at: new Date().toISOString(),
        }).eq('call_id', this.callId);
        return;
      }
    }
    const db = getFirestoreDB();
    if (db && this.callId) {
      await updateDocById(COLLECTIONS.CALL_HISTORY, this.callId, {
        [`signaling.${isCaller ? 'callerIce' : 'calleeIce'}`]: arrayUnion(candidate),
      });
    }
  }

  private async initSignaling() {
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        await this.initSupabaseSignaling();
        return;
      }
    }
    const db = getFirestoreDB();
    if (db) {
      await this.initFirestoreSignaling();
    }
  }

  async startCall(callId: string) {
    this.callId = callId;
    this.isCaller = true;
    this.setState('ringing');

    await this.startLocalMedia();

    const pc = this.ensurePeerConnection();
    if (!pc) return;

    // Attach the ICE handler BEFORE the offer is created/local description is
    // set, so no candidates are lost during the async signaling handshake.
    pc.onicecandidate = async (e) => {
      if (!e.candidate || !this.callId) return;
      try {
        await this.appendIceCandidate(e.candidate.toJSON(), true);
      } catch { /* ignore */ }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await this.writeOffer({ sdp: offer.sdp || null, type: offer.type });

    // Start listening for answer — must await so channel is ready before ICE fires
    await this.initSignaling();

    return callId;
  }

async answerCall(callId: string) {
    this.callId = callId;
    this.isCaller = false;
    this.setState('ringing');

    // Start listening for the offer FIRST (before local media capture) so an
    // offer that arrives while getUserMedia is pending is still received and
    // buffered. The caller writes the offer immediately after creating it, so
    // starting the subscription first eliminates a race where the offer is
    // missed while the callee is still acquiring the camera/mic.
    await this.initSignaling();

    await this.startLocalMedia();

    const pc = this.ensurePeerConnection();
    if (!pc) return;

    // Attach the ICE handler AFTER the signaling subscription is established,
    // so ICE candidates gathered during the async handshake are not lost.
    pc.onicecandidate = async (e) => {
      if (!e.candidate || !this.callId) return;
      try {
        await this.appendIceCandidate(e.candidate.toJSON(), false);
      } catch { /* ignore */ }
    };

    return callId;
  }

  endCall() {
    if (this.signalingUnsub) {
      this.signalingUnsub();
      this.signalingUnsub = null;
    }

    try {
      if (this.localStream) {
        for (const t of this.localStream.getTracks()) t.stop();
      }
    } catch { /* ignore */ }

    try {
      this._pc?.close();
    } catch { /* ignore */ }

const endedCallId = this.callId;

    this.clearDisconnectTimer();
    this.stopQualityMonitor();
    this.lastQuality = 'good';
    this.localStream = null;
    this.remoteStream = null;
    this._pc = null;
    this.iceRestartAttempts = 0;
    this.callId = null;
    this.remoteDescSet = false;
    this.pendingIce = [];
    this.pendingCallerIceCount = 0;
    this.pendingCalleeIceCount = 0;
    this.lastCallerIceCount = 0;
    this.lastCalleeIceCount = 0;
    this.wasConnected = false;

    // Best-effort cleanup of the transient signaling row so stale offers/ICE
    // accumulate in `call_signaling`. This is fire-and-forget: the call is
    // already terminated and the cleanup is not required for correctness.
    if (endedCallId && isSupabaseConfigured()) {
      const supabase = getSupabase();
      if (supabase) {
        void (async () => {
          try {
            await supabase.from('call_signaling').delete().eq('call_id', endedCallId);
          } catch { /* best-effort cleanup may fail (e.g. RLS on delete) */ }
        })();
      }
    }

    this.setState('ended');
  }

  toggleAudio(enabled: boolean) {
    if (!this.localStream) return;
    for (const t of this.localStream.getAudioTracks()) t.enabled = enabled;
  }

  toggleVideo(enabled: boolean) {
    if (!this.localStream) return;
    for (const t of this.localStream.getVideoTracks()) t.enabled = enabled;
  }

  flipCamera() {
    if (!this.localStream) return;
    const oldTrack = this.localStream.getVideoTracks()[0];
    if (!oldTrack) return;

    const currentFacing = oldTrack.getSettings().facingMode || 'user';
    const newFacing = currentFacing === 'environment' ? 'user' : 'environment';

    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: newFacing } })
      .then((newStream) => {
        const newTrack = newStream.getVideoTracks()[0];
        if (!newTrack) return;

        const pc = this.ensurePeerConnection();
        if (!pc) return;
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(newTrack).catch(() => newTrack.stop());
        }

        oldTrack.stop();
        const oldTracks = this.localStream!.getTracks().filter((t) => t !== oldTrack);
        this.localStream = new MediaStream([...oldTracks, newTrack]);
        if (this.onLocalStream) this.onLocalStream(this.localStream);
      })
      .catch(() => { /* camera flip not supported on this device */ });
  }
}