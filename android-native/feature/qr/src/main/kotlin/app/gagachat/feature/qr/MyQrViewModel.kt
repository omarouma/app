package app.gagachat.feature.qr

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.User
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * "My QR" (Master Spec §C). Renders a scannable code that encodes the current
 * user's id in a `gaga://user/<id>` deep link so any GaGa client can resolve it.
 */
@HiltViewModel
class MyQrViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val userRepository: UserRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<ScreenState<User>>(ScreenState.Initial)
    val state: StateFlow<ScreenState<User>> = _state.asStateFlow()

    val qrPayload: String
        get() = authRepository.sessionFlow.value?.userId?.let { QrPayload.encodeUser(it) }.orEmpty()

    init {
        refresh()
    }

    fun refresh() {
        val me = authRepository.sessionFlow.value?.userId.orEmpty()
        if (me.isBlank()) {
            _state.value = ScreenState.SessionExpired
            return
        }
        viewModelScope.launch {
            if (_state.value !is ScreenState.Content) _state.value = ScreenState.Loading
            when (val result = userRepository.getUser(me)) {
                is AppResult.Success -> _state.value = ScreenState.Content(result.data)
                is AppResult.Failure -> _state.value = ScreenState.Error(result.error.toUserMessage())
                AppResult.Loading -> Unit
            }
        }
    }
}

/**
 * Encodes/decodes GaGa QR payloads. The canonical form is `gaga://user/<id>`;
 * for convenience we also accept a bare user id or `@username`.
 */
object QrPayload {
    private const val SCHEME = "gaga://user/"

    fun encodeUser(userId: String): String = "$SCHEME$userId"

    /** Returns the user id embedded in [raw], or null if it is a username/other. */
    fun decodeUserId(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        if (trimmed.startsWith(SCHEME)) return trimmed.removePrefix(SCHEME).ifBlank { null }
        if (trimmed.startsWith("gaga://")) {
            return trimmed.removePrefix("gaga://").substringAfter("user/", "").ifBlank { null }
        }
        // Bare id: accept anything that is not an @handle.
        return if (!trimmed.startsWith("@")) trimmed else null
    }

    /** Returns a `@username` handle (without the @) if [raw] is one. */
    fun decodeUsername(raw: String): String? {
        val trimmed = raw.trim()
        return if (trimmed.startsWith("@")) trimmed.removePrefix("@").ifBlank { null } else null
    }
}
