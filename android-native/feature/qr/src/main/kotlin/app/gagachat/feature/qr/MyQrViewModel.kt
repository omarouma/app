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
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MyQrUi(
    val user: User?,
    val qrPayload: String,
    val profileError: String? = null,
)

/**
 * Profile QR only. The older UI advertised Transfer/Wallet/Group QR variants,
 * but those tabs all encoded the same profile link and were misleading.
 * A wallet transaction or group join must use an independent validated flow.
 */
@HiltViewModel
class MyQrViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val userRepository: UserRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<ScreenState<MyQrUi>>(ScreenState.Initial)
    val state: StateFlow<ScreenState<MyQrUi>> = _state.asStateFlow()

    val qrPayload: String
        get() = authRepository.sessionFlow.value?.userId?.let(QrPayload::encodeUser).orEmpty()

    private var profileJob: Job? = null
    init {
        viewModelScope.launch {
            authRepository.sessionFlow.map { it?.userId }.distinctUntilChanged().collect { refresh() }
        }
    }

    fun refresh() {
        profileJob?.cancel()
        val me = authRepository.sessionFlow.value?.userId.orEmpty()
        if (me.isBlank()) {
            _state.value = ScreenState.SessionExpired
            return
        }
        _state.value = ScreenState.Content(MyQrUi(user = null, qrPayload = QrPayload.encodeUser(me)))
        profileJob = viewModelScope.launch {
            val result = try {
                userRepository.getUser(me)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                null
            }
            val current = _state.value
            if (authRepository.sessionFlow.value?.userId == me && current is ScreenState.Content && current.data.qrPayload == QrPayload.encodeUser(me)) {
                _state.value = ScreenState.Content(
                    when (result) {
                        is AppResult.Success -> current.data.copy(user = result.data, profileError = null)
                        is AppResult.Failure -> current.data.copy(profileError = result.error.toUserMessage())
                        else -> current.data.copy(profileError = "Profile unavailable. Your QR code still works.")
                    },
                )
            }
        }
    }
}

/**
 * Supported input formats are exact, recognized GaGa profile links,
 * legacy gaga://user/<UUID> QR values, a bare UUID, or an @username.
 * Never interpret an arbitrary URL, email, or text as a user ID.
 */
object QrPayload {
    private val uuid = Regex(
        "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
    )
    private val recognizedLink = Regex(
        "(?i)(?:https://gagachat\\.app/profile/|gaga://user/|gagachat://profile/)" +
            "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})" +
            "(?=$|[\\s/?#.,)\\]>\"'])",
    )
    private val username = Regex("(?:^|\\s)@([A-Za-z0-9_.]{2,32})(?=$|[\\s,.;!?])")

    fun encodeUser(userId: String): String = "https://gagachat.app/profile/$userId"

    fun decodeUserId(raw: String): String? {
        val cleaned = raw.trim().takeIf { it.isNotEmpty() && it.length <= 2048 } ?: return null
        if (uuid.matches(cleaned)) return cleaned.lowercase()
        return recognizedLink.find(cleaned)?.groupValues?.getOrNull(1)?.lowercase()
    }

    fun decodeUsername(raw: String): String? {
        val cleaned = raw.trim().takeIf { it.isNotEmpty() && it.length <= 2048 } ?: return null
        return username.find(cleaned)?.groupValues?.getOrNull(1)
    }
}
