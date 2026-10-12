package app.gagachat.feature.settings.presentation

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.updates.ApkInstaller
import app.gagachat.core.data.updates.AppUpdateDownloader
import app.gagachat.core.data.updates.AppUpdateRepository
import app.gagachat.core.data.updates.DownloadResult
import app.gagachat.core.data.updates.GaGaUpdate
import app.gagachat.core.data.updates.UpdateCheckResult
import app.gagachat.core.data.updates.UpdatePreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** High-level state machine for the in-app update screen. */
enum class UpdatePhase { CHECKING, AVAILABLE, DOWNLOADING, READY, INSTALLING, UP_TO_DATE, ERROR }

data class AppUpdateUiState(
    val phase: UpdatePhase = UpdatePhase.CHECKING,
    val installedVersionName: String = "",
    val installedVersionCode: Long = 0L,
    val available: GaGaUpdate? = null,
    val progress: Float? = null,
    val downloadedBytes: Long = 0L,
    val totalBytes: Long = 0L,
    val message: String? = null,
    val canInstall: Boolean = true,
    val needsInstallPermission: Boolean = false,
    val autoCheck: Boolean = true,
)

/**
 * Drives the in-app update screen: check → download → install, all without the
 * user leaving the app.
 *
 * The download and install are deliberately split so the UI can show real
 * progress and so the "install unknown apps" capability can be requested at the
 * exact moment it is needed. Every network byte comes from the trusted registry
 * (via [AppUpdateRepository] / [AppUpdateDownloader]); nothing here trusts a
 * version or URL that arrived in a push.
 */
@HiltViewModel
class AppUpdateViewModel @Inject constructor(
    private val updates: AppUpdateRepository,
    private val downloader: AppUpdateDownloader,
    private val installer: ApkInstaller,
    private val preferences: UpdatePreferences,
) : ViewModel() {

    private val _state = MutableStateFlow(AppUpdateUiState())
    val state: StateFlow<AppUpdateUiState> = _state.asStateFlow()

    init {
        val installed = updates.installedVersion()
        _state.update {
            it.copy(
                installedVersionName = installed.versionName,
                installedVersionCode = installed.versionCode,
                canInstall = installer.canInstall(),
            )
        }
        viewModelScope.launch {
            preferences.autoCheckEnabled.collect { enabled -> _state.update { it.copy(autoCheck = enabled) } }
        }
        refresh(force = true)
    }

    /** Re-checks the registry for a newer build. */
    fun refresh(force: Boolean = true) {
        viewModelScope.launch {
            _state.update { it.copy(phase = UpdatePhase.CHECKING, message = null, progress = null) }
            when (val result = updates.checkForUpdate(force)) {
                is UpdateCheckResult.Available -> _state.update {
                    it.copy(phase = UpdatePhase.AVAILABLE, available = result.update, totalBytes = result.update.sizeBytes)
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

    /**
     * Downloads the available APK and, on success, hands it to the installer.
     * When the "install unknown apps" capability is missing the download is not
     * started; the UI instead surfaces the permission step.
     */
    fun downloadAndInstall() {
        val update = _state.value.available ?: return
        if (!installer.canInstall()) {
            _state.update { it.copy(needsInstallPermission = true, canInstall = false) }
            return
        }
        viewModelScope.launch {
            _state.update {
                it.copy(
                    phase = UpdatePhase.DOWNLOADING,
                    progress = null,
                    downloadedBytes = 0L,
                    totalBytes = update.sizeBytes,
                    message = null,
                    needsInstallPermission = false,
                )
            }
            val result = downloader.download(update) { p ->
                _state.update {
                    it.copy(
                        downloadedBytes = p.downloadedBytes,
                        totalBytes = if (p.totalBytes > 0L) p.totalBytes else it.totalBytes,
                        progress = p.fraction,
                    )
                }
            }
            when (result) {
                is DownloadResult.Success -> {
                    _state.update { it.copy(phase = UpdatePhase.READY, progress = 1f) }
                    install(result.file)
                }
                is DownloadResult.Failed -> _state.update {
                    it.copy(phase = UpdatePhase.ERROR, message = result.reason, progress = null)
                }
            }
        }
    }

    private fun install(file: File) {
        if (installer.install(file)) {
            _state.update { it.copy(phase = UpdatePhase.INSTALLING, message = null) }
        } else {
            _state.update {
                it.copy(
                    phase = UpdatePhase.ERROR,
                    message = "Couldn't open the installer. Allow installs from GaGa in settings and try again.",
                )
            }
        }
    }

    /** Settings page that grants GaGa the "install unknown apps" capability. */
    fun installPermissionIntent(): Intent? = installer.installPermissionIntent()

    /** Called when the screen resumes, in case the user just granted the capability. */
    fun refreshInstallPermission() {
        val canInstall = installer.canInstall()
        _state.update { it.copy(canInstall = canInstall, needsInstallPermission = it.needsInstallPermission && !canInstall) }
    }

    fun setAutoCheck(enabled: Boolean) {
        viewModelScope.launch { preferences.setAutoCheckEnabled(enabled) }
    }

    /** Remembers that the user dismissed this release's offer. */
    fun dismiss() {
        val versionCode = _state.value.available?.versionCode ?: return
        viewModelScope.launch { preferences.dismiss(versionCode) }
    }
}
