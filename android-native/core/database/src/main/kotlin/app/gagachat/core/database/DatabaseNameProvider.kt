package app.gagachat.core.database

/**
 * Resolves the on-disk name of the local cache database for the *current*
 * account (migration spec §2 — per-account local DB separation).
 *
 * The database module depends on this interface rather than on the session layer
 * directly, so `:core:database` stays free of any dependency on `:core:network`.
 * The account-aware implementation lives in `:core:data`, which can see both.
 *
 * The name is read once, when the singleton [GagaDatabase] is first opened (the
 * persisted session is available synchronously at that point), so it is stable
 * for the lifetime of the process.
 */
fun interface DatabaseNameProvider {
    /** The database file name to open, e.g. `gaga-<accountId>.db`. */
    fun databaseName(): String
}
