package app.gagachat.feature.settings.presentation

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.preferences.AppLanguage
import app.gagachat.core.data.preferences.ChatBackground
import app.gagachat.core.data.preferences.MediaDownloadPolicy
import app.gagachat.core.data.preferences.SettingsPreferences
import app.gagachat.core.data.preferences.TextScale
import app.gagachat.core.data.preferences.ThemeMode
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.User
import app.gagachat.core.model.AccountPrivacy
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.coroutines.CancellationException
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
    val preview: app.gagachat.core.data.preferences.NotificationPreview = app.gagachat.core.data.preferences.NotificationPreview.SENDER_ONLY,
    val requests: List<app.gagachat.core.model.MessageRequest> = emptyList(),
    val requestError: String? = null,
    val securityBusy: Boolean = false,
    val securityNotice: String? = null,
    val sessions: List<app.gagachat.core.model.AccountSession> = emptyList(),
    val privacy: AccountPrivacy = AccountPrivacy(),
    val privacyLoading: Boolean = true,
    val privacySaving: Boolean = false,
    val privacyError: String? = null,
    val displayName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val username: String? = null,
    val avatar: String? = null,
    val notificationsEnabled: Boolean = true,
    val messageSoundsEnabled: Boolean = true,
    val callSoundsEnabled: Boolean = true,
    val callVibrationEnabled: Boolean = true,
    val readReceiptsEnabled: Boolean = true,
    val shareLastSeenEnabled: Boolean = true,
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val chatBackground: ChatBackground = ChatBackground.DEFAULT,
    val mediaPolicy: MediaDownloadPolicy = MediaDownloadPolicy.WIFI,
    val autoDownloadEnabled: Boolean = true,
    val appLockEnabled: Boolean = false,
    val textScale: TextScale = TextScale.DEFAULT,
    val language: AppLanguage = AppLanguage.ENGLISH,
    /** Human-readable size of the on-device media cache (spec area 16). */
    val cacheSizeLabel: String? = null,
    val isSigningOut: Boolean = false,
    val signedOut: Boolean = false,
    val isDeletingAccount: Boolean = false,
    val accountDeleted: Boolean = false,
)

