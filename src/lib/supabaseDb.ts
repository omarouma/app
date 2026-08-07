/*
  supabaseDb.ts — Supabase database adapter.

  Provides the same interface as firestoreLegacy.ts so stores/pages need no changes.
  All field mapping (camelCase ↔ snake_case) happens here transparently.
*/
import { getSupabaseSafe } from './supabase';

export function isSupabaseAvailable(): boolean {
  return !!getSupabaseSafe();
}

export function getDb() {
  return getSupabaseSafe();
}

// ─── Column fallback helpers ───────────────────────────────────────────
// Supabase schema may be missing columns. Retry without unknown columns
// so the app keeps working while the admin runs supabase_migration.sql.

const MAX_COLUMN_RETRIES = 20;

function isColumnMissingError(error: any): boolean {
  if (!error) return false;
  const code = error.code || '';
  const msg = error.message || '';
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    msg.includes('Could not find the') ||
    msg.includes('column of') ||
    msg.includes('in the schema cache') ||
    msg.includes('does not exist')
  );
}

function extractMissingColumn(error: any): string | null {
  const msg = error?.message || '';
  const m = msg.match(/Could not find the '([^']+)' column/);
  if (m) return m[1];
  const m2 = msg.match(/column "([^"]+)" does not exist/);
  if (m2) return m2[1];
  return null;
}

async function insertWithFallback(
  table: string,
  payload: Record<string, any>
): Promise<{ data: any; error: any }> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not available');

  const data = { ...payload };
  let retries = 0;
  while (retries < MAX_COLUMN_RETRIES) {
    const result = await supabase.from(table).insert(data).select('id').single();
    if (!result.error) return result;

    if (isColumnMissingError(result.error)) {
      const col = extractMissingColumn(result.error);
      if (col && col in data) {
          delete data[col];
        retries++;
        continue;
      }
    }
    return result;
  }
  return { data: null, error: new Error('Max column retries exceeded') };
}

async function updateWithFallback(
  table: string,
  id: string,
  payload: Record<string, any>,
  extraEq?: Record<string, any>
): Promise<{ data: any; error: any }> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not available');

  const data = { ...payload };
  let retries = 0;
  let query = supabase.from(table).update(data).eq('id', id);
  if (extraEq) {
    for (const [k, v] of Object.entries(extraEq)) {
      query = query.eq(k, v);
    }
  }

  while (retries < MAX_COLUMN_RETRIES) {
    const result = await query;
    if (!result.error) return result;

    if (isColumnMissingError(result.error)) {
      const col = extractMissingColumn(result.error);
      if (col && col in data) {
        delete data[col];
        retries++;
        // Rebuild query with reduced data so next iteration uses updated payload
        query = supabase.from(table).update({ ...data }).eq('id', id);
        if (extraEq) {
          for (const [k, v] of Object.entries(extraEq)) {
            query = query.eq(k, v);
          }
        }
        continue;
      }
    }
    return result;
  }
  return { data: null, error: new Error('Max column retries exceeded') };
}

async function upsertWithFallback(
  table: string,
  payload: Record<string, any>
): Promise<{ data: any; error: any }> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not available');

  const data = { ...payload };
  let retries = 0;
  while (retries < MAX_COLUMN_RETRIES) {
    const result = await supabase.from(table).upsert(data, { onConflict: 'id' });
    if (!result.error) return result;

    if (isColumnMissingError(result.error)) {
      const col = extractMissingColumn(result.error);
      if (col && col in data) {
          delete data[col];
        retries++;
        continue;
      }
    }
    return result;
  }
  return { data: null, error: new Error('Max column retries exceeded') };
}

