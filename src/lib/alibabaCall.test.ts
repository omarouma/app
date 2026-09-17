import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/config/env', () => ({ default: { VITE_CALLING_API_URL: 'https://calls.example.test' } }));
vi.mock('./supabase', () => ({ getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'test-session' } } }) } }) }));
import { AlibabaCall } from './alibabaCall';
describe('self-hosted peer lifecycle', () => {
  const callbacks = { local: vi.fn(), remote: vi.fn(), connected: vi.fn(), error: vi.fn() };
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('refuses to start without an authenticated TURN configuration', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ iceServers: [{ urls: 'stun:localhost' }] }) }));
    const call = new AlibabaCall(callbacks);
    await expect(call.start('call', false)).rejects.toThrow('relay is not configured'); call.close();
  });
  it('stops late media after hangup and never opens a peer connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ iceServers: [{ urls: 'turn:localhost' }] }) }));
    let finish: (stream: any) => void = () => {};
    const media = new Promise(resolve => { finish = resolve; });
    const mediaRequest = vi.fn(() => media); const stop = vi.fn(); const peer = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: mediaRequest } }); vi.stubGlobal('RTCPeerConnection', peer);
    const call = new AlibabaCall(callbacks); const starting = call.start('call', true);
    await vi.waitFor(() => expect(mediaRequest).toHaveBeenCalled());
    call.close(); finish({ getTracks: () => [{ stop }] }); await starting;
    expect(stop).toHaveBeenCalled(); expect(peer).not.toHaveBeenCalled(); expect(callbacks.local).not.toHaveBeenCalled();
  });
});
