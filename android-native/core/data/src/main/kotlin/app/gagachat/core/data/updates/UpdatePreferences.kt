package app.gagachat.core.data.updates

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.updateDataStore: DataStore<Preferences> by preferencesDataStore(name = "gaga_updates")

/**
 * Device-local state for the update system: whether the periodic background
 * check runs, the last version the user was notified about (so a notification is
 * posted at most once per release), and the version the user dismissed (so a
 * banner they swiped away stays gone).
 *
 * These are device preferences, not account data, so they live in a plain
 * DataStore and never sync across devices.
 */
@Singleton
class UpdatePreferences @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    val autoCheckEnabled: Flow<Boolean> =
        context.updateDataStore.data.map { it[AUTO_CHECK] ?: true }

    val lastNotifiedVersionCode: Flow<Long> =
        context.updateDataStore.data.map { it[LAST_NOTIFIED] ?: 0L }

    val dismissedVersionCode: Flow<Long> =
        context.updateDataStore.data.map { it[DISMISSED] ?: 0L }

    suspend fun setAutoCheckEnabled(enabled: Boolean) {
        context.updateDataStore.edit { it[AUTO_CHECK] = enabled }
    }

    /** Records that the user has been notified about [versionCode]. */
    suspend fun markNotified(versionCode: Long) {
        context.updateDataStore.edit { it[LAST_NOTIFIED] = versionCode }
    }

    /** Remembers that the user dismissed the offer for [versionCode]. */
    suspend fun dismiss(versionCode: Long) {
        context.updateDataStore.edit { it[DISMISSED] = versionCode }
    }

    /** Clears the dismissal (e.g. when a newer release supersedes it). */
    suspend fun clearDismissal() {
        context.updateDataStore.edit { it[DISMISSED] = 0L }
    }

    suspend fun currentLastNotified(): Long = lastNotifiedVersionCode.first()

    suspend fun currentDismissed(): Long = dismissedVersionCode.first()

    /**
     * True when a notification should be posted for [versionCode]: the user has
     * not already been told about this release, and has not dismissed it.
     */
    suspend fun shouldNotify(versionCode: Long): Boolean {
        if (versionCode <= 0L) return false
        val notified = currentLastNotified()
        val dismissed = currentDismissed()
        return versionCode > notified && versionCode != dismissed
    }

    private companion object {
        val AUTO_CHECK = booleanPreferencesKey("auto_check")
        val LAST_NOTIFIED = longPreferencesKey("last_notified_version_code")
        val DISMISSED = longPreferencesKey("dismissed_version_code")
    }
}
