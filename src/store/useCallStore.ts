import { create } from 'zustand';
import {
  COLLECTIONS,
  updateDocById,
  addDocToCollection,
  subscribeToCollection,
  getDocById,
  serverTimestamp,
  isFirestoreAvailable,
} from '@/lib/firestore';
import type { CallRecord } from '@/types';
import { where, orderBy, limit } from '@/lib/firestore';

interface CallStore {
  currentCall: CallRecord | null;
  incomingCall: CallRecord | null;
  connectedAt: Date | null;
  history: CallRecord[];
  loading: boolean;
  participants: string[];

  startCall: (userId: string, currentUserId: string, type: 'voice' | 'video' | 'group_voice' | 'group_video') => Promise<string | undefined>;
  inviteToCall: (currentCallId: string, currentUserId: string, invitedUserId: string) => Promise<void>;
  endCall: () => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  subscribeCalls: (userId: string) => () => void;
  subscribeToCallHistory: (userId: string) => () => void;
  clearCallHistory: (userId: string) => Promise<void>;
  deleteCall: (callId: string) => Promise<void>;
}

const mapCall = (d: Record<string, unknown>): CallRecord => {
  const caller = (d.callerId as string) ?? (d.caller as string) ?? '';
  const callee = (d.calleeId as string) ?? (d.callee as string) ?? '';
  return {
    id: d.id as string,
    initiatorId: caller,
    participantIds: [caller, callee].filter(Boolean) as string[],
    type: (d.type as 'voice' | 'video') || 'voice',
    status: (d.status as CallRecord['status']) || 'ended',
    timestamp: d.createdAt && typeof d.createdAt === 'object' && 'toDate' in d.createdAt
      ? (d.createdAt as { toDate(): Date }).toDate()
      : d.createdAt ? new Date(d.createdAt as string) : new Date(),
    duration: (d.duration as number) || 0,
  };
};

const mergedCallData = new Map<string, Map<string, Record<string, unknown>>>();

const processCallData = (
  data: Record<string, unknown>[],
  currentUserId: string,
  onUpdateHistory: (history: CallRecord[]) => void,
  onIncomingCall: (call: CallRecord | null) => void,
  onUpdateCurrentCall: (call: CallRecord | null) => void,
  getState: () => CallStore,
  subscriptionKey?: string,
) => {
  if (subscriptionKey) {
    if (!mergedCallData.has(currentUserId)) {
      mergedCallData.set(currentUserId, new Map());
    }
    const merged = mergedCallData.get(currentUserId)!;
    for (const [id, row] of merged) {
      if ((row as Record<string, unknown>).__subKey === subscriptionKey) merged.delete(id);
    }
    for (const d of data) {
      merged.set(d.id as string, { ...d, __subKey: subscriptionKey });
    }
    data = Array.from(merged.values());
  }

  const history: CallRecord[] = [];
  let incomingCall: CallRecord | null = null;
  let currentCall: CallRecord | null = null;

  for (const d of data) {
    const call = mapCall(d);
    const isParticipant = call.participantIds.includes(currentUserId);
    if (!isParticipant) continue;

    if (['ended', 'rejected', 'missed'].includes(call.status)) {
      history.push(call);
    } else if (call.status === 'calling' && call.initiatorId !== currentUserId) {
      incomingCall = call;
    } else if (call.status === 'calling' && call.initiatorId === currentUserId) {
      currentCall = call;
    } else if (call.status === 'connected') {
      currentCall = call;
    }
  }

  history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  onUpdateHistory(history.slice(0, 30));

  const existingIncomingCall = getState().incomingCall;
  if (incomingCall?.id !== existingIncomingCall?.id) {
    if (incomingCall !== null || !subscriptionKey) {
      onIncomingCall(incomingCall);
    } else {
      const merged = mergedCallData.get(currentUserId);
      const hasActiveIncoming = merged
        ? Array.from(merged.values()).some((d) => {
            const c = mapCall(d);
            return c.status === 'calling' && c.initiatorId !== currentUserId && c.participantIds.includes(currentUserId);
          })
        : false;
      if (!hasActiveIncoming) onIncomingCall(null);
    }
  }

  const existingCurrentCall = getState().currentCall;
  if (currentCall?.id !== existingCurrentCall?.id || currentCall?.status !== existingCurrentCall?.status) {
    onUpdateCurrentCall(currentCall);
  }
};

