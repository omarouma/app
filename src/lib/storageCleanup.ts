/**
 * Cleans up stale localStorage/sessionStorage entries to prevent bloat.
 * Called once on app startup (non-blocking).
 */
export function runStorageCleanup(): void {
  try {
    const now = Date.now();
    const DAY = 86_400_000;

    // Remove chat drafts older than 7 days
    const draftKeys = Object.keys(localStorage).filter((k) => k.startsWith('chat_draft_'));
    for (const key of draftKeys) {
      try {
        const val = localStorage.getItem(key);
        if (!val) { localStorage.removeItem(key); continue; }
        // Drafts are plain strings — remove if key is stale (no timestamp available, cap at 50 drafts)
        if (draftKeys.length > 50) localStorage.removeItem(key);
      } catch { /* ignore */ }
    }

    // Remove expired reel drafts
    try {
      const reelDraft = localStorage.getItem('gaga_reel_draft');
      if (reelDraft) {
        const parsed = JSON.parse(reelDraft) as { savedAt?: number };
        if (parsed.savedAt && now - parsed.savedAt > DAY) localStorage.removeItem('gaga_reel_draft');
      }
    } catch { /* ignore */ }

    // Remove stale SW version key if very old (> 30 days)
    try {
      const swVer = localStorage.getItem('gaga_sw_last_version');
      if (!swVer) localStorage.removeItem('gaga_sw_last_version');
    } catch { /* ignore */ }

    // Remove scheduled messages older than 7 days
    const schedKeys = Object.keys(localStorage).filter((k) => k.startsWith('scheduled_msgs_'));
    for (const key of schedKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) { localStorage.removeItem(key); continue; }
        const msgs = JSON.parse(raw) as Array<{ scheduledAt?: number }>;
        const fresh = msgs.filter((m) => m.scheduledAt && m.scheduledAt > now - 7 * DAY);
        if (fresh.length === 0) localStorage.removeItem(key);
        else if (fresh.length !== msgs.length) localStorage.setItem(key, JSON.stringify(fresh));
      } catch { localStorage.removeItem(key); }
    }
  } catch { /* ignore — storage may be unavailable */ }
}
