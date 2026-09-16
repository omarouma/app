import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  queue: [] as any[], user: { id: 'user-a' } as any,
  direct: vi.fn(), group: vi.fn(), remove: vi.fn(), status: vi.fn(), online: true,
}));
vi.mock('@/lib/offlineQueue', () => ({
  getQueue: () => mocks.queue, addToQueue: vi.fn(), removeFromQueue: mocks.remove,
  updateQueueStatus: mocks.status, isOnline: () => mocks.online,
}));
vi.mock('@/lib/safeStorage', () => ({ safeGetStorageItem: () => null, safeRemoveStorageItem: vi.fn() }));
vi.mock('@/store/useAuthStore', () => ({ useAuthStore: { getState: () => ({ user: mocks.user }) } }));
vi.mock('@/store/useChatStore', () => ({ useChatStore: { getState: () => ({ sendMessage: mocks.direct }) } }));
vi.mock('@/store/useGroupStore', () => ({ useGroupStore: { getState: () => ({ sendGroupMessage: mocks.group }) } }));
import { flushOfflineQueue } from './offlineSync';
describe('offline delivery acknowledgements', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.online = true; mocks.user = { id: 'user-a' };
    mocks.queue = [{ id: 'stable-id', type: 'direct', senderId: 'user-a', chatId: 'chat', content: 'hello', syncStatus: 'pending' }];
  });
  it('retains messages when the store returns a failed result', async () => {
    mocks.direct.mockResolvedValue({ success: false, id: 'stable-id' });
    await flushOfflineQueue();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.status).toHaveBeenCalledWith('stable-id', 'failed');
  });
  it('uses the persisted message ID and removes only acknowledged messages', async () => {
    mocks.direct.mockResolvedValue({ success: true, id: 'stable-id' });
    await flushOfflineQueue();
    expect(mocks.direct).toHaveBeenCalledWith('chat', 'user-a', 'hello', 'text', undefined, undefined, 'stable-id');
    expect(mocks.remove).toHaveBeenCalledWith('stable-id');
  });
  it('never flushes a previous account’s messages under a new login', async () => {
    mocks.user = { id: 'user-b' };
    await flushOfflineQueue();
    expect(mocks.direct).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('retains group messages after a backend failure', async () => {
    mocks.queue[0].type = 'group'; mocks.group.mockRejectedValue(new Error('Backend unavailable'));
    await flushOfflineQueue(); expect(mocks.remove).not.toHaveBeenCalled();
  });
});
