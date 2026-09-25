package app.gagachat.core.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "gaga_settings",
)

/** Theme selection for the app (Master Spec §B — appearance). */
enum class ThemeMode { SYSTEM, LIGHT, DARK }

/** Media auto-download policy (Master Spec §C — storage & data). */
enum class MediaDownloadPolicy { ALWAYS, WIFI, NEVER }

/**
 * User-configurable settings persisted locally (Master Spec §C — full settings).
 * These are device preferences, not account data, so they live in a plain
 * DataStore and are read reactively by the settings screens.
 */
@Singleton
class SettingsPreferences @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val notificationsKey = booleanPreferencesKey("notifications_enabled")
    private val messageSoundsKey = booleanPreferencesKey("message_sounds")
    private val readReceiptsKey = booleanPreferencesKey("read_receipts")
    private val lastSeenKey = booleanPreferencesKey("share_last_seen")
    private val themeKey = stringPreferencesKey("theme_mode")
    private val mediaPolicyKey = stringPreferencesKey("media_policy")
    private val autoDownloadKey = booleanPreferencesKey("auto_download_media")

    val notificationsEnabled: Flow<Boolean> =
        context.settingsDataStore.data.map { it[notificationsKey] ?: true }
    val messageSoundsEnabled: Flow<Boolean> =
        context.settingsDataStore.data.map { it[messageSoundsKey] ?: true }
    val readReceiptsEnabled: Flow<Boolean> =
        context.settingsDataStore.data.map { it[readReceiptsKey] ?: true }
    val shareLastSeenEnabled: Flow<Boolean> =
        context.settingsDataStore.data.map { it[lastSeenKey] ?: true }
    val themeMode: Flow<ThemeMode> =
        context.settingsDataStore.data.map { prefs ->
            when (prefs[themeKey]) {
                ThemeMode.LIGHT.name -> ThemeMode.LIGHT
                ThemeMode.DARK.name -> ThemeMode.DARK
                else -> ThemeMode.SYSTEM
            }
        }
    val mediaPolicy: Flow<MediaDownloadPolicy> =
        context.settingsDataStore.data.map { prefs ->
            when (prefs[mediaPolicyKey]) {
                MediaDownloadPolicy.ALWAYS.name -> MediaDownloadPolicy.ALWAYS
                MediaDownloadPolicy.NEVER.name -> MediaDownloadPolicy.NEVER
                else -> MediaDownloadPolicy.WIFI
            }
        }
    val autoDownloadEnabled: Flow<Boolean> =
        context.settingsDataStore.data.map { it[autoDownloadKey] ?: true }

    suspend fun setNotificationsEnabled(value: Boolean) =
        context.settingsDataStore.edit { it[notificationsKey] = value }

    suspend fun setMessageSoundsEnabled(value: Boolean) =
        context.settingsDataStore.edit { it[messageSoundsKey] = value }

    suspend fun setReadReceiptsEnabled(value: Boolean) =
        context.settingsDataStore.edit { it[readReceiptsKey] = value }

    suspend fun setShareLastSeenEnabled(value: Boolean) =
        context.settingsDataStore.edit { it[lastSeenKey] = value }

    suspend fun setThemeMode(value: ThemeMode) =
        context.settingsDataStore.edit { it[themeKey] = value.name }

    suspend fun setMediaPolicy(value: MediaDownloadPolicy) =
        context.settingsDataStore.edit { it[mediaPolicyKey] = value.name }

    suspend fun setAutoDownloadEnabled(value: Boolean) =
        context.settingsDataStore.edit { it[autoDownloadKey] = value }
}
