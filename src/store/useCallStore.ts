/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import {
  COLLECTIONS,
  updateDocById,
  addDocToCollection,
  queryCollection,
  subscribeToCollection,
  serverTimestamp,
  isFirestoreAvailable,
} from '@/lib/firestore';
import type { CallRecord } from '@/types';
import { where, orderBy, limit } from '@/lib/firestore';

interface CallStore {
  currentCall: CallRecord | null;
  incomingCall: CallRecord | null;
  history: CallRecord[];
  connectedAt: number | null;
  startCall: (userId: string, currentUserId: string, type: 'voice' | 'video') => Promise<string | undefined>;
  endCall: () => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  subscribeCalls: (userId: string) => () => void;
}

const mapCall = (d: Record<string, unknown>): CallRecord => ({
  id: d.id as string,
  initiatorId: (d.caller as string) || '',
  participantIds: [d.caller, d.callee].filter(Boolean) as string[],
  type: (d.type as 'voice' | 'video') || 'voice',
  status: (d.status as CallRecord['status']) || 'ended',
  timestamp: d.createdAt && typeof d.createdAt === 'object' && 'toDate' in d.createdAt
    ? (d.createdAt as any).toDate()
    : d.createdAt ? new Date(d.createdAt as string) : new Date(),
  duration: (d.duration as number) || 0,
});

export const useCallStore = create<CallStore>((set, get) => ({
  currentCall: null,
  incomingCall: null,
  history: [],
  connectedAt: null,

  startCall: async (userId, currentUserId, type) => {
    if (!isFirestoreAvailable()) {
      throw new Error('Database unavailable. Cannot start call.');
    }
    if (!currentUserId) throw new Error('You must be logged in to make a call');
    try {
      const callId = await addDocToCollection(COLLECTIONS.CALL_HISTORY, {
        caller: currentUserId,
        callee: userId,
        type,
        status: 'calling',
        createdAt: serverTimestamp(),
      });

      const call: CallRecord = {
        id: callId,
        initiatorId: currentUserId,
        participantIds: [currentUserId, userId],
        type,
        status: 'calling',
        timestamp: new Date(),
      };
      set({ currentCall: call, connectedAt: null });
      return callId;
    } catch {
      return;
    }
  },

  endCall: async () => {
    if (!isFirestoreAvailable()) {
      set({ currentCall: null, incomingCall: null, connectedAt: null });
      return;
    }
    const { currentCall, connectedAt } = get();
    if (currentCall) {
      try {
        const duration = connectedAt ? Math.floor((Date.now() - connectedAt) / 1000) : 0;
        await updateDocById(COLLECTIONS.CALL_HISTORY, currentCall.id, {
          status: 'ended',
          endedAt: serverTimestamp(),
          duration: duration > 0 ? duration : 0,
        });
      } catch (err) { console.error('endCall error:', err); }
    }
    set({ currentCall: null, incomingCall: null, connectedAt: null });
  },

  acceptCall: async () => {
    if (!isFirestoreAvailable()) { return; }
    const { incomingCall } = get();
    if (!incomingCall) return;
    try {
      await updateDocById(COLLECTIONS.CALL_HISTORY, incomingCall.id, { status: 'connected' });
    } catch (err) { console.error('acceptCall error:', err); }
    set({ currentCall: { ...incomingCall, status: 'connected' }, incomingCall: null, connectedAt: Date.now() });
  },

  rejectCall: async () => {
    if (!isFirestoreAvailable()) {
      set({ incomingCall: null, connectedAt: null });
      return;
    }
    const { incomingCall } = get();
    if (incomingCall) {
      try {
        await updateDocById(COLLECTIONS.CALL_HISTORY, incomingCall.id, {
          status: 'rejected',
          endedAt: serverTimestamp(),
          duration: 0,
        });
      } catch (err) { console.error('rejectCall error:', err); }
    }
    set({ incomingCall: null, connectedAt: null });
  },

  subscribeCalls: (userId: string) => {
    if (!userId) {
      set({ history: [] });
      return () => {};
    }
    if (!isFirestoreAvailable()) {
      set({ history: [] });
      return () => {};
    }

    const fetchHistory = async () => {
      try {
        const data = await queryCollection(COLLECTIONS.CALL_HISTORY, [
          orderBy('createdAt', 'desc'),
          limit(50),
        ]);

        const filtered = (data || [])
          .filter((d: any) => (d.caller === userId || d.callee === userId) && ['ended', 'rejected', 'missed'].includes(d.status))
          .slice(0, 20);
        set({ history: filtered.map((d: any) => mapCall(d)) });
      } catch {
        set({ history: [] });
      }
    };

    fetchHistory();

    // Subscribe to incoming calls
    let unsubIncoming: (() => void) | null = null;
    let unsubUpdates: (() => void) | null = null;

    try {
      unsubIncoming = subscribeToCollection(COLLECTIONS.CALL_HISTORY, [
        where('callee', '==', userId),
        where('status', '==', 'calling'),
      ], (data) => {
        for (const d of data) {
          const call = mapCall(d);
          if (call.status === 'calling') {
            set({ incomingCall: call });
          }
        }
      });

      unsubUpdates = subscribeToCollection(COLLECTIONS.CALL_HISTORY, [
        where('caller', '==', userId),
      ], (data) => {
        for (const d of data) {
          const call = mapCall(d);
          if (call.status === 'connected') {
            set({ currentCall: call, connectedAt: Date.now() });
          } else if (call.status === 'rejected' || call.status === 'ended') {
            set({ currentCall: null, connectedAt: null });
            fetchHistory();
          }
        }
      });
    } catch {
      // ignore
    }

    return () => {
      if (unsubIncoming) unsubIncoming();
      if (unsubUpdates) unsubUpdates();
    };
  },
}));
