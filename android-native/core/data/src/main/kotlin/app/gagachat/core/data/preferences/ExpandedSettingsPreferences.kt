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

private val Context.expandedSettingsStore: DataStore<Preferences> by preferencesDataStore(
    name = "gaga_settings_center",
)

/**
 * Settings Center V2.0 preference store (Master Spec §6 — recommended backend
 * structure, mirrored locally).
 *
 * The expansion adds ~30 categories with a large number of individual controls.
 * Rather than hand-writing a Flow + setter for every single one, this store keeps
 * a single typed map and exposes generic accessors. Keys are namespaced by
 * prefix so booleans and strings never collide:
 *
 *  - toggles  → `t_<key>`   (e.g. `t_ai.enabled`)
 *  - choices  → `c_<key>`   (e.g. `c_people.requestPolicy`)
 *
 * Values are device preferences. Account-scoped sync (when the backend tables
 * from §6 are wired up) layers on top of this local source of truth.
 */
@Singleton
class ExpandedSettingsPreferences @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    /** Every boolean preference, keyed by its un-prefixed name. */
    val toggles: Flow<Map<String, Boolean>> = context.expandedSettingsStore.data.map { prefs ->
        prefs.asMap().entries.mapNotNull { (key, value) ->
            if (key.name.startsWith(TOGGLE_PREFIX) && value is Boolean) {
                key.name.removePrefix(TOGGLE_PREFIX) to value
            } else {
                null
            }
        }.toMap()
    }

    /** Every string (choice) preference, keyed by its un-prefixed name. */
    val choices: Flow<Map<String, String>> = context.expandedSettingsStore.data.map { prefs ->
        prefs.asMap().entries.mapNotNull { (key, value) ->
            if (key.name.startsWith(CHOICE_PREFIX) && value is String) {
                key.name.removePrefix(CHOICE_PREFIX) to value
            } else {
                null
            }
        }.toMap()
    }

    suspend fun setToggle(key: String, value: Boolean) {
        context.expandedSettingsStore.edit { it[booleanPreferencesKey(TOGGLE_PREFIX + key)] = value }
    }

    suspend fun setChoice(key: String, value: String) {
        context.expandedSettingsStore.edit { it[stringPreferencesKey(CHOICE_PREFIX + key)] = value }
    }

    /** "Reset selected preferences" — clears the whole expansion store. */
    suspend fun resetAll() {
        context.expandedSettingsStore.edit { it.clear() }
    }

    companion object {
        const val TOGGLE_PREFIX = "t_"
        const val CHOICE_PREFIX = "c_"
    }
}
