package app.gagachat.feature.home.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.UserRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Lightweight payload for the More menu's profile card. */
data class MoreUiState(
    val displayName: String = "",
    val username: String? = null,
    val avatarUrl: String? = null,
)

/**
 * Backs the "More" menu (reference screenshots 174121 / 174131 / 174138). It only
 * needs the signed-in user's identity for the header card and a sign-out action;
 * every row is a plain navigation action owned by the caller.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class MoreViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    userRepository: UserRepository,
) : ViewModel() {

    val state: StateFlow<MoreUiState> = authRepository.sessionFlow
        .flatMapLatest { session ->
            val userId = session?.userId
            if (userId.isNullOrBlank()) {
                flowOf(MoreUiState(displayName = session?.displayName.orEmpty()))
            } else {
                userRepository.observeUser(userId).map { user ->
                    MoreUiState(
                        displayName = user?.displayName ?: session?.displayName.orEmpty(),
                        username = user?.username,
                        avatarUrl = user?.avatar,
                    )
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MoreUiState())

    /** Clears the persisted session; the root composable swaps to the auth graph. */
    fun signOut() {
        viewModelScope.launch { authRepository.signOut() }
    }
}
