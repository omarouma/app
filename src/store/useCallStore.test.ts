import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/callingAvailability', () => ({ verifyCallingAvailability: vi.fn(async () => undefined) }));
import type { CallRecord } from '@/types';
import { useCallStore } from './useCallStore';

const {
    mockAddDocToCollection,
    mockUpdateDocById,
    mockQueryCollection,
    mockSubscribeToCollection,
    mockGetDocById,
    mockDeleteDocById,
} = vi.hoisted(() => ({
    mockDeleteDocById: vi.fn(async () => undefined),
    mockGetDocById: vi.fn(async () => null as Record<string, unknown> | null),
    mockAddDocToCollection: vi.fn(async () => 'call-123'),
    mockUpdateDocById: vi.fn(async () => undefined),
    mockQueryCollection: vi.fn(async () => []),
    mockSubscribeToCollection: vi.fn(() => () => undefined),
}));

vi.mock('@/lib/firestore', () => ({
    isFirestoreAvailable: () => true,
    COLLECTIONS: {
        CALL_HISTORY: 'call_history',
    },
    addDocToCollection: mockAddDocToCollection,
    getDocById: mockGetDocById,
    deleteDocById: mockDeleteDocById,
    updateDocById: mockUpdateDocById,
    queryCollection: mockQueryCollection,
    subscribeToCollection: mockSubscribeToCollection,
    serverTimestamp: vi.fn(() => new Date()),
    where: vi.fn((field, op, value) => ({ field, op, value })),
    orderBy: vi.fn((field, direction) => ({ field, direction })),
    limit: vi.fn((count) => ({ count })),
}));

vi.mock('@/config/env', () => ({ default: { VITE_CALLING_API_URL: 'https://calls.example.test' } }));

vi.mock('@/lib/errorLogger', () => ({
    logStoreError: vi.fn(),
}));

