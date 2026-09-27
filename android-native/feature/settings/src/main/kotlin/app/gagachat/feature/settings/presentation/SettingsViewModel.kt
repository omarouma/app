package app.gagachat.feature.settings.presentation

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.preferences.AppLanguage
import app.gagachat.core.data.preferences.MediaDownloadPolicy
import app.gagachat.core.data.preferences.SettingsPreferences
import app.gagachat.core.data.preferences.TextScale
import app.gagachat.core.data.preferences.ThemeMode
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.User
import coil.imageLoader
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject

data class SettingsUiState(
    val displayName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val username: String? = null,
    val avatar: String? = null,
    val notificationsEnabled: Boolean = true,
    val messageSoundsEnabled: Boolean = true,
    val readReceiptsEnabled: Boolean = true,
    val shareLastSeenEnabled: Boolean = true,
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val mediaPolicy: MediaDownloadPolicy = MediaDownloadPolicy.WIFI,
    val autoDownloadEnabled: Boolean = true,
    val appLockEnabled: Boolean = false,
    val textScale: TextScale = TextScale.DEFAULT,
    val language: AppLanguage = AppLanguage.ENGLISH,
    val isSigningOut: Boolean = false,
    val signedOut: Boolean = false,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val authRepository: AuthRepository,
    private val userRepository: UserRepository,
    private val settingsPreferences: SettingsPreferences,
) : ViewModel() {

    private val _state = MutableStateFlow(
        SettingsUiState(
            displayName = authRepository.sessionFlow.value?.displayName,
            email = authRepository.sessionFlow.value?.email,
            phone = authRepository.sessionFlow.value?.phone,
        ),
    )
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    /** One-shot user notices (e.g. "Media cache cleared"). */
    private val _notices = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val notices: SharedFlow<String> = _notices.asSharedFlow()

    init {
        observePreferences()
        loadProfile()
    }

    private fun observePreferences() {
        viewModelScope.launch {
            settingsPreferences.notificationsEnabled.collect { v ->
                _state.update { it.copy(notificationsEnabled = v) }
            }
        }
        viewModelScope.launch {
            settingsPreferences.messageSoundsEnabled.collect { v ->
                _state.update { it.copy(messageSoundsEnabled = v) }
            }
        }
        viewModelScope.launch {
            settingsPreferences.readReceiptsEnabled.collect { v ->
                _state.update { it.copy(readReceiptsEnabled = v) }
            }
        }
        viewModelScope.launch {
            settingsPreferences.shareLastSeenEnabled.collect { v ->
                _state.update { it.copy(shareLastSeenEnabled = v) }
            }
        }
        viewModelScope.launch {
            settingsPreferences.themeMode.collect { v -> _state.update { it.copy(themeMode = v) } }
        }
        viewModelScope.launch {
            settingsPreferences.mediaPolicy.collect { v -> _state.update { it.copy(mediaPolicy = v) } }
        }
        viewModelScope.launch {
            settingsPreferences.autoDownloadEnabled.collect { v ->
                _state.update { it.copy(autoDownloadEnabled = v) }
            }
        }
        viewModelScope.launch {
            settingsPreferences.appLockEnabled.collect { v ->
                _state.update { it.copy(appLockEnabled = v) }
            }
        }
        viewModelScope.launch {
            settingsPreferences.textScale.collect { v -> _state.update { it.copy(textScale = v) } }
        }
        viewModelScope.launch {
            settingsPreferences.language.collect { v -> _state.update { it.copy(language = v) } }
        }
    }

    private fun loadProfile() {
        val me = authRepository.sessionFlow.value?.userId ?: return
        viewModelScope.launch {
            userRepository.observeUser(me).collect { user -> applyUser(user) }
        }
    }

    private fun applyUser(user: User?) {
        if (user == null) return
        _state.update {
            it.copy(
                displayName = user.displayName,
                username = user.username,
                avatar = user.avatar,
                email = user.email ?: it.email,
                phone = user.phone ?: it.phone,
            )
        }
    }

    fun setNotificationsEnabled(enabled: Boolean) =
        viewModelScope.launch { settingsPreferences.setNotificationsEnabled(enabled) }

    fun setMessageSoundsEnabled(enabled: Boolean) =
        viewModelScope.launch { settingsPreferences.setMessageSoundsEnabled(enabled) }

    fun setReadReceiptsEnabled(enabled: Boolean) =
        viewModelScope.launch { settingsPreferences.setReadReceiptsEnabled(enabled) }

    fun setShareLastSeenEnabled(enabled: Boolean) =
        viewModelScope.launch { settingsPreferences.setShareLastSeenEnabled(enabled) }

    fun setThemeMode(mode: ThemeMode) =
        viewModelScope.launch { settingsPreferences.setThemeMode(mode) }

    fun setMediaPolicy(policy: MediaDownloadPolicy) =
        viewModelScope.launch { settingsPreferences.setMediaPolicy(policy) }

    fun setAutoDownloadEnabled(enabled: Boolean) =
        viewModelScope.launch { settingsPreferences.setAutoDownloadEnabled(enabled) }

    fun setAppLockEnabled(enabled: Boolean) =
        viewModelScope.launch { settingsPreferences.setAppLockEnabled(enabled) }

    fun setTextScale(scale: TextScale) =
        viewModelScope.launch { settingsPreferences.setTextScale(scale) }

    fun setLanguage(language: AppLanguage) =
        viewModelScope.launch { settingsPreferences.setLanguage(language) }

    /** Clears locally cached media (Coil disk cache + cached media directories). */
    fun clearMediaCache() {
        viewModelScope.launch {
            val freedBytes = withContext(Dispatchers.IO) {
                var freed = 0L
                runCatching {
                    context.imageLoader.diskCache?.clear()
                }
                val dirs = listOf("image_cache", "video_cache", "media", "coil_cache", "http_cache")
                dirs.forEach { name ->
                    val dir = File(context.cacheDir, name)
                    if (dir.exists()) {
                        freed += dir.directorySize()
                        runCatching { dir.deleteRecursively() }
                    }
                }
                freed
            }
            val mb = freedBytes / (1024.0 * 1024.0)
            val label = if (mb >= 0.1) String.format("%.1f MB freed", mb) else "Cache cleared"
            _notices.tryEmit("Media cache cleared — $label")
        }
    }

    fun signOut() {
        _state.update { it.copy(isSigningOut = true) }
        viewModelScope.launch {
            authRepository.signOut()
            _state.update { it.copy(isSigningOut = false, signedOut = true) }
        }
    }
}

private fun File.directorySize(): Long =
    walkBottomUp().filter { it.isFile }.sumOf { it.length() }
