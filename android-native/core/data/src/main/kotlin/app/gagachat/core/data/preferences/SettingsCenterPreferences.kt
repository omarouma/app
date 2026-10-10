package app.gagachat.core.data.preferences

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Typed, functional view over the Settings Center store (Master Spec §8 —
 * `Preference → Storage → Functional Consumer → Backend Enforcement → Test`).
 *
 * The Settings Center previously persisted every control to the device store but
 * **nothing read the values**, so toggles were cosmetic. This facade gives each
 * control a typed accessor that a real consumer uses, and — for the
 * privacy/discovery controls — bridges the value to the *server-enforced*
 * account policy so the choice actually takes effect for other accounts:
 *
 *  - `people.searchable.username` → `discover_id`
 *  - `people.searchable.phone`    → `discover_phone`
 *  - `people.searchable.email`    → `discover_email`
 *  - `chats.typingIndicator`      → `typing_indicator`
 *  - `ai.priorityRecommendations` → `recommendations`
 *
 * The backend validates these through `gaga_save_privacy` and enforces them via
 * RLS + the `gaga_profiles` discovery projection, so writing only to the local
 * store would be a no-op for privacy. The local store is still written first so
 * the UI reflects the change immediately, and [seedDiscoveryFromServer] mirrors
 * the authoritative server values back into the local store on sign-in.
 */
