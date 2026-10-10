package app.gagachat.core.data.preferences

import app.gagachat.core.model.AccountPrivacy
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.JsonObject

/**
 * Account-wide privacy policy, authoritative on the server (Master Spec §7/§8).
 *
 * The backend (`gaga_get_privacy` / `gaga_save_privacy`) validates every field
 * and enforces the policy through RLS plus the `gaga_profiles` discovery
 * opt-ins (`discover_id`, `discover_phone`, `discover_email`), the typing /
 * read-receipt audiences and the call/message permission checks.
 *
 * Any Settings Center control that is privacy-relevant must therefore be written
 * *here* — not only to the device store — otherwise the choice is cosmetic and
 * never takes effect for other accounts. This interface is the seam the
 * [SettingsCenterPreferences] bridge depends on, so it can be tested without a
 * network or an Android `DataStore`.
 */
interface AccountPrivacyController {

    /** The cached policy for the signed-in account (defaults when none saved). */
    val accountPrivacy: Flow<AccountPrivacy>

    /** Re-reads the authoritative policy from the server into the local cache. */
    suspend fun refreshAccountPrivacy()

    /** Applies a validated partial update on the server and refreshes the cache. */
    suspend fun savePrivacy(patch: JsonObject)
}
