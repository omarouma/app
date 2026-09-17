import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { session } = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('@/config/env', () => ({ default: { VITE_CALLING_API_URL: 'https://calls.example.test' } }));
vi.mock('./supabase', () => ({ getSupabase: () => ({ auth: { getSession: session } }) }));
import { AlibabaCall } from './alibabaCall';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  constructor() { Socket.instances.push(this); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  disconnect(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
  frame(type: string, extra: object = {}) { this.onmessage?.({ data: JSON.stringify({ type, ...extra }) }); }
}
class Peer {
  static instances: Peer[] = [];
  connectionState = 'connected';
  signalingState = 'stable';
  localDescription: object | null = null;
  remoteDescription: object | null = null;
  onconnectionstatechange: (() => void) | null = null;
  onicecandidate = null;
  ontrack = null;
  addTrack = vi.fn(); close = vi.fn(); addIceCandidate = vi.fn(async () => {});
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'new-offer' }));
  createAnswer = vi.fn(async () => ({ type: 'answer', sdp: 'new-answer' }));
  setLocalDescription = vi.fn(async (value: { type: string }) => { this.localDescription = value; this.signalingState = value.type === 'offer' ? 'have-local-offer' : 'stable'; });
  setRemoteDescription = vi.fn(async (value: object) => { this.remoteDescription = value; this.signalingState = 'stable'; });
  getConfiguration = vi.fn(() => ({})); setConfiguration = vi.fn();
  getStats = vi.fn(async () => new Map());
  constructor() { Peer.instances.push(this); }
}
async function flush() { await vi.advanceTimersByTimeAsync(0); }
async function handshake(socket: Socket, answer = true) {
  socket.onopen?.(); socket.frame('ready', { caller: true }); socket.frame('peer-ready'); await flush();
  if (answer) { socket.frame('answer', { data: { type: 'answer', sdp: 'answer' } }); await flush(); }
}
describe('call recovery and relay renewal', () => {
  let call: AlibabaCall;
  let stop: ReturnType<typeof vi.fn>;
  let callbacks: { local: ReturnType<typeof vi.fn>; remote: ReturnType<typeof vi.fn>; connected: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; quality: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.useFakeTimers(); Socket.instances = []; Peer.instances = []; stop = vi.fn();
    callbacks = { local: vi.fn(), remote: vi.fn(), connected: vi.fn(), error: vi.fn(), quality: vi.fn() };
    session.mockReset().mockResolvedValue({ data: { session: { access_token: 'fresh-session' } }, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ iceServers: [{ urls: 'turn:relay.test', username: 'temporary-user', credential: 'temporary-password' }] }) }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) } });
    vi.stubGlobal('RTCPeerConnection', Peer); vi.stubGlobal('WebSocket', Socket);
    call = new AlibabaCall(callbacks);
  });
  afterEach(() => { call.close(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('reconnects with a fresh session without requesting media again', async () => {
    await call.start('call-id', false); await handshake(Socket.instances[0]);
    const media = vi.spyOn(navigator.mediaDevices, 'getUserMedia');
    Socket.instances[0].disconnect();
    session.mockResolvedValue({ data: { session: { access_token: 'renewed-session' } } });
    await vi.advanceTimersByTimeAsync(1000);
    await handshake(Socket.instances[1]);
    expect(Socket.instances[1].send).toHaveBeenCalledWith(expect.stringContaining('renewed-session'));
    expect(Peer.instances).toHaveLength(1); expect(media).not.toHaveBeenCalled();
    expect(Peer.instances[0].createOffer).toHaveBeenCalledTimes(2);
  });
  it('rolls back an unanswered offer before restarting negotiation', async () => {
    await call.start('call-id', false); await handshake(Socket.instances[0], false);
    Socket.instances[0].disconnect(); await vi.advanceTimersByTimeAsync(1000);
    await handshake(Socket.instances[1]);
    expect(Peer.instances[0].setLocalDescription).toHaveBeenCalledWith({ type: 'rollback' });
  });
  it('never reconnects after hangup and clears every pending timer', async () => {
    await call.start('call-id', false); Socket.instances[0].disconnect(); call.close();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(Socket.instances).toHaveLength(1); expect(stop).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('ends recovery after four unsuccessful reconnects', async () => {
    await call.start('call-id', false); Socket.instances[0].disconnect();
    for (const delay of [1000, 2000, 4000, 8000]) {
      await vi.advanceTimersByTimeAsync(delay); Socket.instances.at(-1)!.disconnect();
    }
    expect(callbacks.error).toHaveBeenCalledWith(expect.stringContaining('could not recover'));
    expect(stop).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not retry a revoked membership or replaced call', async () => {
    await call.start('call-id', false); Socket.instances[0].disconnect(1008);
    await vi.advanceTimersByTimeAsync(30000);
    expect(Socket.instances).toHaveLength(1); expect(stop).toHaveBeenCalled();
  });
  it('renews authenticated relay configuration before one-hour credentials expire', async () => {
    await call.start('call-id', false); await handshake(Socket.instances[0]);
    await vi.advanceTimersByTimeAsync(45 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(Peer.instances[0].setConfiguration).toHaveBeenCalledWith(expect.objectContaining({ iceServers: expect.any(Array) }));
    await vi.advanceTimersByTimeAsync(1000); await handshake(Socket.instances[1]);
    expect(Peer.instances[0].createOffer).toHaveBeenCalledTimes(2);
  });
  it('reports quality using interval packet loss instead of lifetime totals', async () => {
    await call.start('call-id', false); await handshake(Socket.instances[0]);
    const pc = Peer.instances[0];
    pc.getStats.mockResolvedValue(new Map([['inbound', { id: 'inbound', type: 'inbound-rtp', packetsReceived: 10000, packetsLost: 1000, jitter: 0.01 }]]));
    await vi.advanceTimersByTimeAsync(2000); expect(callbacks.quality).toHaveBeenLastCalledWith('good');
    pc.getStats.mockResolvedValue(new Map([['inbound', { id: 'inbound', type: 'inbound-rtp', packetsReceived: 10090, packetsLost: 1010, jitter: 0.01 }]]));
    await vi.advanceTimersByTimeAsync(2000); expect(callbacks.quality).toHaveBeenLastCalledWith('poor');
    pc.getStats.mockResolvedValue(new Map([['inbound', { id: 'inbound', type: 'inbound-rtp', packetsReceived: 10190, packetsLost: 1010, jitter: 0.01 }]]));
    await vi.advanceTimersByTimeAsync(2000); expect(callbacks.quality).toHaveBeenLastCalledWith('good');
  });
});