@Singleton
class SettingsCenterPreferences @Inject constructor(
    private val store: SettingsToggleStore,
    private val privacy: AccountPrivacyController,
) {

    // ---------------------------------------------------------------------
    // Discovery / privacy — backend-enforced (Master Spec §7/§8)
    // ---------------------------------------------------------------------

    /** `people.searchable.username` — server field `discover_id` (default on). */
    val searchableUsername: Flow<Boolean> = store.toggles.map { it[KEY_SEARCHABLE_USERNAME] ?: true }

    /** `people.searchable.phone` — server field `discover_phone` (default off). */
    val searchablePhone: Flow<Boolean> = store.toggles.map { it[KEY_SEARCHABLE_PHONE] ?: false }

    /** `people.searchable.email` — server field `discover_email` (default off). */
    val searchableEmail: Flow<Boolean> = store.toggles.map { it[KEY_SEARCHABLE_EMAIL] ?: false }

    /** `chats.typingIndicator` — server field `typing_indicator` (default on). */
    val typingIndicator: Flow<Boolean> = store.toggles.map { it[KEY_TYPING_INDICATOR] ?: true }

    /** `ai.priorityRecommendations` — server field `recommendations` (default off). */
    val priorityRecommendations: Flow<Boolean> = store.toggles.map { it[KEY_PRIORITY_RECOMMENDATIONS] ?: false }

    suspend fun setSearchableUsername(value: Boolean) =
        setPrivacyToggle(KEY_SEARCHABLE_USERNAME, value, "discover_id")

    suspend fun setSearchablePhone(value: Boolean) =
        setPrivacyToggle(KEY_SEARCHABLE_PHONE, value, "discover_phone")

    suspend fun setSearchableEmail(value: Boolean) =
        setPrivacyToggle(KEY_SEARCHABLE_EMAIL, value, "discover_email")

    suspend fun setTypingIndicator(value: Boolean) =
        setPrivacyToggle(KEY_TYPING_INDICATOR, value, "typing_indicator")

    suspend fun setPriorityRecommendations(value: Boolean) =
        setPrivacyToggle(KEY_PRIORITY_RECOMMENDATIONS, value, "recommendations")

    /**
     * Writes the toggle locally (instant feedback) and pushes the matching
     * server field so the backend enforces it for other accounts. A failed
     * server write is non-fatal: the local value stays, and the next
     * [seedDiscoveryFromServer] reconciles with the authoritative policy.
     */
    private suspend fun setPrivacyToggle(key: String, value: Boolean, field: String) {
        store.setToggle(key, value)
        runCatching { privacy.savePrivacy(buildJsonObject { put(field, value) }) }
    }

    /**
     * Pulls the authoritative policy from the server and mirrors the discovery /
     * typing / recommendation flags into the local store, so a fresh device (or a
     * second device) shows the same values the backend is actually enforcing.
     */
    suspend fun seedDiscoveryFromServer() {
        runCatching { privacy.refreshAccountPrivacy() }
        val policy = runCatching { privacy.accountPrivacy.first() }.getOrNull() ?: return
        store.setToggle(KEY_SEARCHABLE_USERNAME, policy.discoverId)
        store.setToggle(KEY_SEARCHABLE_PHONE, policy.discoverPhone)
        store.setToggle(KEY_SEARCHABLE_EMAIL, policy.discoverEmail)
        store.setToggle(KEY_TYPING_INDICATOR, policy.typingIndicator)
        store.setToggle(KEY_PRIORITY_RECOMMENDATIONS, policy.recommendations)
    }

    // ---------------------------------------------------------------------
    // Chat — local consumers
    // ---------------------------------------------------------------------

    /** `chats.enterToSend` — Enter sends the message instead of inserting a newline. */
    val enterToSend: Flow<Boolean> = store.toggles.map { it[KEY_ENTER_TO_SEND] ?: true }

    /** `chats.linkPreviews` — resolve rich link previews for URLs in messages. */
    val linkPreviews: Flow<Boolean> = store.toggles.map { it[KEY_LINK_PREVIEWS] ?: true }

    /** `chats.saveToGallery` — keep received media in the device gallery. */
    val saveToGallery: Flow<Boolean> = store.toggles.map { it[KEY_SAVE_TO_GALLERY] ?: false }

    suspend fun setEnterToSend(value: Boolean) = store.setToggle(KEY_ENTER_TO_SEND, value)
    suspend fun setLinkPreviews(value: Boolean) = store.setToggle(KEY_LINK_PREVIEWS, value)
    suspend fun setSaveToGallery(value: Boolean) = store.setToggle(KEY_SAVE_TO_GALLERY, value)

    // ---------------------------------------------------------------------
    // Network — local consumers
    // ---------------------------------------------------------------------

    /** `network.wifiOnlyUploads` — never upload media on a metered connection. */
    val wifiOnlyUploads: Flow<Boolean> = store.toggles.map { it[KEY_WIFI_ONLY_UPLOADS] ?: true }

    /** `network.dataSaver` — treat metered connections as upload-forbidden. */
    val dataSaver: Flow<Boolean> = store.toggles.map { it[KEY_DATA_SAVER] ?: false }

    suspend fun setWifiOnlyUploads(value: Boolean) = store.setToggle(KEY_WIFI_ONLY_UPLOADS, value)
    suspend fun setDataSaver(value: Boolean) = store.setToggle(KEY_DATA_SAVER, value)

    /**
     * True when a (potentially large) media upload must not use the current
     * connection: the user asked for Wi-Fi-only uploads or data saver and the
     * active network is metered. The upload stays durably queued and is retried
     * by the WorkManager job (which requires `NetworkType.CONNECTED`) once the
     * device is back on an unmetered network.
     */
    suspend fun shouldDeferMediaUpload(isMetered: Boolean): Boolean =
        isMetered && (wifiOnlyUploads.first() || dataSaver.first())

    companion object {
        const val KEY_SEARCHABLE_USERNAME = "people.searchable.username"
        const val KEY_SEARCHABLE_PHONE = "people.searchable.phone"
        const val KEY_SEARCHABLE_EMAIL = "people.searchable.email"
        const val KEY_TYPING_INDICATOR = "chats.typingIndicator"
        const val KEY_PRIORITY_RECOMMENDATIONS = "ai.priorityRecommendations"
        const val KEY_ENTER_TO_SEND = "chats.enterToSend"
        const val KEY_LINK_PREVIEWS = "chats.linkPreviews"
        const val KEY_SAVE_TO_GALLERY = "chats.saveToGallery"
        const val KEY_WIFI_ONLY_UPLOADS = "network.wifiOnlyUploads"
        const val KEY_DATA_SAVER = "network.dataSaver"
    }
}