// ─── Collection name map ───────────────────────────────────────────────
export const COLLECTIONS = {
  CHATS: 'chats',
  MESSAGES: 'messages',
  USERS: 'users',
  POSTS: 'posts',
  STORIES: 'stories',
  REELS: 'reels',
  LIVE_STREAMS: 'live_streams',
  FRIENDSHIPS: 'friendships',
  FRIEND_REQUESTS: 'friend_requests',
  BLOCKED_USERS: 'blocked_users',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
  SUBSCRIPTIONS: 'subscriptions',
  REFERRALS: 'referrals',
  TIPS: 'tips',
  CREATOR_SUBSCRIPTIONS: 'creator_subscriptions',
  ADS: 'ads',
  ACHIEVEMENTS: 'achievements',
  STREAKS: 'streaks',
  POST_VIEWS: 'post_views',
  STORY_HIGHLIGHTS: 'story_highlights',
  BOOKMARKS: 'bookmarks',
  BOOKMARK_COLLECTIONS: 'bookmark_collections',
  CALL_HISTORY: 'call_history',
  HASHTAGS: 'hashtags',
  POLLS: 'polls',
  WALLETS: 'wallets',
  PRESENCE: 'presence',
  TYPING: 'typing',
  REPORTS: 'reports',
  GROUPS: 'groups',
  VOICE_ROOMS: 'voice_rooms',
  BROADCAST_LISTS: 'broadcast_lists',
  USER_REPORTS: 'user_reports',
} as const;

// ─── camelCase → snake_case field map ─────────────────────────────────
const FIELD_TO_DB: Record<string, string> = {
  userId: 'user_id',
  userName: 'user_name',
  userAvatar: 'user_avatar',
  timestamp: 'created_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  lastSeen: 'last_seen',
  lastMessage: 'last_message',
  mediaUrl: 'media_url',
  mediaUrls: 'media_urls',
  displayName: 'display_name',
  statusMessage: 'status_message',
  isVerified: 'is_verified',
  isAdmin: 'is_admin',
  isMuted: 'is_muted',
  isOnline: 'is_online',
  isTyping: 'is_typing',
  isPremium: 'is_premium',
  unreadCount: 'unread_count',
  videoUrl: 'video_url',
  thumbnailUrl: 'thumbnail_url',
  forwardedFrom: 'forwarded_from',
  pollData: 'poll_data',
  transferData: 'transfer_data',
  contactCard: 'contact_card',
  replyTo: 'reply_to',
  chatId: 'chat_id',
  senderId: 'sender_id',
  fromUserId: 'from_user_id',
  toUserId: 'to_user_id',
  friendId: 'friend_id',
  blockerId: 'blocker_id',
  blockedId: 'blocked_id',
  groupId: 'group_id',
  postId: 'post_id',
  creatorId: 'creator_id',
  participantIds: 'participant_ids',
  pinnedMessages: 'pinned_messages',
  disappearingMessages: 'disappearing_messages',
  chatLocked: 'chat_locked',
  lockType: 'lock_type',
  lockValue: 'lock_value',
  storyId: 'story_id',
  reelId: 'reel_id',
callId: 'call_id',
  callerId: 'caller_id',
  calleeId: 'callee_id',
  bdtBalance: 'bdt_balance',
  usdBalance: 'usd_balance',
  disappearingTimer: 'disappearing_timer',
  disappearingInitiatedAt: 'disappearing_initiated_at',
  friendRequestPrivacy: 'friend_request_privacy',
  hideOnlineStatus: 'hide_online_status',
  hideFriendList: 'hide_friend_list',
  groupAddPrivacy: 'group_add_privacy',
  coverImage: 'cover_image',
  createdBy: 'created_by',
  admins: 'admins',
  participants: 'participants',
};

const DB_TO_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_TO_DB).map(([k, v]) => [v, k])
);

function toSnake(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const mapped = FIELD_TO_DB[k] ?? k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    out[mapped] = v;
  }
  return out;
}

function toCamel(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const mapped = DB_TO_FIELD[k] ?? k.replace(/_([a-z])/g, (_, m) => m.toUpperCase());
    out[mapped] = v;
  }
  return out;
}

function mapRows<T>(rows: any[] | null): (T & { id: string })[] {
  if (!rows) return [];
  return rows.map((r) => ({ ...toCamel(r), id: r.id })) as (T & { id: string })[];
}

