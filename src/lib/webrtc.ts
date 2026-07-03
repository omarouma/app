/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { getFirestoreDB } from './firebase';
import { subscribeToDoc, setDocById, updateDocById, arrayUnion } from './firestore';

export type WebRTCCallState = 'idle' | 'ringing' | 'connected' | 'ended' | 'error';

interface SignalingData {
  offer?: { sdp: string; type: string };
  answer?: { sdp: string; type: string };
  callerIce?: RTCIceCandidateInit[];
  calleeIce?: RTCIceCandidateInit[];
}

function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const turnUrl = import.meta.env.VITE_TURN_SERVER_URL;
  const turnUser = import.meta.env.VITE_TURN_SERVER_USERNAME;
  const turnCred = import.meta.env.VITE_TURN_SERVER_CREDENTIAL;
  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
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
  private signalingUnsub: (() => void) | null = null;
  private remoteDescSet = false;
  private pendingIce: RTCIceCandidateInit[] = [];
  private isCaller = false;
  private lastCallerIceCount = 0;
  private lastCalleeIceCount = 0;

  constructor(
    myUserId: string,
    otherUserId: string,
    isVideo: boolean,
    onStateChange?: (state: WebRTCCallState) => void,
    onRemoteStream?: (stream: MediaStream) => void,
    onLocalStream?: (stream: MediaStream) => void,
  ) {
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
    this.onStateChange?.(state);
  }

  private ensurePeerConnection() {
    if (this._pc) return this._pc;

    this._pc = new RTCPeerConnection({ iceServers: getIceServers() });

    this._pc.ontrack = (e: RTCTrackEvent) => {
      if (!this.remoteStream) this.remoteStream = new MediaStream();
      if (e.track) this.remoteStream.addTrack(e.track);
      if (this.onRemoteStream && this.remoteStream) this.onRemoteStream(this.remoteStream);
    };

    this._pc.onconnectionstatechange = () => {
      const s = this._pc?.connectionState;
      if (s === 'connected') this.setState('connected');
      if (s === 'failed' || s === 'disconnected' || s === 'closed') this.setState('ended');
    };

    return this._pc;
  }

  private async startLocalMedia() {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: this.isVideo,
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (this.onLocalStream && this.localStream) this.onLocalStream(this.localStream);

    const pc = this.ensurePeerConnection();
    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream);
    }
  }

  // ─── Signaling via Supabase ───
  private async initSupabaseSignaling() {
    if (!this.callId) return;
    const supabase = getSupabase();
    if (!supabase) return;

    // Ensure signaling row exists
    await supabase.from('call_signaling').upsert({
      call_id: this.callId,
      offer: null,
      answer: null,
      caller_ice: [],
      callee_ice: [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'call_id' });

    // Subscribe to changes
    const channel = supabase
      .channel(`call_signaling_${this.callId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'call_signaling',
        filter: `call_id=eq.${this.callId}`,
      }, async (payload) => {
        const data = payload.new as any;
        if (!data) return;
        await this.handleSignalingData({
          offer: data.offer,
          answer: data.answer,
          callerIce: data.caller_ice || [],
          calleeIce: data.callee_ice || [],
        });
      })
      .subscribe();

    this.signalingUnsub = () => supabase.removeChannel(channel);
  }

  // ─── Signaling via Firestore (fallback) ───
  private async initFirestoreSignaling() {
    if (!this.callId) return;
    const db = getFirestoreDB();
    if (!db) return;

    this.signalingUnsub = subscribeToDoc(
      'callHistory',
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

    // Handle remote description
    if (this.isCaller && sig.answer && !this.remoteDescSet) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.answer as RTCSessionDescriptionInit));
        this.remoteDescSet = true;
        this.setState('connected');
        for (const ice of sig.calleeIce || []) {
          await pc.addIceCandidate(new RTCIceCandidate(ice));
        }
        for (const ice of this.pendingIce) {
          await pc.addIceCandidate(new RTCIceCandidate(ice));
        }
        this.pendingIce = [];
      } catch (e) {
        void e;
      }
    } else if (!this.isCaller && sig.offer && !this.remoteDescSet) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.offer as RTCSessionDescriptionInit));
        this.remoteDescSet = true;
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Write answer back
        await this.writeAnswer({ sdp: answer.sdp || null, type: answer.type });
        this.setState('connected');
        for (const ice of sig.callerIce || []) {
          await pc.addIceCandidate(new RTCIceCandidate(ice));
        }
        for (const ice of this.pendingIce) {
          await pc.addIceCandidate(new RTCIceCandidate(ice));
        }
        this.pendingIce = [];
      } catch (e) {
        void e;
      }
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
          } catch (e) { void e; }
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
      await setDocById('callHistory', this.callId, {
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
      await updateDocById('callHistory', this.callId, { 'signaling.answer': { sdp: answer.sdp, type: answer.type } });
    }
  }

  private async appendIceCandidate(candidate: RTCIceCandidateInit, isCaller: boolean) {
    if (isSupabaseConfigured() && this.callId) {
      const supabase = getSupabase();
      if (supabase) {
        const field = isCaller ? 'caller_ice' : 'callee_ice';
        const { data: current } = await supabase
          .from('call_signaling')
          .select(field)
          .eq('call_id', this.callId)
          .single();
        const existing = (current as any)?.[field] || [];
        await supabase.from('call_signaling').update({
          [field]: [...existing, candidate],
          updated_at: new Date().toISOString(),
        }).eq('call_id', this.callId);
        return;
      }
    }
    const db = getFirestoreDB();
    if (db && this.callId) {
      await updateDocById('callHistory', this.callId, {
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
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await this.writeOffer({ sdp: offer.sdp || null, type: offer.type });

    // Start listening for answer
    this.initSignaling();

    // Handle ICE candidates
    pc.onicecandidate = async (e) => {
      if (!e.candidate || !this.callId) return;
      try {
        await this.appendIceCandidate(e.candidate.toJSON(), true);
      } catch (err) { void err; }
    };

    return callId;
  }

  async answerCall(callId: string) {
    this.callId = callId;
    this.isCaller = false;
    this.setState('ringing');

    await this.startLocalMedia();

    // Start listening for offer
    this.initSignaling();

    // Handle ICE candidates
    const pc = this.ensurePeerConnection();
    pc.onicecandidate = async (e) => {
      if (!e.candidate || !this.callId) return;
      try {
        await this.appendIceCandidate(e.candidate.toJSON(), false);
      } catch (err) { void err; }
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
    } catch (e) {
      void e;
    }

    try {
      this._pc?.close();
    } catch (e) {
      void e;
    }

    this.localStream = null;
    this.remoteStream = null;
    this._pc = null;
    this.callId = null;
    this.remoteDescSet = false;
    this.pendingIce = [];
    this.lastCallerIceCount = 0;
    this.lastCalleeIceCount = 0;

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
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(newTrack);
        }

        oldTrack.stop();
        // Replace old track in local stream
        const oldTracks = this.localStream!.getTracks().filter((t) => t !== oldTrack);
        this.localStream = new MediaStream([...oldTracks, newTrack]);
        if (this.onLocalStream) this.onLocalStream(this.localStream);
      })
      .catch(() => {});
  }
}
