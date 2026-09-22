/**
 * Client-side helpers for fetching ZEGOCLOUD tokens from the server.
 *
 * The ZEGO ServerSecret must NEVER ship in the client bundle, so all tokens are
 * minted by the `zego-token` Supabase Edge Function and fetched here with the
 * caller's Supabase session as a Bearer token.
 *
 * Two token kinds are supported:
 *   * RTC kit token  — for the Express SDK / UI Kit (`ZegoUIKitPrebuilt.create`).
 *   * ZIM token      — a token04 user-identity token for the ZIM SDK used for
 *                      call-invitation signalling.
 */
import { getZegoTokenServerUrl } from '@/lib/zego';
import env from '@/config/env';
import { getSupabaseSafe } from '@/lib/supabase';

function resolveTokenServerUrl(): string | null {
  const url = getZegoTokenServerUrl() || env.VITE_ZEGO_TOKEN_SERVER_URL;
  return url || null;
}

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseSafe();
  if (!supabase) return null;
  const session = await supabase.auth.getSession().catch(() => null);
  return session?.data?.session?.access_token ?? null;
}

async function requestToken(params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const tokenServerUrl = resolveTokenServerUrl();
  if (!tokenServerUrl) return null;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.warn('[ZEGO] No auth session available for server token request.');
    return null;
  }

  try {
    const url = new URL(
      tokenServerUrl.startsWith('/')
        ? `${window.location.origin}${tokenServerUrl}`
        : tokenServerUrl,
      window.location.origin,
    );
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      console.warn(`[ZEGO] Token server responded ${response.status}.`);
      return null;
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (err) {
    console.warn('[ZEGO] Token server fetch failed.', err);
    return null;
  }
}

/**
 * Fetches a ZEGO UI Kit token for the given room/user. Returns null when the
 * token server is unavailable or the caller is not a participant of the call.
 */
export async function fetchZegoKitToken(
  roomID: string,
  userID: string,
  userName?: string,
): Promise<string | null> {
  const data = await requestToken({ room: roomID, user: userID, name: userName ?? '' });
  const token = data?.token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

/**
 * Fetches a ZIM user-identity token for call-invitation signalling.
 */
export async function fetchZimToken(userID: string): Promise<string | null> {
  const data = await requestToken({ user: userID, type: 'zim' });
  const token = data?.zimToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}