export const useCallStore = create<CallStore>((set, get) => ({
  currentCall: null,
  incomingCall: null,
  connectedAt: null,
  history: [],
  loading: false,
  participants: [],

  inviteToCall: async (currentCallId, currentUserId, invitedUserId) => {
    if (!isFirestoreAvailable() || !currentCallId || !currentUserId || !invitedUserId) return;
    const { currentCall, participants } = get();
    if (currentCallId !== currentCall?.id) return;
    if (participants.includes(invitedUserId)) return;
    try {
      const next = Array.from(new Set([...participants, invitedUserId]));
      set({ participants: next });
      const data = await getDocById(COLLECTIONS.CALL_HISTORY, currentCallId);
      const existing = (data as Record<string, unknown>)?.participantIds as string[] | undefined;
      const merged = Array.from(new Set([
        ...(existing || []),
        currentUserId,
        ...(currentCall?.participantIds || []),
        invitedUserId,
      ]));
      await updateDocById(COLLECTIONS.CALL_HISTORY, currentCallId, { participantIds: merged });
    } catch {
      // ignore
    }
  },

  subscribeToCallHistory: (userId: string) => {
    if (!userId || !isFirestoreAvailable()) {
      set({ history: [], loading: false });
      return () => {};
    }

    set({ loading: true });

    const onUpdateHistory = (history: CallRecord[]) => set({ history, loading: false });
    const noopIncoming = () => {};
    const noopCurrent = () => {};

    const historyKey = `history_${userId}`;
    const unsubCaller = subscribeToCollection(
      COLLECTIONS.CALL_HISTORY,
      [where('callerId', '==', userId), orderBy('createdAt', 'desc'), limit(30)],
      (data) => {
        processCallData(data, userId, onUpdateHistory, noopIncoming, noopCurrent, get, `${historyKey}_caller`);
      }
    );

    const unsubCallee = subscribeToCollection(
      COLLECTIONS.CALL_HISTORY,
      [where('calleeId', '==', userId), orderBy('createdAt', 'desc'), limit(30)],
      (data) => {
        processCallData(data, userId, onUpdateHistory, noopIncoming, noopCurrent, get, `${historyKey}_callee`);
      }
    );

    return () => {
      mergedCallData.delete(userId);
      unsubCaller();
      unsubCallee();
    };
  },

  clearCallHistory: async (userId: string) => {
    if (!isFirestoreAvailable() || !userId) {
      set({ history: [] });
      return;
    }
    const { history } = get();
    try {
      const { deleteDocById } = await import('@/lib/firestore');
      await Promise.allSettled(history.map((c) => deleteDocById(COLLECTIONS.CALL_HISTORY, c.id)));
    } catch { /* ignore individual failures */ }
    set({ history: [] });
  },

  deleteCall: async (callId: string) => {
    if (!isFirestoreAvailable() || !callId) return;
    try {
      const { deleteDocById } = await import('@/lib/firestore');
      await deleteDocById(COLLECTIONS.CALL_HISTORY, callId);
      set({ history: get().history.filter((c) => c.id !== callId) });
    } catch {
      // ignore
    }
  },

  startCall: async (userId, currentUserId, type) => {
    if (!isFirestoreAvailable()) {
      throw new Error('Database unavailable. Cannot start call.');
    }
    if (!currentUserId) throw new Error('You must be logged in to make a call');
    if (get().currentCall) return get().currentCall!.id;
    try {
      const callId = await addDocToCollection(COLLECTIONS.CALL_HISTORY, {
        callerId: currentUserId,
        calleeId: userId,
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
        const duration = connectedAt ? Math.floor((Date.now() - connectedAt.getTime()) / 1000) : 0;
        await updateDocById(COLLECTIONS.CALL_HISTORY, currentCall.id, {
          status: 'ended',
          endedAt: serverTimestamp(),
          duration: duration > 0 ? duration : 0,
        });
      } catch { /* best-effort: call-history update is non-critical */ }
    }
    set({ currentCall: null, incomingCall: null, connectedAt: null });
  },

  acceptCall: async () => {
    if (!isFirestoreAvailable()) return;
    const { incomingCall } = get();
    if (!incomingCall) return;
    if (!['calling', 'connected'].includes(incomingCall.status)) return;
    try {
      await updateDocById(COLLECTIONS.CALL_HISTORY, incomingCall.id, { status: 'connected' });
    } catch { return; }
    const now = new Date();
    set({
      currentCall: { ...incomingCall, status: 'connected' },
      incomingCall: null,
      connectedAt: now,
    });
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
      } catch { /* best-effort: call-history update is non-critical */ }
    }
    set({ incomingCall: null, connectedAt: null });
  },

  subscribeCalls: (userId: string) => {
    if (!userId || !isFirestoreAvailable()) {
      set({ history: [] });
      return () => {};
    }

    const MISSED_CALL_MS = 45_000;
    const missedTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const scheduleMissedTimeout = (callId: string) => {
      if (missedTimers.has(callId)) return;
      const timer = setTimeout(async () => {
        missedTimers.delete(callId);
        if (!isFirestoreAvailable()) return;
        try {
          const data = await getDocById(COLLECTIONS.CALL_HISTORY, callId);
          if (!data || (data as Record<string, unknown>).status !== 'calling') return;

          const cur = get().currentCall as CallRecord | null;
          const inc = get().incomingCall as CallRecord | null;
          if (cur?.id === callId) set({ currentCall: null, connectedAt: null });
          if (inc?.id === callId) set({ incomingCall: null });

          await updateDocById(COLLECTIONS.CALL_HISTORY, callId, {
            status: 'missed',
            endedAt: serverTimestamp(),
            duration: 0,
          });
        } catch { /* best-effort: call-history update is non-critical */ }
      }, MISSED_CALL_MS);
      missedTimers.set(callId, timer);
    };

    const clearMissedTimeout = (callId: string) => {
      const t = missedTimers.get(callId);
      if (t) {
        clearTimeout(t);
        missedTimers.delete(callId);
      }
    };

    const onUpdateHistory = (history: CallRecord[]) => set({ history });
    const onIncomingCall = (call: CallRecord | null) => {
      const cur = get().currentCall;
      if (call && cur && cur.status !== 'ended' && cur.status !== 'rejected' && cur.id !== call.id) {
        if (isFirestoreAvailable()) {
          void updateDocById(COLLECTIONS.CALL_HISTORY, call.id, {
            status: 'rejected',
            endedAt: serverTimestamp(),
            duration: 0,
          }).catch(() => {});
        }
        set({ incomingCall: null });
        return;
      }

      set({ incomingCall: call });
      if (call) {
        scheduleMissedTimeout(call.id);
      } else {
        const existing = get().incomingCall;
        if (existing) clearMissedTimeout(existing.id);
      }
    };

    const onUpdateCurrentCall = (call: CallRecord | null) => {
      const prev = get().currentCall;
      const patch: Partial<CallStore> = {};
      if (call?.status === 'connected' && prev?.status !== 'connected' && !get().connectedAt) {
        patch.connectedAt = new Date();
      } else if (!call || call.status === 'ended' || call.status === 'rejected' || call.status === 'missed') {
        patch.connectedAt = null;
      }
      set({ currentCall: call, ...patch });

      if (call && call.status === 'calling' && call.initiatorId === userId) {
        scheduleMissedTimeout(call.id);
      } else if (prev && prev.initiatorId === userId && prev.status === 'calling') {
        clearMissedTimeout(prev.id);
      }
    };

    const unsubCaller = subscribeToCollection(
      COLLECTIONS.CALL_HISTORY,
      [where('callerId', '==', userId), orderBy('createdAt', 'desc'), limit(30)],
      (data) => {
        processCallData(data, userId, onUpdateHistory, onIncomingCall, onUpdateCurrentCall, get, 'caller');
      }
    );

    const unsubCallee = subscribeToCollection(
      COLLECTIONS.CALL_HISTORY,
      [where('calleeId', '==', userId), orderBy('createdAt', 'desc'), limit(30)],
      (data) => {
        processCallData(data, userId, onUpdateHistory, onIncomingCall, onUpdateCurrentCall, get, 'callee');
      }
    );

    return () => {
      missedTimers.forEach((t) => clearTimeout(t));
      missedTimers.clear();
      mergedCallData.delete(userId);
      unsubCaller();
      unsubCallee();
    };
  },
}));
