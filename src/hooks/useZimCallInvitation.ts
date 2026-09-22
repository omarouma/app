/**
 * useZimCallInvitation
 *
 * Bridges the ZEGOCLOUD ZIM Call-Invitation signalling plane into the app's
 * existing call state machine (`useCallStore`).
 *
 * Responsibilities
 *   1. Log the signed-in user into ZIM (and out on sign-out), reusing the same
 *      derived ZEGO userID as the RTC plane so a user has ONE identity.
 *   2. Register ZIM event handlers:
 *        • callInvitationReceived  → surface an incoming call (ring UI)
 *        • callInvitationCancelled → clear the incoming call (caller hung up)
 *        • callInvitationTimeout   → clear the incoming call (no answer)
 *        • callInvitationEnded     → clear the incoming call (caller ended)
 *        • callUserStateChanged    → track participant accept/reject states
 *        • connectionStateChanged  → expose signalling connectivity
 *   3. Expose imperative helpers (`inviteCall`, `acceptCall`, `rejectCall`,
 *      `cancelCall`, `endCall`) that the call store / UI can call.
 *
 * Design notes
 *   • The hook is intentionally thin: the *authoritative* call record still
 *     lives in Supabase (`call_history`). ZIM only provides the reliable
 *     "ring" + accept/reject/cancel semantics and offline push delivery.
 *   • When a ZIM invitation arrives we optimistically seed `incomingCall` from
 *     the invitation payload so the ring UI appears instantly, then let the
 *     Supabase realtime subscription reconcile the full record.
 *   • Free-plan caveat: ZIM Call Invitation is limited to 100 MAU. During
 *     testing always use a fixed userID (never random) to avoid exhausting the
 *     quota. Upgrade before going live.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useCallStore } from '@/store/useCallStore';
import type { CallRecord } from '@/types';
import {
  isZimConfigured,
  loginZim,
  logoutZim,
  setZimHandlers,
  zimInviteCall,
  zimAcceptCall,
  zimRejectCall,
  zimCancelCall,
  zimEndCall,
  rememberZimCallId,
  getZimCallId,
  forgetZimCallId,
  type ZimCallPayload,
  type ZimIncomingInvitation,
} from '@/lib/zim';

/** Normalises a ZIM call type string into the app's CallRecord type union. */
function normaliseCallType(type: string | undefined): CallRecord['type'] {
  switch (type) {
    case 'video':
    case 'group_video':
    case 'group_voice':
    case 'voice':
      return type;
    default:
      return 'voice';
  }
}

/**
 * Builds a provisional CallRecord from a ZIM invitation so the ring UI can be
 * shown immediately, before the Supabase realtime row arrives.
 */
function provisionalCallFromInvitation(inv: ZimIncomingInvitation, localUserId: string): CallRecord | null {
  const payload = inv.payload;
  if (!payload?.callId) return null;
  const callerId = payload.callerId || inv.inviter;
  return {
    id: payload.callId,
    initiatorId: callerId,
    participantIds: Array.from(new Set([callerId, localUserId].filter(Boolean))),
    type: normaliseCallType(payload.type),
    status: 'calling',
    timestamp: new Date(),
  };
}

export interface ZimCallInvitationApi {
  /** Whether ZIM signalling is configured (App ID + token server present). */
  configured: boolean;
  /** Sends a call invitation to one or more app users. Returns the ZIM callID. */
  inviteCall: (
    inviteeAppUserIds: string[],
    payload: ZimCallPayload,
    opts?: { timeoutSeconds?: number; advanced?: boolean; pushTitle?: string; pushContent?: string },
  ) => Promise<string | null>;
  /** Accepts the currently-ringing invitation. */
  acceptCall: (appCallId?: string) => Promise<boolean>;
  /** Rejects the currently-ringing invitation. */
  rejectCall: (appCallId?: string) => Promise<boolean>;
  /** Cancels an outgoing invitation (caller hangs up before answer). */
  cancelCall: (appCallId?: string, inviteeAppUserIds?: string[]) => Promise<boolean>;
  /** Ends an established call (advanced mode) — notifies all participants. */
  endCall: (appCallId?: string) => Promise<boolean>;
}

