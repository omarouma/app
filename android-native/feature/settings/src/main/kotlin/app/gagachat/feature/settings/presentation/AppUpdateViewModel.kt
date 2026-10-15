package app.gagachat.feature.settings.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.updates.AppUpdateRepository
import app.gagachat.core.data.updates.GaGaUpdate
import app.gagachat.core.data.updates.UpdateCheckResult
import app.gagachat.core.data.updates.UpdatePreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Play-compliant update checking. The system browser or Play Store owns installation. */
enum class UpdatePhase { CHECKING, AVAILABLE, UP_TO_DATE, ERROR }

data class AppUpdateUiState(
    val phase: UpdatePhase = UpdatePhase.CHECKING,
    val installedVersionName: String = "",
    val installedVersionCode: Long = 0L,
    val available: GaGaUpdate? = null,
    val message: String? = null,
    val autoCheck: Boolean = true,
)

@HiltViewModel
class AppUpdateViewModel @Inject constructor(
    private val updates: AppUpdateRepository,
    private val preferences: UpdatePreferences,
) : ViewModel() {
    private val _state = MutableStateFlow(AppUpdateUiState())
    val state: StateFlow<AppUpdateUiState> = _state.asStateFlow()

    init {
        val installed = updates.installedVersion()
        _state.update {
            it.copy(installedVersionName = installed.versionName, installedVersionCode = installed.versionCode)
        }
        viewModelScope.launch {
            preferences.autoCheckEnabled.collect { enabled ->
                _state.update { it.copy(autoCheck = enabled) }
            }
        }
        refresh(force = true)
    }

    /** An update is shown only when the signed-release registry offers this channel. */
    fun refresh(force: Boolean = true) {
        viewModelScope.launch {
            _state.update { it.copy(phase = UpdatePhase.CHECKING, message = null) }
            when (val result = updates.checkForUpdate(force)) {
                is UpdateCheckResult.Available -> _state.update {
                    it.copy(phase = UpdatePhase.AVAILABLE, available = result.update)
                }
                is UpdateCheckResult.UpToDate -> _state.update {
                    it.copy(phase = UpdatePhase.UP_TO_DATE, available = null)
                }
                is UpdateCheckResult.Failed -> _state.update {
                    it.copy(phase = UpdatePhase.ERROR, message = result.reason)
                }
            }
        }
    }

    fun setAutoCheck(enabled: Boolean) {
        viewModelScope.launch { preferences.setAutoCheckEnabled(enabled) }
    }

    fun dismiss() {
        val code = _state.value.available?.versionCode ?: return
        viewModelScope.launch { preferences.dismiss(code) }
    }
}
