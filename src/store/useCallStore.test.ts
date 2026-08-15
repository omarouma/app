import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { CallRecord } from '@/types';
import { deriveAgoraUid } from '@/lib/agora';
import { useCallStore } from './useCallStore';

const {
    mockAddDocToCollection,
    mockUpdateDocById,
    mockQueryCollection,
    mockSubscribeToCollection,
} = vi.hoisted(() => ({
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
    updateDocById: mockUpdateDocById,
    queryCollection: mockQueryCollection,
    subscribeToCollection: mockSubscribeToCollection,
    serverTimestamp: vi.fn(() => new Date()),
    where: vi.fn((field, op, value) => ({ field, op, value })),
    orderBy: vi.fn((field, direction) => ({ field, direction })),
    limit: vi.fn((count) => ({ count })),
}));

vi.mock('@/lib/errorLogger', () => ({
    logStoreError: vi.fn(),
}));

describe('useCallStore', () => {
    beforeEach(() => {
        mockAddDocToCollection.mockClear();
        mockUpdateDocById.mockClear();
        mockQueryCollection.mockClear();
        mockSubscribeToCollection.mockClear();

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

    it('derives the same Agora uid as the server token endpoint', () => {
        expect(deriveAgoraUid('user-123')).toBe(2358496403);
        expect(deriveAgoraUid('abc')).toBe(440920331);
        expect(deriveAgoraUid('test-user')).toBe(2712678491);
        expect(deriveAgoraUid('currentUserId')).toBe(1334763816);
    });
});