@HiltViewModel
@OptIn(coil.annotation.ExperimentalCoilApi::class)
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val authRepository: AuthRepository,
    private val userRepository: UserRepository,
    private val settingsPreferences: SettingsPreferences,
    private val api: app.gagachat.core.network.rest.SupabaseRestApi,
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
        refreshPrivacy()
        loadProfile()
        refreshCacheSize()
    }

    /**
     * Spec area 16: computes the current media-cache footprint so the storage
     * screen can show a real "cache budget" figure next to Clear cache. Runs on
     * the IO dispatcher (never the main thread) and tolerates missing dirs.
     */
    fun refreshCacheSize() {
        viewModelScope.launch {
            val bytes = withContext(Dispatchers.IO) {
                var total = 0L
                runCatching { total += context.imageLoader.diskCache?.size ?: 0L }
                CACHE_DIRS.forEach { name ->
                    val dir = File(context.cacheDir, name)
                    if (dir.exists()) total += dir.directorySize()
                }
                total
            }
            _state.update { it.copy(cacheSizeLabel = formatBytes(bytes)) }
        }
    }

    private fun observePreferences() {
        viewModelScope.launch { settingsPreferences.notificationPreview.collect { value -> _state.update { it.copy(preview = value) } } }
        viewModelScope.launch { settingsPreferences.accountPrivacy.collect { value -> _state.update { it.copy(privacy = value) } } }
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
            settingsPreferences.callSoundsEnabled.collect { v ->
                _state.update { it.copy(callSoundsEnabled = v) }
            }
        }
        viewModelScope.launch {
            settingsPreferences.callVibrationEnabled.collect { v ->
                _state.update { it.copy(callVibrationEnabled = v) }
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
            settingsPreferences.chatBackground.collect { v ->
                _state.update { it.copy(chatBackground = v) }
            }
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

    fun setPreview(value: app.gagachat.core.data.preferences.NotificationPreview) = viewModelScope.launch { settingsPreferences.setNotificationPreview(value) }
    fun loadRequests() = viewModelScope.launch {
        try { _state.update { it.copy(requests = api.getMessageRequests(), requestError = null) } }
        catch (e: Exception) { if (e is CancellationException) throw e; _state.update { it.copy(requestError = "Could not load message requests. Retry when connected.") } }
    }
    fun respondToRequest(id: String, action: String) = viewModelScope.launch {
        try { api.respondMessageRequest(id, action); loadRequests() }
        catch (e: Exception) { if (e is CancellationException) throw e; _state.update { it.copy(requestError = "Could not update request. Retry when connected.") } }
    }

    fun refreshPrivacy() = viewModelScope.launch {
        _state.update { it.copy(privacyLoading = true, privacyError = null) }
        try { settingsPreferences.refreshAccountPrivacy() }
        catch (c: CancellationException) { throw c }
        catch (e: Exception) { _state.update { it.copy(privacyError = "Could not load account privacy. Retry when connected.") } }
        finally { _state.update { it.copy(privacyLoading = false) } }
    }
    fun savePrivacyAudience(key: String, value: String) = savePrivacy(key, value, null)
    fun savePrivacyBoolean(key: String, value: Boolean) = savePrivacy(key, null, value)
    private fun savePrivacy(key: String, value: String?, flag: Boolean?) {
        if (_state.value.privacyLoading || _state.value.privacySaving) return
        viewModelScope.launch {
            _state.update { it.copy(privacySaving = true, privacyError = null) }
            try { settingsPreferences.savePrivacy(buildJsonObject { if (value != null) put(key, value) else put(key, flag!!) }) }
            catch (c: CancellationException) { throw c }
            catch (e: Exception) { _state.update { it.copy(privacyError = "Privacy was not saved. Check your connection and retry.") } }
            finally { _state.update { it.copy(privacySaving = false) } }
        }
    }

    fun setNotificationsEnabled(enabled: Boolean) =
        viewModelScope.launch { settingsPreferences.setNotificationsEnabled(enabled) }

    fun setMessageSoundsEnabled(enabled: Boolean) =
        viewModelScope.launch { settingsPreferences.setMessageSoundsEnabled(enabled) }

    fun setCallSoundsEnabled(enabled: Boolean) =
        viewModelScope.launch { settingsPreferences.setCallSoundsEnabled(enabled) }

    fun setCallVibrationEnabled(enabled: Boolean) =
        viewModelScope.launch { settingsPreferences.setCallVibrationEnabled(enabled) }

    fun setReadReceiptsEnabled(enabled: Boolean) =
        savePrivacyBoolean("read_receipts", enabled)

    fun setShareLastSeenEnabled(enabled: Boolean) =
        savePrivacyAudience("last_seen", if (enabled) "FRIENDS" else "NOBODY")

    fun setThemeMode(mode: ThemeMode) =
        viewModelScope.launch { settingsPreferences.setThemeMode(mode) }

    fun setChatBackground(background: ChatBackground) =
        viewModelScope.launch { settingsPreferences.setChatBackground(background) }

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
                CACHE_DIRS.forEach { name ->
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
            refreshCacheSize()
        }
    }

    fun changePassword(current: String, password: String, confirmation: String) = viewModelScope.launch {
        if (_state.value.securityBusy) return@launch
        if (password.length < 8 || password != confirmation) { _state.update { it.copy(securityNotice = "Enter matching passwords of at least 8 characters.") }; return@launch }
        _state.update { it.copy(securityBusy = true, securityNotice = null) }
        val result = authRepository.changePassword(current, password)
        _state.update { it.copy(securityBusy = false, securityNotice = if (result is AppResult.Failure) result.error.message ?: "Password change failed" else "Password updated") }
    }
    fun loadSessions() = viewModelScope.launch {
        try { _state.update { it.copy(sessions = api.getAccountSessions(), securityNotice = null) } }
        catch (e: Exception) { if (e is CancellationException) throw e; _state.update { it.copy(securityNotice = "Could not load sessions. Retry when connected.") } }
    }
    fun revokeSession(id: String?, password: String) = viewModelScope.launch {
        if (_state.value.securityBusy) return@launch
        _state.update { it.copy(securityBusy = true, securityNotice = null) }
        try {
            when (val verified = authRepository.reauthenticate(password)) {
                is AppResult.Failure -> _state.update { it.copy(securityNotice = verified.error.message ?: "Authentication failed") }
                else -> { api.revokeAccountSession(id); loadSessions() }
            }
        } catch (e: Exception) { if (e is CancellationException) throw e; _state.update { it.copy(securityNotice = "Could not revoke session. Retry when connected.") } }
        finally { _state.update { it.copy(securityBusy = false) } }
    }

    fun signOut() {
        _state.update { it.copy(isSigningOut = true) }
        viewModelScope.launch {
            authRepository.signOut()
            _state.update { it.copy(isSigningOut = false, signedOut = true) }
        }
    }

    /**
     * Permanently deletes the account (Play Store requirement). On success the
     * session is cleared by the repository and [SettingsUiState.accountDeleted]
     * flips so the UI can return to the auth graph.
     */
    fun deleteAccount(password: String) {
        _state.update { it.copy(isDeletingAccount = true) }
        viewModelScope.launch {
            val verified = authRepository.reauthenticate(password)
            if (verified is AppResult.Failure) { _state.update { it.copy(isDeletingAccount = false) }; _notices.tryEmit(verified.error.message ?: "Authentication failed"); return@launch }
            when (val result = authRepository.deleteAccount()) {
                is AppResult.Success -> _state.update {
                    it.copy(isDeletingAccount = false, accountDeleted = true)
                }
                is AppResult.Failure -> {
                    _state.update { it.copy(isDeletingAccount = false) }
                    _notices.tryEmit(
                        result.error.message ?: "Could not delete account. Please try again.",
                    )
                }
                AppResult.Loading -> Unit
            }
        }
    }

    private companion object {
        /**
         * Local cache directories counted toward the spec-area-16 "cache budget".
         * Kept in one place so Clear cache and the size read-out stay in sync.
         */
        val CACHE_DIRS = listOf("image_cache", "video_cache", "media", "coil_cache", "http_cache")
    }
}

/** Formats a byte count as a compact human-readable string (e.g. "12.4 MB"). */
private fun formatBytes(bytes: Long): String {
    if (bytes <= 0L) return "0 B"
    val units = listOf("B", "KB", "MB", "GB")
    var value = bytes.toDouble()
    var unit = 0
    while (value >= 1024.0 && unit < units.lastIndex) {
        value /= 1024.0
        unit++
    }
    return if (unit == 0) "${bytes} B" else String.format("%.1f %s", value, units[unit])
}

private fun File.directorySize(): Long =
    walkBottomUp().filter { it.isFile }.sumOf { it.length() }