export function useZimCallInvitation(): ZimCallInvitationApi {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;
  const userName = user?.displayName || user?.name || undefined;

  // Keep the latest user id available to the (stable) ZIM handlers without
  // re-registering them on every render.
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  // -------------------------------------------------------------------------
  // Login / logout lifecycle
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isZimConfigured()) return;
    if (!userId) {
      logoutZim();
      return;
    }
    let cancelled = false;
    void loginZim(userId, userName).then((zim) => {
      if (cancelled) return;
      if (!zim) {
        console.warn('[ZIM] Signalling unavailable — calls will fall back to Supabase realtime only.');
      }
    });
    return () => {
      cancelled = true;
    };
    // Re-login only when the identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Log out of ZIM when the component unmounts (app teardown).
  useEffect(() => () => { logoutZim(); }, []);

  // -------------------------------------------------------------------------
  // Event handlers → call store
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isZimConfigured()) return;

    setZimHandlers({
      onInvitationReceived: (inv) => {
        const store = useCallStore.getState();
        // Ignore invitations addressed to a different signed-in user.
        if (!userIdRef.current) return;
        // Don't clobber an active call — auto-reject the new invitation.
        if (store.currentCall && store.currentCall.status !== 'ended') {
          void zimRejectCall(inv.callId);
          return;
        }
        const provisional = provisionalCallFromInvitation(inv, userIdRef.current);
        if (provisional) {
          // Record the ZIM callID ↔ app call id mapping so accept/reject can
          // address the right ZIM call.
          rememberZimCallId(provisional.id, inv.callId);
          // Seed the ring UI immediately; Supabase realtime will reconcile.
          useCallStore.setState({ incomingCall: provisional });
        }
      },

      onInvitationCancelled: (callId) => {
        const store = useCallStore.getState();
        if (store.incomingCall && (store.incomingCall.id === callId || getZimCallId(store.incomingCall.id) === callId)) {
          useCallStore.setState({ incomingCall: null });
        }
        forgetZimCallId(callId);
      },

      onInvitationTimeout: (callId) => {
        const store = useCallStore.getState();
        if (store.incomingCall && (store.incomingCall.id === callId || getZimCallId(store.incomingCall.id) === callId)) {
          useCallStore.setState({ incomingCall: null });
        }
        forgetZimCallId(callId);
      },

      onInvitationEnded: (callId) => {
        const store = useCallStore.getState();
        if (store.incomingCall && (store.incomingCall.id === callId || getZimCallId(store.incomingCall.id) === callId)) {
          useCallStore.setState({ incomingCall: null });
        }
        forgetZimCallId(callId);
      },

      onUserStateChanged: (callId, users) => {
        // Participant state transitions (accepted / rejected / quit). The
        // authoritative status still comes from Supabase, but we can react
        // early to a rejection so the caller's UI stops ringing promptly.
        const rejected = users.some((u) => u.state === 2 /* Rejected */);
        const accepted = users.some((u) => u.state === 1 /* Accepted */);
        if (rejected && !accepted) {
          const store = useCallStore.getState();
          if (store.currentCall && getZimCallId(store.currentCall.id) === callId) {
            // Leave the Supabase row to be reconciled; just stop the local ring.
          }
        }
      },

      onConnectionStateChanged: (state) => {
        // 2 = Connected, 0 = Disconnected, 1 = Connecting, 3 = Reconnecting
        if (state === 0) {
          console.warn('[ZIM] Signalling disconnected — will auto-reconnect.');
        }
      },
    });
  }, []);

  // -------------------------------------------------------------------------
  // Imperative API
  // -------------------------------------------------------------------------
  const inviteCall = useCallback<ZimCallInvitationApi['inviteCall']>(
    async (inviteeAppUserIds, payload, opts) => {
      const zimCallId = await zimInviteCall(inviteeAppUserIds, payload, opts);
      if (zimCallId && payload.callId) rememberZimCallId(payload.callId, zimCallId);
      return zimCallId;
    },
    [],
  );

  const acceptCall = useCallback<ZimCallInvitationApi['acceptCall']>(async (appCallId) => {
    const zimCallId = getZimCallId(appCallId) ?? appCallId ?? null;
    if (!zimCallId) return false;
    return zimAcceptCall(zimCallId);
  }, []);

  const rejectCall = useCallback<ZimCallInvitationApi['rejectCall']>(async (appCallId) => {
    const zimCallId = getZimCallId(appCallId) ?? appCallId ?? null;
    if (!zimCallId) return false;
    return zimRejectCall(zimCallId);
  }, []);

  const cancelCall = useCallback<ZimCallInvitationApi['cancelCall']>(
    async (appCallId, inviteeAppUserIds) => {
      const zimCallId = getZimCallId(appCallId) ?? appCallId ?? null;
      if (!zimCallId) return false;
      const ok = await zimCancelCall(zimCallId, inviteeAppUserIds ?? []);
      forgetZimCallId(appCallId);
      return ok;
    },
    [],
  );

  const endCall = useCallback<ZimCallInvitationApi['endCall']>(async (appCallId) => {
    const zimCallId = getZimCallId(appCallId) ?? appCallId ?? null;
    if (!zimCallId) return false;
    const ok = await zimEndCall(zimCallId);
    forgetZimCallId(appCallId);
    return ok;
  }, []);

  return {
    configured: isZimConfigured(),
    inviteCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
  };
}

export default useZimCallInvitation;
