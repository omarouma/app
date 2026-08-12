import {
  safeGetStorageItem,
  safeSetStorageItem,
  safeRemoveStorageItem,
  safeGetAllStorageKeys,
} from './safeStorage';

/**
 * Cleans up stale localStorage entries to prevent bloat.
 * Called once on app startup (non-blocking).
 */
export function runStorageCleanup(): void {
  try {
    const now = Date.now();
    const DAY = 86_400_000;

    // Remove chat drafts — cap at 50 total
    const draftKeys = safeGetAllStorageKeys().filter((k: string) => k.startsWith('chat_draft_'));
    if (draftKeys.length > 50) {
      draftKeys.slice(0, draftKeys.length - 50).forEach((k: string) => safeRemoveStorageItem(k));
    }

    // Remove expired reel draft (older than 1 day)
    try {
      const reelDraft = safeGetStorageItem('gaga_reel_draft');
      if (reelDraft) {
        const parsed = JSON.parse(reelDraft) as { savedAt?: number };
        if (parsed.savedAt && now - parsed.savedAt > DAY) safeRemoveStorageItem('gaga_reel_draft');
      }
    } catch { /* ignore */ }

    // Remove scheduled messages older than 7 days
    // Key matches useScheduledMessages.ts: 'gaga_scheduled_messages'
    try {
      const raw = safeGetStorageItem('gaga_scheduled_messages');
      if (raw) {
        const msgs = JSON.parse(raw) as Array<{ scheduledAt?: number }>;
        const fresh = msgs.filter((m) => m.scheduledAt && m.scheduledAt > now - 7 * DAY);
        if (fresh.length === 0) safeRemoveStorageItem('gaga_scheduled_messages');
        else if (fresh.length !== msgs.length) safeSetStorageItem('gaga_scheduled_messages', JSON.stringify(fresh));
      }
    } catch { safeRemoveStorageItem('gaga_scheduled_messages'); }

    // Remove offline queue entries older than 7 days
    // Key matches useOfflineQueue.ts: 'gaga-message-queue'
    try {
      const raw = safeGetStorageItem('gaga-message-queue');
      if (raw) {
        const msgs = JSON.parse(raw) as Array<{ timestamp?: number; syncStatus?: string }>;
        const fresh = msgs.filter(
          (m) => m.syncStatus !== 'failed' || (m.timestamp && m.timestamp > now - 7 * DAY)
        );
        if (fresh.length !== msgs.length) safeSetStorageItem('gaga-message-queue', JSON.stringify(fresh));
      }
    } catch { /* ignore */ }

    // Prune localStorage media fallback entries older than 7 days
    try {
      const raw = safeGetStorageItem('gaga_media_fallback');
      if (raw) {
        const store = JSON.parse(raw) as Record<string, { createdAt?: number }>;
        let changed = false;
        for (const [id, entry] of Object.entries(store)) {
          if (entry.createdAt && now - entry.createdAt > 7 * DAY) {
            delete store[id];
            changed = true;
          }
        }
        if (changed) safeSetStorageItem('gaga_media_fallback', JSON.stringify(store));
      }
    } catch { /* ignore */ }
  } catch { /* storage may be unavailable */ }
}