// ─── Query constraint helpers ──────────────────────────────────────────
export type QueryConstraint =
  | { _type: 'where'; field: string; op: string; value: any }
  | { _type: 'orderBy'; field: string; direction: 'asc' | 'desc' }
  | { _type: 'limit'; count: number }
  | { _type: 'startAfter'; cursor: any };

export function where(field: string, op: string, value: any): QueryConstraint {
  return { _type: 'where', field, op, value };
}
export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): QueryConstraint {
  return { _type: 'orderBy', field, direction };
}
export function limit(count: number): QueryConstraint {
  return { _type: 'limit', count };
}
export function startAfter(cursor: any): QueryConstraint {
  return { _type: 'startAfter', cursor };
}

export function serverTimestamp(): string {
  return new Date().toISOString();
}

// ─── Atomic operation markers ──────────────────────────────────────────
export function increment(n: number) {
  return { _increment: n };
}
export function arrayUnion<T>(...values: T[]) {
  return { _arrayUnion: values };
}
export function arrayRemove<T>(...values: T[]) {
  return { _arrayRemove: values };
}

// ─── Apply query constraints to a Supabase query builder ──────────────
function applyConstraints(query: any, constraints: QueryConstraint[]): any {
  let q = query;
  let lastOrderField: string | null = null;
  let lastOrderDir: 'asc' | 'desc' = 'asc';
  for (const c of constraints) {
    if (c._type === 'where') {
      const field = FIELD_TO_DB[c.field] ?? c.field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      switch (c.op) {
        case '==': q = q.eq(field, c.value); break;
        case '!=': q = q.neq(field, c.value); break;
        case '>': q = q.gt(field, c.value); break;
        case '>=': q = q.gte(field, c.value); break;
        case '<': q = q.lt(field, c.value); break;
        case '<=': q = q.lte(field, c.value); break;
        case 'in': q = q.in(field, c.value); break;
        case 'array-contains': q = q.contains(field, [c.value]); break;
        case 'array-contains-any': q = q.overlaps(field, c.value); break;
      }
    } else if (c._type === 'orderBy') {
      const field = FIELD_TO_DB[c.field] ?? c.field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      lastOrderField = field;
      lastOrderDir = c.direction;
      q = q.order(field, { ascending: c.direction === 'asc' });
    } else if (c._type === 'limit') {
      q = q.limit(c.count);
    } else if (c._type === 'startAfter') {
      if (lastOrderField) {
        const cursor = c.cursor instanceof Date ? c.cursor.toISOString() : c.cursor;
        if (lastOrderDir === 'asc') {
          q = q.gt(lastOrderField, cursor);
        } else {
          q = q.lt(lastOrderField, cursor);
        }
      }
    }
  }
  return q;
}