describe('useCallStore', () => {
    beforeEach(() => {
        mockAddDocToCollection.mockClear();
        mockUpdateDocById.mockClear();
        mockQueryCollection.mockClear();
        mockSubscribeToCollection.mockClear();

        mockDeleteDocById.mockReset().mockResolvedValue(undefined);
        mockGetDocById.mockReset().mockResolvedValue(null);
        mockAddDocToCollection.mockResolvedValue('call-123');
        mockUpdateDocById.mockResolvedValue(undefined);
        mockQueryCollection.mockResolvedValue([]);
        mockSubscribeToCollection.mockReturnValue(() => undefined);

        useCallStore.setState({
            currentCall: null,
            incomingCall: null,
            connectedAt: null,
            history: [],
            loading: false,
            participants: [],
            callTimeoutId: null,
            lastCallError: undefined,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts with an empty call state', () => {
        const state = useCallStore.getState();
        expect(state.currentCall).toBeNull();
        expect(state.incomingCall).toBeNull();
        expect(state.history).toEqual([]);
        expect(state.callTimeoutId).toBeNull();
    });

    it('starts a call and creates a call record', async () => {
        const result = await useCallStore.getState().startCall('user-2', 'user-1', 'voice');

        expect(result).toBe('call-123');
        expect(mockAddDocToCollection).toHaveBeenCalledWith(
            'call_history',
            expect.objectContaining({
                callerId: 'user-1',
                calleeId: 'user-2',
                type: 'voice',
                status: 'calling',
            })
        );

        const state = useCallStore.getState();
        expect(state.currentCall).toMatchObject({
            id: 'call-123',
            status: 'calling',
        });
    });

    it('recovers a committed invitation after a lost insert acknowledgement', async () => {
        mockAddDocToCollection.mockRejectedValueOnce(new Error('network acknowledgement lost'));
        mockGetDocById.mockResolvedValueOnce({ callerId: 'user-1', calleeId: 'user-2', type: 'voice', status: 'calling' });
        const id = await useCallStore.getState().startCall('user-2', 'user-1', 'voice');
        const inserted = mockAddDocToCollection.mock.calls[0] as unknown as [string, { id: string }];
        expect(id).toBe(inserted[1].id);
        expect(mockAddDocToCollection).toHaveBeenCalledTimes(1);
    });

    it('keeps failed deletions visible when clearing history partially succeeds', async () => {
        const call = { initiatorId: 'user-1', participantIds: ['user-1', 'user-2'], type: 'voice', status: 'ended', timestamp: new Date() } as CallRecord;
        useCallStore.setState({ history: [{ ...call, id: 'deleted' }, { ...call, id: 'retained' }] });
        mockDeleteDocById.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('database unavailable'));
        await expect(useCallStore.getState().clearCallHistory('user-1')).rejects.toThrow('Some calls');
        expect(useCallStore.getState().history.map(c => c.id)).toEqual(['retained']);
    });

    it('reports a failed single deletion and preserves the visible record', async () => {
        const call = { id: 'retained', initiatorId: 'user-1', participantIds: ['user-1', 'user-2'], type: 'voice', status: 'ended', timestamp: new Date() } as CallRecord;
        useCallStore.setState({ history: [call] });
        mockDeleteDocById.mockRejectedValueOnce(new Error('permission denied'));
        await expect(useCallStore.getState().deleteCall('retained')).rejects.toThrow('permission denied');
        expect(useCallStore.getState().history).toEqual([call]);
    });

    it('clears call timeout on endCall', async () => {
        await useCallStore.getState().startCall('user-2', 'user-1', 'voice');
        const callTimeoutId = useCallStore.getState().callTimeoutId;
        expect(callTimeoutId).toBeTruthy();

        await useCallStore.getState().endCall();

        expect(useCallStore.getState().callTimeoutId).toBeNull();
        expect(useCallStore.getState().currentCall).toBeNull();
    });

    it('only accepts calls in calling state', async () => {
        useCallStore.setState({
            incomingCall: {
                id: 'call-555',
                initiatorId: 'user-2',
                participantIds: ['user-1', 'user-2'],
                type: 'voice',
                status: 'connected',
                timestamp: new Date(),
            },
        });

        mockUpdateDocById.mockResolvedValue(undefined);

        mockUpdateDocById.mockClear();
        await useCallStore.getState().acceptCall();

        expect(mockUpdateDocById).not.toHaveBeenCalled();
        expect(useCallStore.getState().incomingCall?.status).toBe('connected');
    });

    it('transitions incomingCall to currentCall on acceptCall', async () => {
        const incomingCall: CallRecord = {
            id: 'call-incoming',
            initiatorId: 'user-2',
            participantIds: ['user-1', 'user-2'],
            type: 'voice',
            status: 'calling',
            timestamp: new Date(),
        };

        useCallStore.setState({ incomingCall });

        await useCallStore.getState().acceptCall();

        expect(mockUpdateDocById).toHaveBeenCalledWith(
            'call_history',
            'call-incoming',
            { status: 'connected' }
        );

        const state = useCallStore.getState();
        expect(state.currentCall?.status).toBe('connected');
        expect(state.incomingCall).toBeNull();
    });

    it('cleans up timeout on cancelCallIfStale', async () => {
        await useCallStore.getState().startCall('user-2', 'user-1', 'voice');

        const callTimeoutId = useCallStore.getState().callTimeoutId;
        expect(callTimeoutId).toBeTruthy();

        useCallStore.getState().cancelCallIfStale();

        expect(useCallStore.getState().callTimeoutId).toBeNull();
    });

    it('rejects self-calls', async () => {
        const result = useCallStore.getState().startCall('user-1', 'user-1', 'voice')
            .catch(err => err.message);

        await expect(result).resolves.toContain('cannot start a call with yourself');
    });


});

describe('incoming media permission safety', () => {
    afterEach(() => { vi.unstubAllGlobals(); });
    it('keeps an incoming call ringing when microphone permission is denied', async () => {
        mockUpdateDocById.mockClear();
        const incoming = { id: 'incoming', initiatorId: 'caller', participantIds: ['caller', 'callee'], status: 'calling', type: 'voice', timestamp: new Date() } as CallRecord;
        useCallStore.setState({ incomingCall: incoming, currentCall: null });
        vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')) } });
        await expect(useCallStore.getState().acceptCall()).rejects.toThrow('permission');
        expect(mockUpdateDocById).not.toHaveBeenCalled();
        expect(useCallStore.getState().incomingCall?.id).toBe('incoming');
        expect(useCallStore.getState().currentCall).toBeNull();
    });
    it('does not connect when the incoming invitation disappears during permission acquisition', async () => {
        mockUpdateDocById.mockClear();
        useCallStore.setState({ incomingCall: { id: 'incoming', status: 'calling', type: 'voice' } as CallRecord, currentCall: null });
        const stop = vi.fn();
        vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockImplementation(async () => {
            useCallStore.setState({ incomingCall: null }); return { getTracks: () => [{ stop }] };
        }) } });
        await expect(useCallStore.getState().acceptCall()).rejects.toThrow('no longer available');
        expect(stop).toHaveBeenCalled(); expect(mockUpdateDocById).not.toHaveBeenCalled();
    });
});
