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
import { subscribeDeduped } from '@/lib/subscriptionManager';

interface CallStore {
  currentCall: CallRecord | null;
  incomingCall: CallRecord | null;
  connectedAt: Date | null;
  history: CallRecord[];
  loading: boolean;
  participants: string[];
  callTimeoutId: ReturnType<typeof setTimeout> | null;
  lastCallError?: { message: string; timestamp: number };

  startCall: (userId: string, currentUserId: string, type: 'voice' | 'video' | 'group_voice' | 'group_video') => Promise<string | undefined>;
  inviteToCall: (currentCallId: string, currentUserId: string, invitedUserId: string) => Promise<void>;
  endCall: () => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  subscribeCalls: (userId: string) => () => void;
  subscribeToCallHistory: (userId: string) => () => void;
  clearCallHistory: (userId: string) => Promise<void>;
  deleteCall: (callId: string) => Promise<void>;
  cancelCallIfStale: () => void;
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

function formatMediaPermissionError(type: 'voice' | 'video' | 'group_voice' | 'group_video', err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unknown media access error';
  if (/Permission|NotAllowed|denied|denied by user/i.test(message)) {
    return type === 'video' || type === 'group_video'
      ? 'Camera and microphone permission was blocked. Please allow access and try again.'
      : 'Microphone permission was blocked. Please allow access and try again.';
  }
  if (/NotFound|device|camera|microphone/i.test(message)) {
    return 'No camera or microphone was detected. Check your device settings and try again.';
  }
  return 'Unable to access your microphone or camera. Please check your device permissions and try again.';
}

async function verifyCallMediaAccess(type: 'voice' | 'video' | 'group_voice' | 'group_video') {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

  const video = type === 'video' || type === 'group_video';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video,
    });
    stream.getTracks().forEach((track) => track.stop());
  } catch (error) {
    throw new Error(formatMediaPermissionError(type, error));
  }
}

/** Determines if a call start error is transient and should trigger retry. */
function isTransientCallError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  // Transient network errors
  return message.includes('network') ||
    message.includes('timeout') ||
    message.includes('firestore') ||
    message.includes('unavailable') ||
    message.includes('connection');
}

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
  callTimeoutId: null,
  lastCallError: undefined,

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
      return () => { };
    }

    set({ loading: true });

    const onUpdateHistory = (history: CallRecord[]) => set({ history, loading: false });
    const noopIncoming = () => { };
    const noopCurrent = () => { };

    const historyKey = `history_${userId}`;
    const unsubCaller = subscribeDeduped(
      `call_history_caller_${userId}`,
      () => subscribeToCollection(
        COLLECTIONS.CALL_HISTORY,
        [where('callerId', '==', userId), orderBy('createdAt', 'desc'), limit(30)],
        (data) => {
          processCallData(data, userId, onUpdateHistory, noopIncoming, noopCurrent, get, `${historyKey}_caller`);
        }
      )
    );

    const unsubCallee = subscribeDeduped(
      `call_history_callee_${userId}`,
      () => subscribeToCollection(
        COLLECTIONS.CALL_HISTORY,
        [where('calleeId', '==', userId), orderBy('createdAt', 'desc'), limit(30)],
        (data) => {
          processCallData(data, userId, onUpdateHistory, noopIncoming, noopCurrent, get, `${historyKey}_callee`);
        }
      )
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
    if (userId === currentUserId) throw new Error('You cannot start a call with yourself.');
    if (get().currentCall) return get().currentCall!.id;

    const MAX_RETRIES = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await verifyCallMediaAccess(type);
      } catch (error) {
        throw error instanceof Error ? error : new Error('Unable to access your microphone or camera.');
      }

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

        // Set call timeout: if call is not accepted within 60 seconds, auto-end it
        const timeoutId = setTimeout(async () => {
          const { currentCall: stillPending } = get();
          if (stillPending?.id === callId && stillPending.status === 'calling') {
            try {
              await updateDocById(COLLECTIONS.CALL_HISTORY, callId, {
                status: 'ended',
                endedAt: serverTimestamp(),
                duration: 0,
              });
            } catch {
              // best-effort cleanup
            }
            set({ currentCall: null });
          }
        }, 60000); // 60 second timeout

        set({ callTimeoutId: timeoutId });

        return callId;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on transient errors
        if (!isTransientCallError(lastError) || attempt === MAX_RETRIES) {
          set({
            lastCallError: {
              message: lastError.message || 'Failed to start the call.',
              timestamp: Date.now(),
            },
          });
          throw lastError;
        }

        // Exponential backoff: 500ms, 1s, 2s
        const delayMs = Math.pow(2, attempt) * 500;
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    throw lastError || new Error('Failed to start the call after retries.');
  },

  endCall: async () => {
    if (!isFirestoreAvailable()) {
      set({ currentCall: null, incomingCall: null, connectedAt: null, callTimeoutId: null });
      return;
    }

    const { currentCall, connectedAt, callTimeoutId } = get();

    // Clear pending call timeout
    if (callTimeoutId) {
      clearTimeout(callTimeoutId);
      set({ callTimeoutId: null });
    }

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
    set({ currentCall: null, incomingCall: null, connectedAt: null, callTimeoutId: null });
  },

  cancelCallIfStale: () => {
    const { callTimeoutId } = get();
    // Cancel the timeout if component unmounts to avoid orphaned calls
    if (callTimeoutId) {
      clearTimeout(callTimeoutId);
      set({ callTimeoutId: null });
    }
    // Optionally end the call on component unmount (can be customized per use case)
    // For now, we'll just clear the timeout and let the server-side timeout handle it
  },

  acceptCall: async () => {
    if (!isFirestoreAvailable()) return;
    const { incomingCall } = get();
    if (!incomingCall) return;

    // Only accept calls in 'calling' state — don't accept already-connected or rejected calls
    if (incomingCall.status !== 'calling') return;

    try {
      await updateDocById(COLLECTIONS.CALL_HISTORY, incomingCall.id, { status: 'connected' });
    } catch (error) {
      // Log error but don't crash the UI
      console.error('Failed to accept call:', error);
      return;
    }

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
      return () => { };
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
          }).catch(() => { });
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

    const unsubCaller = subscribeDeduped(
      `call_caller_${userId}`,
      () => subscribeToCollection(
        COLLECTIONS.CALL_HISTORY,
        [where('callerId', '==', userId), orderBy('createdAt', 'desc'), limit(30)],
        (data) => {
          processCallData(data, userId, onUpdateHistory, onIncomingCall, onUpdateCurrentCall, get, 'caller');
        }
      )
    );

    const unsubCallee = subscribeDeduped(
      `call_callee_${userId}`,
      () => subscribeToCollection(
        COLLECTIONS.CALL_HISTORY,
        [where('calleeId', '==', userId), orderBy('createdAt', 'desc'), limit(30)],
        (data) => {
          processCallData(data, userId, onUpdateHistory, onIncomingCall, onUpdateCurrentCall, get, 'callee');
        }
      )
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