// ─── Resolve atomic ops (increment, arrayUnion, arrayRemove) + dot-notation ──────────
async function resolveAtomics(
  table: string,
  id: string,
  data: Record<string, any>,
): Promise<Record<string, any>> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not available');

  // Separate dot-notation keys (e.g. unread_count.user123) from flat keys
  const dotKeys: Record<string, { path: string[]; value: any }[]> = {};
  const flatData: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key.includes('.')) {
      const [parent, ...path] = key.split('.');
      if (!dotKeys[parent]) dotKeys[parent] = [];
      dotKeys[parent].push({ path, value });
    } else {
      flatData[key] = value;
    }
  }

  const hasAtomic = Object.values(data).some(
    (v) => v && typeof v === 'object' && ('_increment' in v || '_arrayUnion' in v || '_arrayRemove' in v),
  );
  const hasDotKeys = Object.keys(dotKeys).length > 0;

  if (!hasAtomic && !hasDotKeys) return data;

  const { data: current, error } = await supabase.from(table).select('*').eq('id', id).single();
  if (error || !current) throw new Error(`Failed to fetch current doc: ${error?.message}`);

  const resolved: Record<string, any> = {};

  // Handle dot-notation keys (grouped by parent column, e.g. unread_count)
  for (const [parent, updates] of Object.entries(dotKeys)) {
    let currentValue = current[parent] || {};
    if (typeof currentValue !== 'object' || currentValue === null) {
      currentValue = {};
    }

    for (const { path, value } of updates) {
      let target = currentValue;
      for (let i = 0; i < path.length - 1; i++) {
        if (!target[path[i]] || typeof target[path[i]] !== 'object') {
          target[path[i]] = {};
        }
        target = target[path[i]];
      }

      const lastKey = path[path.length - 1];
      // Handle atomic values nested inside dot-notation
      if (value && typeof value === 'object' && '_increment' in value) {
        target[lastKey] = ((target[lastKey] as number) ?? 0) + value._increment;
      } else if (value && typeof value === 'object' && '_arrayUnion' in value) {
        const arr = Array.isArray(target[lastKey]) ? target[lastKey] : [];
        target[lastKey] = [...new Set([...arr, ...(value._arrayUnion as any[])])];
      } else if (value && typeof value === 'object' && '_arrayRemove' in value) {
        const arr = Array.isArray(target[lastKey]) ? target[lastKey] : [];
        const toRemove = new Set(value._arrayRemove as any[]);
        target[lastKey] = arr.filter((item: any) => !toRemove.has(item));
      } else {
        target[lastKey] = value;
      }
    }

    resolved[parent] = currentValue;
  }

  // Handle flat keys (including atomic ops on flat columns)
  for (const [key, value] of Object.entries(flatData)) {
    if (value && typeof value === 'object' && '_increment' in value) {
      resolved[key] = ((current[key] as number) ?? 0) + value._increment;
    } else if (value && typeof value === 'object' && '_arrayUnion' in value) {
      const arr: any[] = Array.isArray(current[key]) ? current[key] : [];
      resolved[key] = [...new Set([...arr, ...(value._arrayUnion as any[])])];
    } else if (value && typeof value === 'object' && '_arrayRemove' in value) {
      const arr: any[] = Array.isArray(current[key]) ? current[key] : [];
      const toRemove = new Set(value._arrayRemove as any[]);
      resolved[key] = arr.filter((item: any) => !toRemove.has(item));
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

// ─── CRUD ──────────────────────────────────────────────────────────────

export async function getDocById<T = any>(
  table: string,
  id: string,
): Promise<(T & { id: string }) | null> {
  const supabase = getDb();
  if (!supabase || !id) return null;
  const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
  if (error || !data) return null;
  return { ...toCamel(data), id: data.id } as T & { id: string };
}

export async function setDocById(
  table: string,
  id: string,
  data: any,
  _merge = true,
): Promise<void> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not available');
  const payload = { ...toSnake(data), id };
  const result = await upsertWithFallback(table, payload);
  if (result.error) throw result.error;
}

export async function updateDocById(
  table: string,
  id: string,
  data: any,
): Promise<void> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not available');
  const snaked = toSnake(data);
  const resolved = await resolveAtomics(table, id, snaked);
  const result = await updateWithFallback(table, id, resolved);
  if (result.error) throw result.error;
}

export async function deleteDocById(table: string, id: string): Promise<void> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not available');
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

export async function addDocToCollection(table: string, data: any): Promise<string> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not available');
  const result = await insertWithFallback(table, toSnake(data));
  if (result.error) throw result.error;
  return result.data?.id ?? '';
}

// Explicit FK column map — extend this when adding new subcollection relationships
const FK_COLUMN: Record<string, Record<string, string>> = {
  [COLLECTIONS.CHATS]: {
    [COLLECTIONS.MESSAGES]: 'chat_id',
  },
  [COLLECTIONS.POSTS]: {
    comments: 'post_id',
  },
  [COLLECTIONS.REELS]: {
    comments: 'reel_id',
  },
  [COLLECTIONS.STORIES]: {
    viewers: 'story_id',
  },
  [COLLECTIONS.GROUPS]: {
    members: 'group_id',
  },
[COLLECTIONS.LIVE_STREAMS]: {
    comments: 'stream_id',
    gifts: 'stream_id',
    signals: 'stream_id',
  },
  [COLLECTIONS.VOICE_ROOMS]: {
    signals: 'room_id',
  },
};

