package app.gagachat.feature.onboarding

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.data.preferences.OnboardingPreferences
import app.gagachat.core.network.dto.UserRow
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.core.network.session.SessionStore
import app.gagachat.core.network.storage.SupabaseStorageApi
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * Backing state for the post-authentication onboarding flow (Master Spec §C).
 *
 * The flow has three steps — welcome, profile setup, permissions — driven by the
 * navigation graph. This ViewModel is hoisted above the graph so all three steps
 * share one instance and one state object.
 */
data class OnboardingUiState(
    val displayName: String = "",
    val username: String = "",
    val bio: String = "",
    val avatarUrl: String = "",
    val isSaving: Boolean = false,
    val isUploadingAvatar: Boolean = false,
    val isCheckingUsername: Boolean = false,
    /** null = unknown/not yet checked, true = free, false = taken. */
    val usernameAvailable: Boolean? = null,
    val error: String? = null,
)

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val restApi: SupabaseRestApi,
    private val storageApi: SupabaseStorageApi,
    private val sessionStore: SessionStore,
    private val onboardingPreferences: OnboardingPreferences,
    private val dispatchers: DispatcherProvider,
) : ViewModel() {

    private val _state = MutableStateFlow(OnboardingUiState())
    val state: StateFlow<OnboardingUiState> = _state.asStateFlow()

    /** In-flight debounced availability check; cancelled on each new keystroke. */
    private var usernameCheckJob: Job? = null

    init {
        // Prefill from the session so the user does not retype their name.
        val session = sessionStore.load()
        _state.update {
            it.copy(displayName = session?.displayName.orEmpty())
        }
    }

    fun onDisplayNameChange(value: String) = _state.update { it.copy(displayName = value, error = null) }

    fun onUsernameChange(value: String) {
        val handle = value.trim().lowercase().replace(" ", "")
        _state.update {
            it.copy(username = handle, usernameAvailable = null, error = null)
        }
        scheduleUsernameCheck(handle)
    }

    fun onBioChange(value: String) = _state.update { it.copy(bio = value, error = null) }
    fun onAvatarUrlChange(value: String) = _state.update { it.copy(avatarUrl = value, error = null) }

    /**
     * Reads the picked image, uploads it to the public `avatars` bucket under the
     * caller's own folder and stores the resulting public URL. Keeps the previous
     * avatar if the upload fails, surfacing a friendly error instead.
     */
    fun onAvatarPicked(uri: Uri) {
        val uid = sessionStore.userId()
        if (uid == null) {
            _state.update { it.copy(error = "Your session has expired. Please sign in again.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isUploadingAvatar = true, error = null) }
            val url = withContext(dispatchers.io) {
                runCatching {
                    val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
                    val extension = when {
                        mime.contains("png") -> "png"
                        mime.contains("webp") -> "webp"
                        mime.contains("gif") -> "gif"
                        else -> "jpg"
                    }
                    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: error("Could not read the selected image")
                    storageApi.uploadToBucket(
                        bucket = "avatars",
                        objectPath = storageApi.avatarObjectPath(uid, extension),
                        bytes = bytes,
                        mime = mime,
                    )
                }.getOrNull()
            }
            _state.update {
                it.copy(
                    isUploadingAvatar = false,
                    avatarUrl = url ?: it.avatarUrl,
                    error = if (url == null) "Could not upload photo. Please try again." else null,
                )
            }
        }
    }

    /**
     * Debounced availability probe so the user learns a handle is taken before
     * they tap Continue. The backend unique constraint remains authoritative.
     */
    private fun scheduleUsernameCheck(handle: String) {
        usernameCheckJob?.cancel()
        if (handle.length < 3) {
            _state.update { it.copy(isCheckingUsername = false, usernameAvailable = null) }
            return
        }
        usernameCheckJob = viewModelScope.launch {
            _state.update { it.copy(isCheckingUsername = true) }
            delay(450)
            val available = withContext(dispatchers.io) {
                runCatching { restApi.isUsernameAvailable(handle) }.getOrDefault(true)
            }
            // Ignore the result if the user kept typing.
            if (_state.value.username == handle) {
                _state.update { it.copy(isCheckingUsername = false, usernameAvailable = available) }
            }
        }
    }

    /** Persists the profile fields to the `users` table (idempotent upsert by id). */
    fun saveProfile(onSaved: () -> Unit) {
        val uid = sessionStore.userId()
        if (uid == null) {
            _state.update { it.copy(error = "Your session has expired. Please sign in again.") }
            return
        }
        val snapshot = _state.value
        if (snapshot.usernameAvailable == false) {
            _state.update { it.copy(error = "That username is already taken. Please choose another.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isSaving = true, error = null) }
            val result = withContext(dispatchers.io) {
                runCatching {
                    restApi.upsertUser(
                        UserRow(
                            id = uid,
                            name = snapshot.displayName.ifBlank { null },
                            displayName = snapshot.displayName.ifBlank { null },
                            username = snapshot.username.ifBlank { null },
                            bio = snapshot.bio.ifBlank { null },
                            avatar = snapshot.avatarUrl.ifBlank { null },
                        ),
                    )
                }
            }
            result.fold(
                onSuccess = {
                    _state.update { it.copy(isSaving = false) }
                    onSaved()
                },
                onFailure = { t ->
                    // Map transport/provider errors to friendly copy instead of
                    // leaking the raw Ktor/PostgREST exception text (e.g. the
                    // "duplicate key value violates unique constraint
                    // users_username_key" 409).
                    val message = ErrorMapper.map(t).toUserMessage()
                    val isUsernameTaken = message.contains("username", ignoreCase = true) &&
                        message.contains("taken", ignoreCase = true)
                    _state.update {
                        it.copy(
                            isSaving = false,
                            error = message,
                            usernameAvailable = if (isUsernameTaken) false else it.usernameAvailable,
                        )
                    }
                },
            )
        }
    }

    /** Marks onboarding complete and hands control back to the app shell. */
    fun complete(onDone: () -> Unit) {
        viewModelScope.launch {
            onboardingPreferences.markCompleted()
            onDone()
        }
    }
}
