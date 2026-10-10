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
import app.gagachat.core.model.AccountPrivacy
import app.gagachat.core.model.PrivacyAudience
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.core.network.session.SessionStore
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "gaga_settings",
)

/** Theme selection for the app (Master Spec §B — appearance). */
enum class NotificationPreview(val label: String) { FULL("Full content"), SENDER_ONLY("Sender only"), NONE("No content") }

enum class ThemeMode { SYSTEM, LIGHT, DARK }

/** Media auto-download policy (Master Spec §C — storage & data). */
enum class MediaDownloadPolicy { ALWAYS, WIFI, NEVER }

/** Text size preference (Master Spec §C — accessibility). */
enum class TextScale { SMALL, DEFAULT, LARGE }

/** App display language (Master Spec §C — language). */
enum class AppLanguage(val code: String, val label: String) {
    ENGLISH("en", "English"),
    BENGALI("bn", "বাংলা"),
    CHINESE("zh", "中文"),
}

/**
 * Chat wallpaper. [argb] is the light-mode tint; [darkArgb] the dark-mode tint.
 * [DEFAULT] keeps the theme background untouched.
 */
enum class ChatBackground(val label: String, val argb: Long?, val darkArgb: Long?) {
    DEFAULT("Default", null, null),
    SAND("Sand", 0xFFF3E9D2, 0xFF2A2620),
    MINT("Mint", 0xFFE4F3E6, 0xFF16241B),
    SKY("Sky", 0xFFE4EEF7, 0xFF14202B),
    ROSE("Rose", 0xFFF7E7ED, 0xFF261A20),
    GRAPHITE("Graphite", 0xFFEDEFF2, 0xFF0B141A),
}

/**
 * User-configurable settings persisted locally (Master Spec §C — full settings).
 * These are device preferences, not account data, so they live in a plain
 * DataStore and are read reactively by the settings screens.
 */