function fkColumn(parentTable: string, subTable: string): string {
  const fk = FK_COLUMN[parentTable]?.[subTable];
  if (fk) return fk;
  // Fallback: strip trailing 's' (works for simple plurals like 'chats' → 'chat_id')
  // Log a warning for any unmapped pair so it's easy to catch during development
  return `${parentTable.replace(/s$/, '')}_id`;
}

export async function addDocToSubcollection(
  parentTable: string,
  parentId: string,
  subTable: string,
  data: any,
): Promise<string> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not available');
  const fk = fkColumn(parentTable, subTable);
  const payload = { ...toSnake(data), [fk]: parentId };
  const result = await insertWithFallback(subTable, payload);
  if (result.error) throw result.error;
  return result.data?.id ?? '';
}

export async function updateSubcollectionDoc(
  parentTable: string,
  parentId: string,
  subTable: string,
  subDocId: string,
  data: any,
): Promise<void> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not available');
  const fk = fkColumn(parentTable, subTable);
  const snaked = toSnake(data);
  const resolved = await resolveAtomics(subTable, subDocId, snaked);
  const result = await updateWithFallback(subTable, subDocId, resolved, { [fk]: parentId });
  if (result.error) throw result.error;
}

export async function deleteSubcollectionDoc(
  parentTable: string,
  parentId: string,
  subTable: string,
  subDocId: string,
): Promise<void> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not available');
  const fk = fkColumn(parentTable, subTable);
  const { error } = await supabase
    .from(subTable)
    .delete()
    .eq('id', subDocId)
    .eq(fk, parentId);
  if (error) throw error;
}

export async function queryCollection<T = any>(
  table: string,
  constraints: QueryConstraint[],
): Promise<(T & { id: string })[]> {
  const supabase = getDb();
  if (!supabase) return [];
  const q = applyConstraints(supabase.from(table).select('*'), constraints);
  const { data, error } = await q;
  if (error) {
    console.error(`[queryCollection] ${table}:`, error.message);
    return [];
  }
  return mapRows<T>(data);
}

export async function querySubcollection<T = any>(
  parentTable: string,
  parentId: string,
  subTable: string,
  constraints: QueryConstraint[],
): Promise<(T & { id: string })[]> {
  const fk = fkColumn(parentTable, subTable);
  return queryCollection<T>(subTable, [where(fk, '==', parentId), ...constraints]);
}

// ─── Real-time subscriptions ───────────────────────────────────────────

// ─── Realtime connection status bus ────────────────────────────────────
// Lets the UI layer (e.g. NetworkStatusBanner) surface realtime socket health
// independent of browser online/offline state. A Supabase channel uses a
// WebSocket/SSE transport that can drop even while the browser is "online",
// so we track it here and emit events consumers can subscribe to.
export type RealtimeStatus = 'connected' | 'disconnected' | 'reconnecting';

let realtimeStatus: RealtimeStatus = 'connected';
const realtimeListeners = new Set<(s: RealtimeStatus) => void>();

function setRealtimeStatus(next: RealtimeStatus) {
  if (realtimeStatus === next) return;
  realtimeStatus = next;
  realtimeListeners.forEach((l) => { try { l(next); } catch { /* ignore */ } });
  try {
    window.dispatchEvent(new CustomEvent<RealtimeStatus>('gaga-realtime-status', { detail: next }));
  } catch { /* SSR-safe */ }
}

export function getRealtimeStatus(): RealtimeStatus {
  return realtimeStatus;
}

export function onRealtimeStatusChange(listener: (s: RealtimeStatus) => void): () => void {
  realtimeListeners.add(listener);
  return () => realtimeListeners.delete(listener);
}

// ─── Channel resilience helper ─────────────────────────────────────────
// Attaches system-level handlers to a realtime channel so a dropped WebSocket
// transport is detected and transparently re-subscribed. Also surfaces the
// status to the UI bus. `onResubscribe` re-runs the channel's event wiring.
const REALTIME_RESUBSCRIBE_MS = 2000;

