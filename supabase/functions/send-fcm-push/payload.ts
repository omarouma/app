export type Push = {
  type: string; user_id: string; chat_id?: string; caller_id?: string;
  call_id?: string; caller_name?: string; sender_name?: string;
  title?: string; body?: string; request_id?: string; actor_id?: string; event_id?: string;
  data?: Record<string, string>;
  message_preview?: string; room_id?: string; is_video?: boolean | string;
};
export const supportedTypes = new Set(["message", "call", "call_cancel", "call_ended", "friend_request", "friend_accepted"]);

export function buildMessage(body: Push, token: string) {
  if (!supportedTypes.has(body.type)) throw new Error("UNKNOWN_TYPE");
  const data: Record<string, string> = {
    type: body.type, recipient_user_id: body.user_id,
    chat_id: String(body.chat_id ?? ""), conversation_id: String(body.chat_id ?? ""),
  };
  if (body.type === "message") {
    data.sender_name = String(body.sender_name ?? "GaGa").slice(0, 100);
    data.title = data.sender_name;
    data.message_preview = String(body.message_preview ?? "New message").slice(0, 500);
  } else if (body.type === "friend_request" || body.type === "friend_accepted") {
    // Friend events are addressed to a user and must be handled in Android's
    // friend notification channel; they have no conversation id.
    data.title = String(body.title ?? (
      body.type === "friend_request" ? "New friend request" : "Friend request accepted"
    )).slice(0, 100);
    data.body = String(body.body ?? (
      body.type === "friend_request" ? "Someone wants to connect with you on GaGa." :
      "Your friend request was accepted on GaGa."
    )).slice(0, 300);
    data.request_id = String(body.request_id ?? body.data?.request_id ?? "").slice(0, 100);
    data.actor_id = String(body.actor_id ?? body.data?.actor_id ?? "").slice(0, 100);
    data.event_id = String(body.event_id ?? "").slice(0, 160);
  } else {
    data.call_id = String(body.call_id ?? "");
    if (body.type === "call") {
      data.caller_name = String(body.caller_name ?? "GaGa User").slice(0, 100);
      data.is_video = String(body.is_video === true || body.is_video === "true");
      data.room_id = String(body.room_id ?? "");
      data.caller_id = String(body.caller_id ?? "");
    }
  }
  // Data-only delivery reaches the app receiver in foreground AND background,
  // preserving its account checks, preferences, and conversation deep link.
  // Short call TTL prevents an old invitation ringing after a device reconnects.
  return { token, data, android: { priority: "high", ttl: body.type === "message" ? "86400s" : "60s" } };
}

export function errorCode(body: unknown): string {
  const error = (body as { error?: { status?: string; details?: Array<{ errorCode?: string }> } })?.error;
  return error?.details?.find(d => d.errorCode)?.errorCode ?? error?.status ?? "FCM_SEND_FAILED";
}

/** Validates Firebase credentials/project permissions without any device data. */
export async function validateConfiguration(project: string, bearer: string, fetcher: typeof fetch) {
  const response = await fetcher(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
    method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ validate_only: true, message: {
      topic: "gaga-configuration-validation", data: { configuration_check: "true" },
    } }),
  });
  return { success: response.ok, dry_run: true, sent: 0, project_id: project,
    error: response.ok ? null : errorCode(await response.json().catch(() => null)) };
}

export async function sendBatch(options: {
  body: Push; tokens: string[]; project: string; bearer: string; dryRun: boolean;
  fetcher: typeof fetch; invalidate: (token: string) => Promise<void>;
}) {
  let accepted = 0;
  const errors: string[] = [];
  for (const token of [...new Set(options.tokens)]) {
    try {
      const response = await options.fetcher(`https://fcm.googleapis.com/v1/projects/${options.project}/messages:send`, {
        method: "POST", headers: { Authorization: `Bearer ${options.bearer}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ validate_only: options.dryRun, message: buildMessage(options.body, token) }),
      });
      if (response.ok) accepted++;
      else {
        const code = errorCode(await response.json().catch(() => null));
        errors.push(code);
        // Invalid payloads and credential failures must never revoke valid tokens.
        if (code === "UNREGISTERED" && !options.dryRun) await options.invalidate(token);
      }
    } catch { errors.push("FCM_TRANSPORT_FAILED"); }
  }
  return { success: errors.length === 0, sent: options.dryRun ? 0 : accepted,
    validated: options.dryRun ? accepted : 0, failed: errors.length,
    errors: [...new Set(errors)], dry_run: options.dryRun };
}
