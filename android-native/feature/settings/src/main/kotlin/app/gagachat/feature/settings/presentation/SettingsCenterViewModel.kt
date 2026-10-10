package app.gagachat.feature.settings.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.preferences.ExpandedSettingsPreferences
import app.gagachat.core.data.preferences.SettingsCenterPreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Snapshot of the Settings Center expansion preferences. Rows read values with
 * [toggle] / [choice] and fall back to the default declared at the call site, so
 * a control always has an explicit default even before the user touches it.
 */
data class SettingsCenterState(
    val toggles: Map<String, Boolean> = emptyMap(),
    val choices: Map<String, String> = emptyMap(),
) {
    fun toggle(key: String, default: Boolean = false): Boolean = toggles[key] ?: default
    fun choice(key: String, default: String): String = choices[key] ?: default
}

/**
 * Backs every Settings Center V2.0 sub-screen (categories 16–30). Persists each
 * control through [ExpandedSettingsPreferences] and exposes a single reactive
 * state so the UI reflects saved values immediately (spec §5 — immediate
 * feedback, persistent preferences).
 */
@HiltViewModel
class SettingsCenterViewModel @Inject constructor(
    private val prefs: ExpandedSettingsPreferences,
    private val facade: SettingsCenterPreferences,
) : ViewModel() {

    private val _state = MutableStateFlow(SettingsCenterState())
    val state: StateFlow<SettingsCenterState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            combine(prefs.toggles, prefs.choices) { toggles, choices ->
                SettingsCenterState(toggles = toggles, choices = choices)
            }.collect { _state.value = it }
        }
        // Mirror the authoritative server policy into the local store so the
        // discovery/typing/recommendation rows reflect what the backend is
        // actually enforcing (Master Spec §8 — Backend Enforcement).
        viewModelScope.launch { facade.seedDiscoveryFromServer() }
    }

    /**
     * Persists a toggle. Privacy/discovery controls are routed through the
     * [SettingsCenterPreferences] bridge so the change is written to the
     * server-enforced account policy as well as the local store; every other
     * control is device-only and stays in the expansion store.
     */
    fun setToggle(key: String, value: Boolean) {
        viewModelScope.launch {
            when (key) {
                SettingsCenterPreferences.KEY_SEARCHABLE_USERNAME -> facade.setSearchableUsername(value)
                SettingsCenterPreferences.KEY_SEARCHABLE_PHONE -> facade.setSearchablePhone(value)
                SettingsCenterPreferences.KEY_SEARCHABLE_EMAIL -> facade.setSearchableEmail(value)
                SettingsCenterPreferences.KEY_TYPING_INDICATOR -> facade.setTypingIndicator(value)
                SettingsCenterPreferences.KEY_PRIORITY_RECOMMENDATIONS -> facade.setPriorityRecommendations(value)
                SettingsCenterPreferences.KEY_ENTER_TO_SEND -> facade.setEnterToSend(value)
                SettingsCenterPreferences.KEY_LINK_PREVIEWS -> facade.setLinkPreviews(value)
                SettingsCenterPreferences.KEY_SAVE_TO_GALLERY -> facade.setSaveToGallery(value)
                SettingsCenterPreferences.KEY_WIFI_ONLY_UPLOADS -> facade.setWifiOnlyUploads(value)
                SettingsCenterPreferences.KEY_DATA_SAVER -> facade.setDataSaver(value)
                else -> prefs.setToggle(key, value)
            }
        }
    }

    fun setChoice(key: String, value: String) {
        viewModelScope.launch { prefs.setChoice(key, value) }
    }

    /** "Reset selected preferences" — returns every expansion control to default. */
    fun resetAll() {
        viewModelScope.launch { prefs.resetAll() }
    }

    /** Clears a single stored value (e.g. "Clear search history"). */
    fun clearValue(key: String) {
        viewModelScope.launch { prefs.setChoice(key, "") }
    }
}