export function attachRealtimeResilience(
  channel: any,
  onResubscribe: () => void,
): void {
  let resubscribed = false;
  channel.on('system', (event: string) => {
    if (event === 'SUBSCRIBED') {
      setRealtimeStatus('connected');
      resubscribed = false;
    } else if (event === 'ERROR') {
      setRealtimeStatus('reconnecting');
    } else if (event === 'WEB_TRANSPORT_CLOSED') {
      setRealtimeStatus('disconnected');
      if (!resubscribed) {
        resubscribed = true;
        setTimeout(() => {
          try {
            onResubscribe();
            channel.subscribe();
          } catch { /* ignore */ }
        }, REALTIME_RESUBSCRIBE_MS);
      }
    }
  });
}

// Module-level channel sequence counter. Each subscribeToCollection() call must
// get a UNIQUE channel name — reusing a deterministic name (e.g.
// `call_history:caller_id=eq.<userId>`) collides when the same filter is
// subscribed twice (App-level `subscribeCalls` + page-level `subscribeToCallHistory`),
// causing Supabase to reject adding a callback "after subscribe()".
let channelSeq = 0;

export function subscribeToDoc(
  table: string,
  id: string,
  onData: (data: any) => void,
): () => void {
  const supabase = getDb();
  if (!supabase) return () => {};

  // Initial fetch
  supabase.from(table).select('*').eq('id', id).single().then(({ data }) => {
    if (data) onData({ ...toCamel(data), id: data.id });
  }, () => {});

const channel = supabase.channel(`${table}:id=${id}`);
  const wireChanges = () => {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `id=eq.${id}` },
      ({ new: row }) => {
        if (row && typeof row === 'object' && 'id' in row) {
          onData({ ...toCamel(row as Record<string, any>), id: (row as any).id });
        }
      },
    );
  };
  wireChanges();
  attachRealtimeResilience(channel, wireChanges);
  channel.subscribe();

  return () => { supabase.removeChannel(channel); };
}

export function subscribeToCollection<T = any>(
  table: string,
  constraints: QueryConstraint[],
  onData: (data: (T & { id: string })[]) => void,
): () => void {
  const supabase = getDb();
  if (!supabase) return () => {};

  const getFieldValue = (obj: any, path: string) => {
    if (!obj || !path) return undefined;
    if (!path.includes('.')) return obj[path];
    return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
  };

  const toComparable = (v: any) => {
    if (v == null) return v;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const t = Date.parse(v);
      return Number.isNaN(t) ? v : t;
    }
    return v;
  };

