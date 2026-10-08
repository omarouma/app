package app.gagachat.feature.chat.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.model.TranslateResult
import app.gagachat.core.network.rest.TranslateApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * GaGa Language Bridge (Signature Features 2.4).
 *
 * Backs the per-message "Translate" action. The original message is never
 * modified; the translated text is shown alongside it. Every request goes
 * through the authenticated `translate-message` Edge Function, so the provider
 * credentials stay server-side.
 */
data class TranslateUiState(
    val target: String = "en",
    val source: String = "auto",
    val loading: Boolean = false,
    val result: TranslateResult? = null,
    val error: String? = null,
)

@HiltViewModel
class TranslateViewModel @Inject constructor(
    private val translateApi: TranslateApi,
) : ViewModel() {

    private val _state = MutableStateFlow(TranslateUiState())
    val state: StateFlow<TranslateUiState> = _state.asStateFlow()

    fun setTarget(code: String) {
        _state.value = _state.value.copy(target = code, result = null, error = null)
    }

    fun translate(text: String) {
        val snapshot = _state.value
        val body = text.trim()
        if (body.isEmpty()) {
            _state.value = snapshot.copy(error = "Nothing to translate")
            return
        }
        _state.value = snapshot.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { translateApi.translate(body, snapshot.target, snapshot.source) }
                .onSuccess { result ->
                    _state.value = _state.value.copy(loading = false, result = result, error = null)
                }
                .onFailure { throwable ->
                    _state.value = _state.value.copy(
                        loading = false,
                        error = friendly(throwable),
                    )
                }
        }
    }

    fun reset() {
        _state.value = TranslateUiState()
    }

    private fun friendly(throwable: Throwable): String = when {
        throwable.message?.contains("not_configured", ignoreCase = true) == true ->
            "Translation is not enabled on this server yet."
        throwable.message?.contains("unauthorized", ignoreCase = true) == true ->
            "Please sign in again to translate."
        throwable.message?.contains("timeout", ignoreCase = true) == true ->
            "Translation timed out. Please try again."
        else -> "Couldn't translate right now. Please try again."
    }
}
