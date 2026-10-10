package app.gagachat.core.data.preferences

import kotlinx.coroutines.flow.Flow

/**
 * Generic key/value store backing the Settings Center expansion (Master Spec
 * §6/§8).
 *
 * The Settings Center renders ~30 categories with a large number of individual
 * controls. Rather than hand-writing a `Flow` + setter for every single one, the
 * store keeps two typed maps — booleans and strings — addressed by a namespaced
 * key (`t_<key>` / `c_<key>`).
 *
 * This interface is the seam the *functional consumers* depend on, so a consumer
 * (chat, media, calls, search) can be unit-tested against an in-memory fake
 * without an Android `DataStore`.
 */
interface SettingsToggleStore {

    /** Every boolean preference, keyed by its un-prefixed name. */
    val toggles: Flow<Map<String, Boolean>>

    /** Every string (choice) preference, keyed by its un-prefixed name. */
    val choices: Flow<Map<String, String>>

    suspend fun setToggle(key: String, value: Boolean)

    suspend fun setChoice(key: String, value: String)

    /** "Reset selected preferences" — clears the whole expansion store. */
    suspend fun resetAll()
}