// Map a constraint field (which may be snake_case DB column OR camelCase) to the
  // camelCase field name used on the mapped rows returned by toCamel()/mapRows().
  // e.g. subcollection FK filters use 'chat_id' but rows expose 'chatId'.
  const toCamelField = (f: string) => DB_TO_FIELD[f] ?? f;

  const matchesWhere = (row: any, c: Extract<QueryConstraint, { _type: 'where' }>) => {
    const v = getFieldValue(row, toCamelField(c.field));
    switch (c.op) {
      case '==': return v === c.value;
      case '!=': return v !== c.value;
      case '>': return toComparable(v) > toComparable(c.value);
      case '>=': return toComparable(v) >= toComparable(c.value);
      case '<': return toComparable(v) < toComparable(c.value);
      case '<=': return toComparable(v) <= toComparable(c.value);
      case 'in': return Array.isArray(c.value) && c.value.includes(v);
      case 'array-contains': return Array.isArray(v) && v.includes(c.value);
      case 'array-contains-any': return Array.isArray(v) && Array.isArray(c.value) && v.some((x) => c.value.includes(x));
      default: return true;
    }
  };

  const matchesWheres = (row: any) =>
    constraints.every((c) => (c._type === 'where' ? matchesWhere(row, c) : true));

  const applyOrderLimit = (items: (T & { id: string })[]) => {
    let orderField: string | null = null;
    let orderDir: 'asc' | 'desc' = 'asc';
    let limitCount: number | null = null;
    for (const c of constraints) {
      if (c._type === 'orderBy') {
        orderField = c.field;
        orderDir = c.direction;
      } else if (c._type === 'limit') {
        limitCount = c.count;
      }
    }

// Normalize the order field to camelCase so it matches the mapped rows.
    const orderFieldCamel = orderField ? toCamelField(orderField) : null;
    let out = items;
    if (orderFieldCamel) {
      out = [...out].sort((a: any, b: any) => {
        const av = toComparable(getFieldValue(a, orderFieldCamel!));
        const bv = toComparable(getFieldValue(b, orderFieldCamel!));
        if (av === bv) return 0;
        if (av == null) return orderDir === 'asc' ? -1 : 1;
        if (bv == null) return orderDir === 'asc' ? 1 : -1;
        return (av > bv ? 1 : -1) * (orderDir === 'asc' ? 1 : -1);
      });
    }
    if (typeof limitCount === 'number') out = out.slice(0, limitCount);
    return out;
  };

  const hasStartAfter = constraints.some((c) => c._type === 'startAfter');
  let current: (T & { id: string })[] = [];

  const refetch = async () => {
    const data = await queryCollection<T>(table, constraints).catch(() => []);
    current = data;
    onData(current);
  };

  refetch();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedRefetch = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { refetch().catch(() => {}); }, 150);
  };

  const handleChange = (payload: any) => {
    if (hasStartAfter) {
      debouncedRefetch();
      return;
    }

    const eventType = payload?.eventType as string | undefined;
    const newRow = payload?.new as Record<string, any> | null | undefined;
    const oldRow = payload?.old as Record<string, any> | null | undefined;

    const id = (newRow && (newRow as any).id) || (oldRow && (oldRow as any).id);
    if (!id) return;

    if (eventType === 'DELETE') {
      current = current.filter((x) => x.id !== id);
      onData(applyOrderLimit(current));
      return;
    }

    if (!newRow) {
      debouncedRefetch();
      return;
    }

    const item = { ...toCamel(newRow), id } as T & { id: string };
    const matches = matchesWheres(item);

    const idx = current.findIndex((x) => x.id === id);
    if (matches) {
      if (idx >= 0) current[idx] = item;
      else current.push(item);
    } else if (idx >= 0) {
      current.splice(idx, 1);
    }

    onData(applyOrderLimit(current));
  };

  const filterC = constraints.find(
    (c): c is Extract<QueryConstraint, { _type: 'where' }> =>
      c._type === 'where' && (c.op === '==' || c.op === 'array-contains'),
  );
  let filter: string | undefined;
  if (filterC) {
    const field = FIELD_TO_DB[filterC.field] ?? filterC.field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    if (filterC.op === 'array-contains') {
      filter = `${field}=cs.{${filterC.value}}`;
    } else {
      filter = `${field}=eq.${filterC.value}`;
    }
  }

// Each call to subscribeToCollection must get a UNIQUE channel name. Reusing a
  // deterministic name (e.g. `call_history:caller_id=eq.<userId>`) collides when the
  // same filter is subscribed twice (App-level `subscribeCalls` + page-level
  // `subscribeToCallHistory`), causing Supabase to reject adding a callback
  // "after subscribe()". The module-level counter below guarantees uniqueness.
  const channelId = filter
    ? `${table}:${filter}:${++channelSeq}`
    : `${table}:all:${Date.now()}:${++channelSeq}`;
const filterConfig = filter ? { filter } : {};
  const channel = supabase.channel(channelId);
  const wireChanges = () => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, ...filterConfig }, handleChange);
  };
  wireChanges();
  attachRealtimeResilience(channel, wireChanges);
  channel.subscribe();

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    supabase.removeChannel(channel);
  };
}

export function subscribeToSubcollection<T = any>(
  parentTable: string,
  parentId: string,
  subTable: string,
  constraints: QueryConstraint[],
  onData: (data: (T & { id: string })[]) => void,
): () => void {
  const fk = fkColumn(parentTable, subTable);
  return subscribeToCollection<T>(
    subTable,
    [where(fk, '==', parentId), ...constraints],
    onData,
  );
}