@Singleton
class SettingsPreferences @Inject constructor(
    @ApplicationContext private val context: Context,
    private val sessionStore: SessionStore,
    private val restApi: SupabaseRestApi,
) {
    private val privacyJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private fun privacyKey(id: String) = stringPreferencesKey("privacy_account_$id")
    private val privacyOwnerKey = stringPreferencesKey("privacy_active_account")
    val accountPrivacy: Flow<AccountPrivacy> = context.settingsDataStore.data.map { prefs ->
        val id = sessionStore.userId()
        if (id == null || prefs[privacyOwnerKey] != id) AccountPrivacy()
        else prefs[privacyKey(id)]?.let { raw ->
            runCatching { privacyJson.decodeFromString<AccountPrivacy>(raw) }.getOrNull()
        } ?: AccountPrivacy()
    }
    suspend fun refreshAccountPrivacy() {
        val id = sessionStore.userId()
        context.settingsDataStore.edit { it[privacyOwnerKey] = id.orEmpty() }
        if (id == null) return
        val result = restApi.getAccountPrivacy()
        if (sessionStore.userId() != id) return
        val policy = privacyJson.decodeFromJsonElement<AccountPrivacy>(result)
        context.settingsDataStore.edit { it[privacyKey(id)] = privacyJson.encodeToString(policy) }
    }
    suspend fun savePrivacy(patch: JsonObject) {
        val id = sessionStore.userId() ?: error("Sign in to change account privacy")
        val result = restApi.updateAccountPrivacy(patch)
        if (sessionStore.userId() != id) return
        val policy = privacyJson.decodeFromJsonElement<AccountPrivacy>(result)
        context.settingsDataStore.edit {
            it[privacyOwnerKey] = id
            it[privacyKey(id)] = privacyJson.encodeToString(policy)
        }
    }

    /**
     * Saves the three most visible privacy defaults plus read receipts in one
     * call. Kept here so JSON serialization stays an implementation detail of
     * core:data and the onboarding feature never needs a serialization
     * dependency (Master Spec §C — privacy preferences step).
     */
    suspend fun savePrivacyChoices(
        lastSeen: PrivacyAudience,
        profilePhoto: PrivacyAudience,
        messages: PrivacyAudience,
        readReceipts: Boolean,
    ) = savePrivacy(
        buildJsonObject {
            put("last_seen", lastSeen.name)
            put("profile_photo", profilePhoto.name)
            put("messages", messages.name)
            put("read_receipts", readReceipts)
        },
    )

    private val previewKey = stringPreferencesKey("notification_preview")
    val notificationPreview: Flow<NotificationPreview> = context.settingsDataStore.data.map { prefs ->
        NotificationPreview.entries.firstOrNull { it.name == prefs[previewKey] } ?: NotificationPreview.SENDER_ONLY
    }
    suspend fun setNotificationPreview(value: NotificationPreview) = context.settingsDataStore.edit { it[previewKey] = value.name }

    private val notificationsKey = booleanPreferencesKey("notifications_enabled")
    private val messageSoundsKey = booleanPreferencesKey("message_sounds")
    private val readReceiptsKey = booleanPreferencesKey("read_receipts")
    private val lastSeenKey = booleanPreferencesKey("share_last_seen")
    private val themeKey = stringPreferencesKey("theme_mode")
    private val mediaPolicyKey = stringPreferencesKey("media_policy")
    private val autoDownloadKey = booleanPreferencesKey("auto_download_media")
    private val appLockKey = booleanPreferencesKey("app_lock_enabled")
    private val textScaleKey = stringPreferencesKey("text_scale")
    private val languageKey = stringPreferencesKey("app_language")
    private val chatBackgroundKey = stringPreferencesKey("chat_background")
    private val callSoundsKey = booleanPreferencesKey("call_sounds")
    private val callVibrationKey = booleanPreferencesKey("call_vibration")
    private val liteModeKey = booleanPreferencesKey("lite_mode_enabled")

    val notificationsEnabled: Flow<Boolean> =
        context.settingsDataStore.data.map { it[notificationsKey] ?: true }
    val messageSoundsEnabled: Flow<Boolean> =
        context.settingsDataStore.data.map { it[messageSoundsKey] ?: true }
    /**
     * Whether an incoming/outgoing call plays its ringtone/ringback. Kept separate
     * from [messageSoundsEnabled] so a user can silence chat tones but still hear
     * calls (Master Spec \u00a7C \u2014 separate message vs call alerts).
     */
    val callSoundsEnabled: Flow<Boolean> =
        context.settingsDataStore.data.map { it[callSoundsKey] ?: true }
    /** Whether a call vibrates; follows the invitation lifecycle. */
    val callVibrationEnabled: Flow<Boolean> =
        context.settingsDataStore.data.map { it[callVibrationKey] ?: true }
    val readReceiptsEnabled: Flow<Boolean> =
        accountPrivacy.map { it.readReceipts }
    val shareLastSeenEnabled: Flow<Boolean> =
        accountPrivacy.map { it.lastSeen != PrivacyAudience.NOBODY }
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

    /**
     * Lite Mode (GaGa Signature Features \u2014 Language Bridge & Lite). When on the
     * app reduces real network use: media is never auto-downloaded, large
     * attachments are fetched on demand only, and background sync is throttled.
     */
    val liteModeEnabled: Flow<Boolean> =
        context.settingsDataStore.data.map { it[liteModeKey] ?: false }

    val appLockEnabled: Flow<Boolean> =
        context.settingsDataStore.data.map { it[appLockKey] ?: false }

    val textScale: Flow<TextScale> =
        context.settingsDataStore.data.map { prefs ->
            when (prefs[textScaleKey]) {
                TextScale.SMALL.name -> TextScale.SMALL
                TextScale.LARGE.name -> TextScale.LARGE
                else -> TextScale.DEFAULT
            }
        }

    val language: Flow<AppLanguage> =
        context.settingsDataStore.data.map { prefs ->
            when (prefs[languageKey]) {
                AppLanguage.BENGALI.code -> AppLanguage.BENGALI
                AppLanguage.CHINESE.code -> AppLanguage.CHINESE
                else -> AppLanguage.ENGLISH
            }
        }

    suspend fun setNotificationsEnabled(value: Boolean) =
        context.settingsDataStore.edit { it[notificationsKey] = value }

    suspend fun setMessageSoundsEnabled(value: Boolean) =
        context.settingsDataStore.edit { it[messageSoundsKey] = value }

    suspend fun setCallSoundsEnabled(value: Boolean) =
        context.settingsDataStore.edit { it[callSoundsKey] = value }

    suspend fun setCallVibrationEnabled(value: Boolean) =
        context.settingsDataStore.edit { it[callVibrationKey] = value }

    suspend fun setReadReceiptsEnabled(value: Boolean) =
        savePrivacy(buildJsonObject { put("read_receipts", value) })

    suspend fun setShareLastSeenEnabled(value: Boolean) =
        savePrivacy(buildJsonObject { put("last_seen", if (value) "FRIENDS" else "NOBODY") })

    suspend fun setThemeMode(value: ThemeMode) =
        context.settingsDataStore.edit { it[themeKey] = value.name }

    suspend fun setMediaPolicy(value: MediaDownloadPolicy) =
        context.settingsDataStore.edit { it[mediaPolicyKey] = value.name }

    suspend fun setAutoDownloadEnabled(value: Boolean) =
        context.settingsDataStore.edit { it[autoDownloadKey] = value }

    suspend fun setLiteModeEnabled(value: Boolean) =
        context.settingsDataStore.edit { it[liteModeKey] = value }

    suspend fun setAppLockEnabled(value: Boolean) =
        context.settingsDataStore.edit { it[appLockKey] = value }

    suspend fun setTextScale(value: TextScale) =
        context.settingsDataStore.edit { it[textScaleKey] = value.name }

    val chatBackground: Flow<ChatBackground> =
        context.settingsDataStore.data.map { prefs ->
            ChatBackground.entries.firstOrNull { it.name == prefs[chatBackgroundKey] }
                ?: ChatBackground.DEFAULT
        }

    suspend fun setChatBackground(value: ChatBackground) {
        context.settingsDataStore.edit { it[chatBackgroundKey] = value.name }
    }

    suspend fun setLanguage(value: AppLanguage) {
        context.settingsDataStore.edit { it[languageKey] = value.code }
        // Mirror synchronously so the locale can be applied in attachBaseContext.
        AppLocaleStore.persist(context, value.code)
    }
}
