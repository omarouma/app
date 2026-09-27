package app.gagachat.core.data.sync

/**
 * Central sync/conflict policy (PDF §2 — "Sync + Conflict Policy").
 *
 * Rules encoded here:
 *  - The backend is authoritative; local rows are a cache.
 *  - Server timestamps win for ordering; client timestamps are optimistic only.
 *  - Delta sync uses cursors; full fetches are only for first-ever empty state.
 *  - Pending (unsent) local rows are never overwritten by remote data.
 */
object SyncPolicy {

    /** Minimum interval between background refreshes of a stream. */
    const val CONVERSATION_REFRESH_INTERVAL_MS = 15_000L
    const val CONTACT_REFRESH_INTERVAL_MS = 60_000L
    const val PROFILE_REFRESH_INTERVAL_MS = 300_000L

    /**
     * Whether a remote message should overwrite a local row.
     * Pending/failed local rows are preserved so optimistic state is not lost.
     */
    fun shouldApplyRemote(localStatus: String?): Boolean =
        localStatus != "PENDING" && localStatus != "FAILED"

    /**
     * Merge rule for message status: never downgrade a status (READ > DELIVERED >
     * SENT > PENDING).
     */
    fun mergeStatus(local: String, remote: String): String {
        val order = listOf("PENDING", "SENT", "DELIVERED", "READ")
        val localIdx = order.indexOf(local).coerceAtLeast(0)
        val remoteIdx = order.indexOf(remote).coerceAtLeast(0)
        return order[maxOf(localIdx, remoteIdx)]
    }

    /** True when a full (non-delta) fetch is justified. */
    fun needsFullFetch(localRowCount: Int): Boolean = localRowCount == 0
}