// ─── Batch helpers ─────────────────────────────────────────────────────

export async function batchWrite(
  operations: Array<{ collection: string; docId: string; data?: any; delete?: boolean }>,
): Promise<void> {
  await Promise.all(
    operations.map((op) =>
      op.delete
        ? deleteDocById(op.collection, op.docId)
        : op.data
          ? updateDocById(op.collection, op.docId, op.data)
          : Promise.resolve()
    )
  );
}

export async function batchDelete(
  arg1: string | { collection: string; docId: string }[],
  arg2?: QueryConstraint[],
): Promise<void> {
  if (typeof arg1 === 'string') {
    const items = await queryCollection(arg1, arg2 ?? []);
    await Promise.all(items.map((item) => deleteDocById(arg1, item.id)));
  } else {
    await Promise.all(arg1.map((item) => deleteDocById(item.collection, item.docId)));
  }
}

export async function runDbTransaction<T>(updateFn: (t: any) => Promise<T>): Promise<T> {
  const supabase = getDb();
  if (!supabase) throw new Error('Supabase not available');
  return updateFn(supabase);
}

// ─── Atomic unread / read-receipt RPC helpers ─────────────────────────
// Use SECURITY DEFINER RPCs (see supabase_realtime_fixes.sql) to update
// unread counts and read receipts in a single round-trip instead of the
// read-then-write fallback below.

export async function incrementChatUnread(
  chatId: string,
  senderId: string,
): Promise<void> {
  const supabase = getDb();
  if (!supabase) { throw new Error('Supabase not available'); }
  const { error } = await supabase.rpc('increment_chat_unread', {
    p_chat_id: chatId,
    p_sender_id: senderId,
  });
  if (error) {
    // Fallback: client-side increment for the sender's unread jsonb key.
    await updateChatUnreadFallback(chatId, senderId);
  }
}

export async function markChatRead(
  chatId: string,
  userId: string,
): Promise<void> {
  const supabase = getDb();
  if (!supabase) { throw new Error('Supabase not available'); }
  const { error } = await supabase.rpc('mark_chat_read', {
    p_chat_id: chatId,
    p_user_id: userId,
  });
  if (error) {
    throw error;
  }
}

async function updateChatUnreadFallback(
  chatId: string,
  senderId: string,
): Promise<void> {
  const supabase = getDb();
  if (!supabase) return;
  const { data: chat } = await supabase
    .from('chats')
    .select('participants, unread_count')
    .eq('id', chatId)
    .single();
  if (!chat) return;
  const participants: string[] = Array.isArray(chat.participants) ? chat.participants : [];
  const others = participants.filter((id: string) => id !== senderId);
  if (others.length === 0) return;
  const current: Record<string, number> =
    chat.unread_count && typeof chat.unread_count === 'object'
      ? chat.unread_count
      : {};
  const next: Record<string, number> = { ...current };
  for (const id of others) {
    next[id] = (next[id] ?? 0) + 1;
  }
  await supabase.from('chats').update({ unread_count: next }).eq('id', chatId);
}

// ─── Misc helpers ──────────────────────────────────────────────────────

export function fromFirestoreDate(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

export function updateSubcollectionDocSafe(
  p: string, pId: string, s: string, sId: string, data: any,
) {
  return updateSubcollectionDoc(p, pId, s, sId, data);
}

export async function getDbSafe() {
  return getDb();
}

export class Timestamp {
  public seconds: number;
  public nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  toDate() { return new Date(this.seconds * 1000 + this.nanoseconds / 1_000_000); }
  toMillis() { return this.seconds * 1000 + this.nanoseconds / 1_000_000; }
  static now() {
    const now = Date.now();
    return new Timestamp(Math.floor(now / 1000), (now % 1000) * 1_000_000);
  }
  static fromDate(date: Date) {
    const ms = date.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1_000_000);
  }
}
