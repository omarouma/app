package app.gagachat.feature.settings.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.network.dto.UserRow
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.core.network.session.SessionStore
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
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
 * State for the "Edit profile" settings screen (Master Spec §C).
 *
 * Mirrors the onboarding profile-save contract: read the signed-in user id from
 * the encrypted session, prefill from the cached user, then idempotently upsert
 * the `users` row by primary key. Username availability is probed before saving
 * and every failure is mapped to friendly copy (never a raw PostgREST 409).
 */
data class EditProfileUiState(
    val displayName: String = "",
    val username: String = "",
    val bio: String = "",
    val avatarUrl: String = "",
    val phone: String = "",
    val email: String = "",
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    val isCheckingUsername: Boolean = false,
    /** null = unknown/not yet checked, true = free, false = taken. */
    val usernameAvailable: Boolean? = null,
    val error: String? = null,
    val saved: Boolean = false,
)

@HiltViewModel
class EditProfileViewModel @Inject constructor(
    private val restApi: SupabaseRestApi,
    private val sessionStore: SessionStore,
    private val userRepository: UserRepository,
    private val authRepository: AuthRepository,
    private val dispatchers: DispatcherProvider,
) : ViewModel() {

    private val _state = MutableStateFlow(EditProfileUiState())
    val state: StateFlow<EditProfileUiState> = _state.asStateFlow()

    /** In-flight debounced availability check; cancelled on each new keystroke. */
    private var usernameCheckJob: Job? = null

    init {
        loadProfile()
    }

    private fun loadProfile() {
        val uid = sessionStore.userId()
        if (uid == null) {
            _state.update { it.copy(isLoading = false, error = "Your session has expired.") }
            return
        }
        viewModelScope.launch {
            userRepository.observeUser(uid).collect { user ->
                _state.update { current ->
                    // Do not clobber in-flight edits once the user has typed.
                    if (current.isSaving) return@update current
                    current.copy(
                        displayName = user?.displayName ?: current.displayName,
                        username = user?.username ?: current.username,
                        bio = user?.bio ?: current.bio,
                        avatarUrl = user?.avatar ?: current.avatarUrl,
                        phone = user?.phone ?: current.phone,
                        email = user?.email ?: current.email,
                        isLoading = false,
                    )
                }
            }
        }
    }

    fun onDisplayNameChange(value: String) = _state.update { it.copy(displayName = value, error = null) }

    fun onUsernameChange(value: String) {
        val handle = value.trim().lowercase().replace(" ", "")
        _state.update { it.copy(username = handle, usernameAvailable = null, error = null) }
        scheduleUsernameCheck(handle)
    }

    fun onBioChange(value: String) = _state.update { it.copy(bio = value, error = null) }
    fun onAvatarUrlChange(value: String) = _state.update { it.copy(avatarUrl = value, error = null) }

    /**
     * Debounced availability probe so the user learns a handle is taken before
     * they tap Save. The backend unique constraint remains authoritative.
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

    /** Persists edits to the `users` table and refreshes the local cache. */
    fun save(onSaved: () -> Unit) {
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
                    withContext(dispatchers.io) { runCatching { userRepository.refreshUser(uid) } }
                    _state.update { it.copy(isSaving = false, saved = true) }
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
}
