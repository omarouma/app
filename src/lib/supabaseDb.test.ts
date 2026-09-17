import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), channel: vi.fn(), remove: vi.fn(), status: undefined as any }));
vi.mock('./supabase', () => ({ getSupabaseSafe: () => ({ from: mocks.from, channel: mocks.channel, removeChannel: mocks.remove }) }));
vi.mock('./dbCache', () => ({ getCached: () => null, setCached: vi.fn(), cacheKeys: { user: (id: string) => id } }));
import { addDocToSubcollection, subscribeToCollection, subscribeToDoc } from './supabaseDb';
function query(result: any) {
  const chain: any = { then: (ok: any, fail: any) => Promise.resolve(result).then(ok, fail) };
  for (const method of ['select', 'eq', 'insert', 'single', 'maybeSingle']) chain[method] = vi.fn(() => chain);
  return chain;
}
describe('database reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const channel: any = { on: vi.fn(() => channel), subscribe: vi.fn(cb => { mocks.status = cb; return channel; }) };
    mocks.channel.mockReturnValue(channel);
  });
  it('acknowledges a duplicate retry only when its immutable payload matches', async () => {
    mocks.from.mockReturnValueOnce(query({ error: { code: '23505' } }))
      .mockReturnValueOnce(query({ data: { id: 'stable', sender_id: 'user', content: 'hello', type: 'text' }, error: null }));
    await expect(addDocToSubcollection('chats', 'chat', 'messages', { id: 'stable', senderId: 'user', content: 'hello', type: 'text' })).resolves.toBe('stable');
  });
  it('rejects a conflicting duplicate instead of overwriting the stored message', async () => {
    mocks.from.mockReturnValueOnce(query({ error: { code: '23505' } }))
      .mockReturnValueOnce(query({ data: { id: 'stable', sender_id: 'other', content: 'hello', type: 'text' }, error: null }));
    await expect(addDocToSubcollection('chats', 'chat', 'messages', { id: 'stable', senderId: 'user', content: 'hello', type: 'text' })).rejects.toMatchObject({ code: '23505' });
  });
  it('refetches on reconnect and preserves the previous snapshot on fetch failure', async () => {
    mocks.from.mockReturnValueOnce(query({ data: [{ id: 'one', content: 'hello' }], error: null }))
      .mockReturnValue(query({ data: null, error: { message: 'offline' } }));
    const onData = vi.fn(); const stop = subscribeToCollection('messages', [], onData);
    await new Promise(r => setTimeout(r, 0));
    const status = mocks.status;
    status('SUBSCRIBED'); await new Promise(r => setTimeout(r, 0));
    status('CHANNEL_ERROR'); status('SUBSCRIBED'); await new Promise(r => setTimeout(r, 0));
    expect(mocks.from.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(onData).toHaveBeenCalledTimes(1);
    expect(onData.mock.calls[0][0]).toEqual([{ id: 'one', content: 'hello' }]); stop();
  });
  it('allocates independent document channels and suppresses callbacks after unsubscribe', async () => {
    mocks.from.mockReturnValue(query({ data: { id: 'one' }, error: null }));
    const callback = vi.fn(); const first = subscribeToDoc('chats', 'one', callback);
    const second = subscribeToDoc('chats', 'one', callback); first(); second();
    await new Promise(r => setTimeout(r, 0));
    expect(mocks.channel.mock.calls[0][0]).not.toBe(mocks.channel.mock.calls[1][0]);
    expect(callback).not.toHaveBeenCalled();
  });
});
