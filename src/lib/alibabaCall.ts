import { getSupabase } from './supabase';
import env from '@/config/env';
import { callMediaConstraints, takePreparedStream } from './callMedia';

export type CallQuality = 'good' | 'poor' | 'reconnecting';
export interface PeerCallCallbacks {
  local: (stream: MediaStream) => void;
  remote: (stream: MediaStream) => void;
  connected: (value: boolean) => void;
  error: (message: string | null) => void;
  quality?: (value: CallQuality) => void;
}
/** One-to-one WebRTC; Alibaba hosts signaling and authenticated coturn. */
export class AlibabaCall {
  private pc: RTCPeerConnection | null = null;
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private candidates: RTCIceCandidateInit[] = [];
  private closed = false;
  private controller = new AbortController();
  private chain: Promise<void> = Promise.resolve();
  private caller = false;
  private authenticated = false;
  private peerAvailable = false;
  private offerPending = false;
  private reconnectAttempts = 0;
  private renewalFailures = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private renewalTimer: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setTimeout> | null = null;
  private packetSamples = new Map<string, { received: number; lost: number }>();
  private callId = '';
  private base: URL | null = null;
  constructor(private callbacks: PeerCallCallbacks) {}

  private async sessionToken() {
    const { data, error } = await getSupabase().auth.getSession();
    if (error || !data.session?.access_token) throw new Error('Sign in again to make calls.');
    return data.session.access_token;
  }
  private async fetchIce(token: string): Promise<RTCIceServer[]> {
    const url = new URL('/ice', this.base!); url.searchParams.set('call', this.callId);
    // A fresh controller per request: reusing one controller means the first
    // timeout aborts every later request (including credential renewal), which
    // permanently breaks ICE refresh on long calls.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Calling service is unavailable or access was denied.');
      const { iceServers } = await response.json() as { iceServers: RTCIceServer[] };
      if (!Array.isArray(iceServers) || !iceServers.some(server => [server.urls].flat().some(url => /^turns?:/.test(url)))) throw new Error('Calling relay is not configured.');
      return iceServers;
    } finally { clearTimeout(timeout); }
  }
  async start(callId: string, video: boolean) {
    if (this.closed || this.pc || this.callId) throw new Error('This call has already started or ended.');
    if (!env.VITE_CALLING_API_URL) throw new Error('Calling service has not been configured yet.');
    this.base = new URL(env.VITE_CALLING_API_URL);
    if (this.base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(this.base.hostname)) throw new Error('Calling requires HTTPS.');
    this.callId = callId;
    const token = await this.sessionToken();
    const iceServers = await this.fetchIce(token);
    if (this.closed) return;
    // Reuse the stream the store already acquired for the permission check.
    // Acquiring twice in quick succession throws NotReadableError on some
    // mobile browsers and flashes the camera indicator twice.
    const stream = takePreparedStream(callId, video)
      ?? await navigator.mediaDevices.getUserMedia(callMediaConstraints(video));
    if (this.closed) { stream.getTracks().forEach(track => track.stop()); return; }
    this.stream = stream; this.callbacks.local(stream);
    const pc = new RTCPeerConnection({ iceServers }); this.pc = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.ontrack = event => { if (!this.closed) this.callbacks.remote(event.streams[0] || new MediaStream([event.track])); };
    pc.onicecandidate = event => { if (event.candidate) this.send('ice', event.candidate.toJSON()); };
    pc.onconnectionstatechange = () => {
      if (this.closed) return;
      this.callbacks.connected(pc.connectionState === 'connected');
      if (pc.connectionState === 'connected') this.callbacks.error(null);
      else if (pc.connectionState === 'failed') {
        this.callbacks.quality?.('reconnecting');
        // Rejoining notifies both participants; only the caller creates offers.
        this.replaceSocket();
      } else this.callbacks.quality?.('reconnecting');
    };
    this.openSocket(token);
    this.scheduleRenewal();
    this.sampleStats();
  }
  private openSocket(token: string) {
    if (this.closed) return;
    const url = new URL('/signal', this.base!); url.protocol = this.base!.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url); this.socket = socket;
    this.authenticated = false; this.peerAvailable = false;
    this.handshakeTimer = setTimeout(() => { if (this.socket === socket && !this.authenticated) socket.close(); }, 10000);
    socket.onopen = () => { if (!this.closed && this.socket === socket) socket.send(JSON.stringify({ type: 'auth', token, callId: this.callId })); };
    socket.onmessage = event => {
      this.chain = this.chain.then(async () => {
        if (this.closed || this.socket !== socket) return;
        const message = JSON.parse(event.data);
        const pc = this.pc!;
        if (message.type === 'ready') {
          this.caller = message.caller === true; this.authenticated = true;
          if (this.handshakeTimer) clearTimeout(this.handshakeTimer); this.handshakeTimer = null;
          this.callbacks.error(null);
        } else if (message.type === 'peer-ready' && this.authenticated) {
          this.peerAvailable = true; this.candidates = [];
          if (this.caller) await this.offer();
        } else if (this.authenticated && ((message.type === 'offer' && !this.caller) || (message.type === 'answer' && this.caller))) {
          await pc.setRemoteDescription(message.data);
          for (const candidate of this.candidates.splice(0)) await pc.addIceCandidate(candidate);
          if (message.type === 'offer') { await pc.setLocalDescription(await pc.createAnswer()); this.send('answer', pc.localDescription); }
          this.offerPending = false; this.reconnectAttempts = 0;
        } else if (message.type === 'ice' && this.authenticated) {
          if (pc.remoteDescription && pc.signalingState === 'stable') await pc.addIceCandidate(message.data);
          else if (this.candidates.length < 256) this.candidates.push(message.data);
        } else if (message.type === 'peer-left') {
          this.peerAvailable = false; this.callbacks.quality?.('reconnecting');
          // Existing media can survive a temporary signaling interruption.
        }
      }).catch(() => { if (!this.closed && this.socket === socket) this.fail('Call negotiation failed. Please try again.'); });
    };
    socket.onerror = () => { /* close/handshake timeout drives bounded recovery */ };
    socket.onclose = event => {
      if (this.closed || this.socket !== socket) return;
      if (this.handshakeTimer) clearTimeout(this.handshakeTimer); this.handshakeTimer = null;
      this.socket = null; this.authenticated = false; this.peerAvailable = false;
      if (event.code === 1008 || event.code === 1000) { this.fail('Call access ended or this call was opened elsewhere.'); return; }
      this.scheduleReconnect();
    };
  }
  private async offer() {
    const pc = this.pc;
    if (!pc || this.closed || !this.caller || !this.authenticated || !this.peerAvailable) return;
    // A lost answer must not leave the caller stuck with an old pending offer.
    if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' });
    if (this.closed || pc.signalingState !== 'stable') return;
    this.offerPending = true;
    await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
    if (!this.closed) this.send('offer', pc.localDescription);
  }
  private replaceSocket() {
    if (this.closed) return;
    const old = this.socket; this.socket = null;
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer); this.handshakeTimer = null;
    this.authenticated = false; this.peerAvailable = false; this.offerPending = false;
    old?.close(); this.scheduleReconnect();
  }
  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    if (this.reconnectAttempts >= 4) { this.fail('Calling connection could not recover. Please start a new call.'); return; }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts++, 8000);
    this.callbacks.quality?.('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.sessionToken().then(token => { if (!this.closed) this.openSocket(token); }).catch(() => this.fail('Your calling session expired. Sign in again.'));
    }, delay);
  }
  private scheduleRenewal(delay = 45 * 60 * 1000) {
    if (this.closed) return;
    this.renewalTimer = setTimeout(() => { this.renewalTimer = null; void this.renewIce(); }, delay);
  }
  private async renewIce() {
    try {
      // Each renewal/reconnect obtains the current Supabase session token.
      const token = await this.sessionToken();
      const iceServers = await this.fetchIce(token);
      if (this.closed || !this.pc) return;
      this.pc.setConfiguration({ ...this.pc.getConfiguration(), iceServers });
      this.renewalFailures = 0;
      this.replaceSocket(); this.scheduleRenewal();
    } catch {
      if (this.closed) return;
      if (this.controller.signal.aborted || ++this.renewalFailures >= 3) { this.fail('Unable to renew the calling relay. Please start a new call.'); return; }
      this.callbacks.quality?.('poor'); this.scheduleRenewal(60000);
    }
  }
  private sampleStats() {
    this.statsTimer = setTimeout(async () => {
      if (this.closed || !this.pc) return;
      const pc = this.pc;
      try {
        const stats = await pc.getStats();
        if (this.closed || this.pc !== pc) return;
        let poor = false;
        stats.forEach(stat => {
          if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.nominated && stat.currentRoundTripTime > 0.8) poor = true;
          if (stat.type === 'inbound-rtp' && !stat.isRemote) {
            if (stat.jitter > 0.1) poor = true;
            const received = Number(stat.packetsReceived || 0), lost = Number(stat.packetsLost || 0);
            const previous = this.packetSamples.get(stat.id);
            if (previous) {
              const receivedDelta = received - previous.received, lostDelta = Math.max(0, lost - previous.lost);
              if (receivedDelta >= 0 && receivedDelta + lostDelta > 0 && lostDelta / (receivedDelta + lostDelta) > 0.08) poor = true;
            }
            this.packetSamples.set(stat.id, { received, lost });
          }
        });
        this.callbacks.quality?.(pc.connectionState !== 'connected' || !this.authenticated || !this.peerAvailable || this.offerPending ? 'reconnecting' : poor ? 'poor' : 'good');
      } catch { /* Unsupported/unavailable stats must not interrupt media. */ }
      if (!this.closed) this.sampleStats();
    }, 2000);
  }
  private fail(message: string) { if (this.closed) return; this.callbacks.error(message); this.callbacks.connected(false); this.close(); }
  private send(type: string, data: unknown) { if (!this.closed && this.authenticated && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type, data })); }
  audio(enabled: boolean) { this.stream?.getAudioTracks().forEach(track => { track.enabled = enabled; }); }
  video(enabled: boolean) { this.stream?.getVideoTracks().forEach(track => { track.enabled = enabled; }); }
  async flip() {
    const old = this.stream?.getVideoTracks()[0]; if (!old || this.closed) return;
    const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: old.getSettings().facingMode === 'environment' ? 'user' : 'environment' } });
    const track = media.getVideoTracks()[0];
    if (this.closed || !track) { media.getTracks().forEach(t => t.stop()); return; }
    const sender = this.pc?.getSenders().find(s => s.track?.kind === 'video');
    try { await sender?.replaceTrack(track); track.enabled = old.enabled; this.stream?.removeTrack(old); this.stream?.addTrack(track); old.stop(); this.callbacks.local(new MediaStream(this.stream?.getTracks() || [])); }
    catch (error) { media.getTracks().forEach(t => t.stop()); throw error; }
  }
  dtmf(tone: string) { const sender = this.pc?.getSenders().find(s => s.track?.kind === 'audio')?.dtmf; if (!sender?.canInsertDTMF || !/^[0-9A-D#*]+$/i.test(tone)) return false; sender.insertDTMF(tone); return true; }
  close() {
    this.closed = true; this.controller.abort();
    for (const timer of [this.reconnectTimer, this.handshakeTimer, this.renewalTimer, this.statsTimer]) if (timer) clearTimeout(timer);
    this.reconnectTimer = this.handshakeTimer = this.renewalTimer = this.statsTimer = null;
    this.socket?.close(); this.pc?.close(); this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null; this.socket = null; this.pc = null; this.candidates = []; this.packetSamples.clear();
  }
}
