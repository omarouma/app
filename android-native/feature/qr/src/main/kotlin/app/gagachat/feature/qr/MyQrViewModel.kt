package app.gagachat.feature.qr

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.data.repository.WalletRepository
import app.gagachat.core.model.User
import app.gagachat.core.ui.state.ScreenState
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** UI payload for the "My QR" screen: the profile plus wallet summary. */
data class MyQrUi(
    val user: User,
    val walletCode: String,
    val balance: String,
    val qrPayload: String,
)

/**
 * "My QR" (Master Spec §C). Renders a scannable code that encodes the current
 * user's id in a `gaga://user/<id>` deep link so any GaGa client can resolve it.
 */
@HiltViewModel
class MyQrViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val userRepository: UserRepository,
    private val walletRepository: WalletRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<ScreenState<MyQrUi>>(ScreenState.Initial)
    val state: StateFlow<ScreenState<MyQrUi>> = _state.asStateFlow()

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
            val walletResult = walletRepository.ensureWallet()
            when (val result = userRepository.getUser(me)) {
                is AppResult.Success -> {
                    val wallet = (walletResult as? AppResult.Success)?.data
                    _state.value = ScreenState.Content(
                        MyQrUi(
                            user = result.data,
                            walletCode = wallet?.walletCode ?: "GC-",
                            balance = wallet?.formatted ?: "0",
                            qrPayload = QrPayload.encodeUser(me),
                        ),
                    )
                }
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

    /**
     * Returns the user id embedded in [raw], or null if it is a username/other.
     *
     * Tolerant by design: the code may arrive on its own, as a bare id, or
     * embedded in a pasted share message such as
     * `"Add John on GaGa Chat: gaga://user/123"`, so we search for the scheme
     * anywhere in the text and stop at the first whitespace.
     */
    fun decodeUserId(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null

        // 1. Canonical `gaga://user/<id>` link, anywhere in the text.
        val schemeIndex = trimmed.indexOf(SCHEME)
        if (schemeIndex >= 0) {
            val id = trimmed.substring(schemeIndex + SCHEME.length)
                .takeWhile { !it.isWhitespace() }
                .trimEnd('.', ',', ')', ']', '>', '"', '\'')
                .ifBlank { null }
            if (id != null) return id
        }

        // 2. Any other `gaga://…/user/<id>` link.
        val genericIndex = trimmed.indexOf("gaga://")
        if (genericIndex >= 0) {
            val rest = trimmed.substring(genericIndex + "gaga://".length)
            val id = rest.substringAfter("user/", "")
                .takeWhile { !it.isWhitespace() }
                .trimEnd('.', ',', ')', ']', '>', '"', '\'')
                .ifBlank { null }
            if (id != null) return id
        }

        // 3. Bare id: accept anything that is not an @handle and has no spaces
        //    (so a pasted sentence is never mistaken for an id).
        return if (!trimmed.startsWith("@") && trimmed.none { it.isWhitespace() }) trimmed else null
    }

    /** Returns a `@username` handle (without the @) if [raw] contains one. */
    fun decodeUsername(raw: String): String? {
        val trimmed = raw.trim()
        val atIndex = trimmed.indexOf('@')
        if (atIndex < 0) return null
        // Only treat it as a handle at a word boundary (start or after a space),
        // so email-like strings are not misread.
        if (atIndex > 0 && !trimmed[atIndex - 1].isWhitespace()) return null
        return trimmed.substring(atIndex + 1)
            .takeWhile { it.isLetterOrDigit() || it == '_' || it == '.' }
            .ifBlank { null }
    }
}
