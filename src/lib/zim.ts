/**
 * ZEGOCLOUD ZIM (Instant Messaging) client — used ONLY for call-invitation
 * signalling.
 *
 * Why ZIM for signalling?
 *   The ZEGO Express SDK (UI Kit) handles the media plane (audio/video), but it
 *   has no notion of "ringing" a specific user. ZIM's Call Invitation feature
 *   provides exactly that: a reliable, server-acknowledged invitation with
 *   accept / reject / cancel / timeout semantics, plus offline push delivery
 *   when the callee's app is terminated.
 *
 * Architecture notes
 *   * The ZIM SDK is heavy (protobuf + crypto), so it is **lazy-loaded** via a
 *     dynamic import — it never touches the initial bundle.
 *   * The ZIM user identity token is minted server-side by the `zego-token`
 *     Edge Function (`?type=zim`) and fetched with the caller's Supabase
 *     session. The ZEGO ServerSecret never ships to the client.
 *   * ZIM userIDs must be stable and unique per user. We reuse the same
 *     `deriveZegoUserID()` mapping as the RTC layer so a user has ONE identity
 *     across both planes.
 *
 * Free-plan caveat (from ZEGOCLOUD support):
 *   The Call Invitation feature runs on ZIM, whose free plan is limited to
 *   100 MAU. During testing always use a fixed userID (never random) to avoid
 *   exhausting the quota. Upgrade before going live.
 */
import { ZEGO_APP_ID, deriveZegoUserID, isZegoConfigured } from '@/lib/zego';
import { fetchZimToken } from '@/lib/zegoToken';

// ---------------------------------------------------------------------------
// Types (kept structural so we don't hard-depend on the SDK's type exports at
// module-eval time — the SDK is loaded lazily).
// ---------------------------------------------------------------------------

/** Payload we attach to every call invitation via `extendedData`. */
export interface ZimCallPayload {
  /** The `call_history` document id — the single source of truth for the call. */
  callId: string;
  /** The caller's *app* user id (Supabase uuid) — lets the callee resolve the
   *  caller even before the `call_history` row is readable. */
  callerId?: string;
  /** 'voice' | 'video' | 'group_voice' | 'group_video' */
  type: string;
  /** Display name of the caller (for the incoming-call UI). */
  callerName?: string;
  /** Avatar URL of the caller. */
  callerAvatar?: string;
  /** ZEGO RTC room id the callee should join once accepted. */
  roomId?: string;
}

export interface ZimIncomingInvitation {
  callId: string;
  inviter: string;
  mode: number;
  payload: ZimCallPayload | null;
  raw: unknown;
}

