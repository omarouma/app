
import { create } from 'zustand';
import {
  COLLECTIONS,
  updateDocById,
  addDocToCollection,
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
    ? (d.createdAt as { toDate(): Date }).toDate()
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
    // Prevent double-call if one is already active
    if (get().currentCall) return get().currentCall!.id;
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
      } catch { /* ignore — call record update failure should not block UI */ }
    }
    set({ currentCall: null, incomingCall: null, connectedAt: null });
  },

  acceptCall: async () => {
    if (!isFirestoreAvailable()) { return; }
    const { incomingCall } = get();
    if (!incomingCall) return;
    try {
      await updateDocById(COLLECTIONS.CALL_HISTORY, incomingCall.id, { status: 'connected' });
    } catch { /* ignore */ }
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
      } catch { /* ignore */ }
    }
    set({ incomingCall: null, connectedAt: null });
  },

  subscribeCalls: (userId: string) => {
    if (!userId || !isFirestoreAvailable()) {
      set({ history: [] });
      return () => {};
    }

    // Subscribe to incoming calls for this user
    let unsubIncoming: (() => void) | null = null;
    let unsubOutgoing: (() => void) | null = null;

    const mergeHistory = (callerData: Record<string, unknown>[], calleeData: Record<string, unknown>[]) => {
      const seen = new Set<string>();
      const merged = [...callerData, ...calleeData]
        .filter((d: Record<string, unknown>) => {
          if (seen.has(d.id as string)) return false;
          seen.add(d.id as string);
          return ['ended', 'rejected', 'missed'].includes(d.status as string);
        })
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
          const getTime = (obj: Record<string, unknown>) => {
            const ts = obj.createdAt;
            if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate(): Date }).toDate === 'function') {
              return (ts as { toDate(): Date }).toDate().getTime();
            }
            return new Date(ts as string | number).getTime();
          };
          return getTime(b) - getTime(a);
        })
        .slice(0, 30);
      set({ history: merged.map((d: Record<string, unknown>) => mapCall(d)) });
    };

    // Keep local snapshots for merging
    let callerSnapshot: Record<string, unknown>[] = [];
    let calleeSnapshot: Record<string, unknown>[] = [];
    let mergePending = false;

    const scheduleMerge = () => {
      if (mergePending) return;
      mergePending = true;
      setTimeout(() => {
        mergePending = false;
        mergeHistory(callerSnapshot, calleeSnapshot);
      }, 200);
    };

    try {
      unsubOutgoing = subscribeToCollection(
        COLLECTIONS.CALL_HISTORY,
        [where('caller', '==', userId), orderBy('createdAt', 'desc'), limit(25)],
        (data) => {
          callerSnapshot = data || [];
          // Check the most recent outgoing call for state changes
          const latest = callerSnapshot[0];
          if (latest) {
            const call = mapCall(latest);
            if (call.status === 'connected') {
              // Only update if this matches our current call or there's no current call
              const cur = get().currentCall;
              if (!cur || cur.id === call.id) {
                set({ currentCall: call, connectedAt: Date.now() });
              }
            } else if (call.status === 'rejected' || call.status === 'ended' || call.status === 'missed') {
              const cur = get().currentCall;
              if (cur && cur.id === call.id) {
                set({ currentCall: null, connectedAt: null });
              }
            }
          }
          scheduleMerge();
        },
      );

      unsubIncoming = subscribeToCollection(
        COLLECTIONS.CALL_HISTORY,
        [where('callee', '==', userId), orderBy('createdAt', 'desc'), limit(25)],
        (data) => {
          calleeSnapshot = data || [];
          // Surface incoming calls with 'calling' status
          const activeCalling = calleeSnapshot.find(
            (d: Record<string, unknown>) => d.status === 'calling'
          );
          if (activeCalling) {
            const call = mapCall(activeCalling);
            const curIncoming = get().incomingCall;
            if (!curIncoming || curIncoming.id !== call.id) {
              set({ incomingCall: call });
            }
          } else {
            // Only clear incomingCall if it's still in 'calling' state
            // Do NOT clear it if it moved to 'connected' (acceptCall handles that transition)
            const inc = get().incomingCall;
            if (inc) {
              const matchingCall = calleeSnapshot.find(
                (d: Record<string, unknown>) => d.id === inc.id
              );
              const matchingStatus = matchingCall?.status as string | undefined;
              // Clear only if explicitly rejected/ended/missed — not on 'connected'
              if (matchingStatus === 'rejected' || matchingStatus === 'ended' || matchingStatus === 'missed') {
                const cur = get().currentCall;
                if (!cur || cur.id !== inc.id) {
                  set({ incomingCall: null });
                }
              }
            }
          }
          scheduleMerge();
        },
      );
    } catch {
      // ignore
    }

    return () => {
      if (unsubIncoming) unsubIncoming();
      if (unsubOutgoing) unsubOutgoing();
    };
  },
}));