type ZimInstance = {
  login: (userID: string, config: Record<string, unknown>) => Promise<void>;
  logout: (config?: Record<string, unknown>) => void;
  renewToken: (token: string) => Promise<unknown>;
  on: (type: string, listener: (...args: unknown[]) => void) => void;
  off: (type: string) => void;
  callInvite: (invitees: string[], config: Record<string, unknown>) => Promise<{ callID: string }>;
  callCancel: (invitees: string[], callID: string, config: Record<string, unknown>) => Promise<unknown>;
  callAccept: (callID: string, config: Record<string, unknown>) => Promise<unknown>;
  callReject: (callID: string, config: Record<string, unknown>) => Promise<unknown>;
  callQuit: (callID: string, config: Record<string, unknown>) => Promise<unknown>;
  callEnd: (callID: string, config: Record<string, unknown>) => Promise<unknown>;
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let zimInstance: ZimInstance | null = null;
let zimModulePromise: Promise<Record<string, unknown>> | null = null;
let loggedInUserId: string | null = null;
let loginPromise: Promise<ZimInstance | null> | null = null;

/** Registered event listeners, so we can re-attach after a re-login. */
type ZimHandlers = {
  onInvitationReceived?: (inv: ZimIncomingInvitation) => void;
  onInvitationCancelled?: (callId: string, inviter: string) => void;
  onInvitationTimeout?: (callId: string) => void;
  onInvitationEnded?: (callId: string, operatedUserId: string) => void;
  onUserStateChanged?: (callId: string, users: Array<{ userID: string; state: number }>) => void;
  onConnectionStateChanged?: (state: number) => void;
};

let handlers: ZimHandlers = {};

/**
 * Maps the app's `call_history` document id → the ZIM callID returned by
 * `callInvite`. Needed because cancel/end operate on the ZIM callID, while the
 * rest of the app keys everything off the `call_history` id.
 */
const zimCallIdByAppCallId = new Map<string, string>();

/** Records the ZIM callID for an app call id (called after a successful invite). */
export function rememberZimCallId(appCallId: string, zimCallId: string): void {
  if (appCallId && zimCallId) zimCallIdByAppCallId.set(appCallId, zimCallId);
}

/** Resolves the ZIM callID for an app call id, if one was recorded. */
export function getZimCallId(appCallId: string | undefined | null): string | null {
  if (!appCallId) return null;
  return zimCallIdByAppCallId.get(appCallId) ?? null;
}

/** Drops the ZIM callID mapping for an app call id. */
export function forgetZimCallId(appCallId: string | undefined | null): void {
  if (appCallId) zimCallIdByAppCallId.delete(appCallId);
}

/** Whether ZIM signalling is configured (App ID + token server present). */
export function isZimConfigured(): boolean {
  return isZegoConfigured() && ZEGO_APP_ID > 0;
}

/** The ZIM userID currently logged in, or null. */
export function getZimUserId(): string | null {
  return loggedInUserId;
}

/** Whether a ZIM session is currently established. */
export function isZimLoggedIn(): boolean {
  return !!zimInstance && !!loggedInUserId;
}

// ---------------------------------------------------------------------------
// Lazy module loader
// ---------------------------------------------------------------------------

async function loadZimModule(): Promise<Record<string, unknown>> {
  if (!zimModulePromise) {
    zimModulePromise = import('zego-zim-web') as unknown as Promise<Record<string, unknown>>;
  }
  return zimModulePromise;
}

function parsePayload(extendedData: string | undefined | null): ZimCallPayload | null {
  if (!extendedData) return null;
  try {
    const parsed = JSON.parse(extendedData) as ZimCallPayload;
    if (parsed && typeof parsed.callId === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Login / logout
// ---------------------------------------------------------------------------

/**
 * Logs the given app user into ZIM. Idempotent: repeated calls for the same
 * user resolve to the existing session. Returns null when ZIM is not
 * configured or the token could not be minted.
 */
export async function loginZim(
  appUserId: string,
  userName?: string,
): Promise<ZimInstance | null> {
  if (!isZimConfigured()) return null;
  if (!appUserId) return null;

  const zimUserId = deriveZegoUserID(appUserId);

  // Already logged in as this user — reuse.
  if (zimInstance && loggedInUserId === zimUserId) return zimInstance;

  // A login for this user is already in flight — share it.
  if (loginPromise && loggedInUserId === zimUserId) return loginPromise;

  loginPromise = (async () => {
    try {
      const mod = await loadZimModule();
      const ZIM = mod.ZIM as { create: (cfg: { appID: number }) => ZimInstance | null };
      if (!ZIM || typeof ZIM.create !== 'function') {
        console.warn('[ZIM] SDK did not expose ZIM.create');
        return null;
      }

      // If a different user is logged in, log them out first.
      if (zimInstance && loggedInUserId && loggedInUserId !== zimUserId) {
        try { zimInstance.logout(); } catch { /* ignore */ }
        zimInstance = null;
        loggedInUserId = null;
      }

      if (!zimInstance) {
        zimInstance = ZIM.create({ appID: ZEGO_APP_ID });
        if (!zimInstance) {
          console.warn('[ZIM] ZIM.create returned null');
          return null;
        }
        attachHandlers(zimInstance);
      }

      const token = await fetchZimToken(zimUserId);
      if (!token) {
        console.warn('[ZIM] Could not mint a ZIM token — signalling disabled.');
        return null;
      }

      await zimInstance.login(zimUserId, {
        token,
        userName: userName || zimUserId,
      });

      loggedInUserId = zimUserId;
      return zimInstance;
    } catch (err) {
      console.warn('[ZIM] login failed:', err);
      return null;
    } finally {
      loginPromise = null;
    }
  })();

  return loginPromise;
}

/** Logs out of ZIM and clears the session. */
export function logoutZim(): void {
  if (zimInstance) {
    try { zimInstance.logout(); } catch { /* ignore */ }
  }
  zimInstance = null;
  loggedInUserId = null;
  loginPromise = null;
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

/** Registers the consumer's callbacks. Safe to call before login. */
export function setZimHandlers(next: ZimHandlers): void {
  handlers = { ...handlers, ...next };
  if (zimInstance) attachHandlers(zimInstance);
}

function attachHandlers(zim: ZimInstance): void {
  // Detach first so re-login doesn't stack listeners.
  for (const evt of [
    'callInvitationReceived',
    'callInvitationCancelled',
    'callInvitationTimeout',
    'callInvitationEnded',
    'callUserStateChanged',
    'connectionStateChanged',
  ]) {
    try { zim.off(evt); } catch { /* ignore */ }
  }

  zim.on('callInvitationReceived', (...args: unknown[]) => {
    const result = args[1] as {
      callID: string;
      inviter: string;
      mode: number;
      extendedData?: string;
    } | undefined;
    if (!result) return;
    handlers.onInvitationReceived?.({
      callId: result.callID,
      inviter: result.inviter,
      mode: result.mode,
      payload: parsePayload(result.extendedData),
      raw: result,
    });
  });

  zim.on('callInvitationCancelled', (...args: unknown[]) => {
    const result = args[1] as { callID: string; inviter: string } | undefined;
    if (!result) return;
    handlers.onInvitationCancelled?.(result.callID, result.inviter);
  });

  zim.on('callInvitationTimeout', (...args: unknown[]) => {
    const result = args[1] as { callID: string } | undefined;
    if (!result) return;
    handlers.onInvitationTimeout?.(result.callID);
  });

  zim.on('callInvitationEnded', (...args: unknown[]) => {
    const result = args[1] as { callID: string; operatedUserID: string } | undefined;
    if (!result) return;
    handlers.onInvitationEnded?.(result.callID, result.operatedUserID);
  });

  zim.on('callUserStateChanged', (...args: unknown[]) => {
    const result = args[1] as {
      callID: string;
      callUserList: Array<{ userID: string; state: number }>;
    } | undefined;
    if (!result) return;
    handlers.onUserStateChanged?.(result.callID, result.callUserList ?? []);
  });

  zim.on('connectionStateChanged', (...args: unknown[]) => {
    const result = args[1] as { state: number } | undefined;
    if (!result) return;
    handlers.onConnectionStateChanged?.(result.state);
  });
}

// ---------------------------------------------------------------------------
// Call-invitation actions
// ---------------------------------------------------------------------------

/**
 * Sends a call invitation to one or more users.
 * Returns the ZIM callID (used to cancel/end later) or null on failure.
 */
export async function zimInviteCall(
  inviteeAppUserIds: string[],
  payload: ZimCallPayload,
  opts?: { timeoutSeconds?: number; advanced?: boolean; pushTitle?: string; pushContent?: string },
): Promise<string | null> {
  if (!zimInstance || !loggedInUserId) return null;
  const invitees = inviteeAppUserIds.map(deriveZegoUserID).filter(Boolean);
  if (invitees.length === 0) return null;

  try {
    const mod = await loadZimModule();
    const Mode = mod.ZIMCallInvitationMode as { General: number; Advanced: number } | undefined;
    const mode = opts?.advanced ? (Mode?.Advanced ?? 1) : (Mode?.General ?? 0);

    const config: Record<string, unknown> = {
      timeout: Math.min(Math.max(opts?.timeoutSeconds ?? 60, 1), 600),
      mode,
      extendedData: JSON.stringify(payload),
    };

    // Offline push (delivered when the callee's app is terminated).
    if (opts?.pushTitle || opts?.pushContent) {
      config.pushConfig = {
        title: opts.pushTitle ?? 'Incoming call',
        content: opts.pushContent ?? 'You have an incoming call',
        payload: JSON.stringify(payload),
      };
    }

    const result = await zimInstance.callInvite(invitees, config);
    return result?.callID ?? null;
  } catch (err) {
    console.warn('[ZIM] callInvite failed:', err);
    return null;
  }
}

/** Accepts an incoming call invitation. */
export async function zimAcceptCall(callId: string): Promise<boolean> {
  if (!zimInstance || !callId) return false;
  try {
    await zimInstance.callAccept(callId, { extendedData: '' });
    return true;
  } catch (err) {
    console.warn('[ZIM] callAccept failed:', err);
    return false;
  }
}

/** Rejects an incoming call invitation. */
export async function zimRejectCall(callId: string): Promise<boolean> {
  if (!zimInstance || !callId) return false;
  try {
    await zimInstance.callReject(callId, { extendedData: '' });
    return true;
  } catch (err) {
    console.warn('[ZIM] callReject failed:', err);
    return false;
  }
}

/** Cancels an outgoing invitation (caller hangs up before the callee answers). */
export async function zimCancelCall(callId: string, inviteeAppUserIds: string[]): Promise<boolean> {
  if (!zimInstance || !callId) return false;
  try {
    const invitees = inviteeAppUserIds.map(deriveZegoUserID).filter(Boolean);
    await zimInstance.callCancel(invitees, callId, { extendedData: '' });
    return true;
  } catch (err) {
    console.warn('[ZIM] callCancel failed:', err);
    return false;
  }
}

/** Ends an established call (advanced mode) — notifies all participants. */
export async function zimEndCall(callId: string): Promise<boolean> {
  if (!zimInstance || !callId) return false;
  try {
    await zimInstance.callEnd(callId, { extendedData: '' });
    return true;
  } catch (err) {
    console.warn('[ZIM] callEnd failed:', err);
    return false;
  }
}

/** Quits a call the local user had joined (advanced mode). */
export async function zimQuitCall(callId: string): Promise<boolean> {
  if (!zimInstance || !callId) return false;
  try {
    await zimInstance.callQuit(callId, { extendedData: '' });
    return true;
  } catch (err) {
    console.warn('[ZIM] callQuit failed:', err);
    return false;
  }
}
