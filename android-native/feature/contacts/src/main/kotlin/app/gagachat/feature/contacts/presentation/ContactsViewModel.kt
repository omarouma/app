package app.gagachat.feature.contacts.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.collect
import app.gagachat.core.model.User
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PrivateContactRemark(
    val alias: String = "",
    val mobile: String = "",
    val tags: List<String> = emptyList(),
    val remark: String = "",
)

data class ContactsUiState(
    val query: String = "",
    val contacts: List<User> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val remarks: Map<String, PrivateContactRemark> = emptyMap(),
    val savingRemark: Boolean = false,
    val remarkError: String? = null,
)

/**
 * Contacts surface (Master Spec §C). Searches the LOCAL cache instantly and the
 * LIVE `users` table (debounced) so real people appear even before they are
 * cached — previously this only ever read the Room cache and looked empty.
 */
@HiltViewModel
class ContactsViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val conversationRepository: ConversationRepository,
    private val authRepository: AuthRepository,
    private val restApi: SupabaseRestApi,
) : ViewModel() {

    private val _state = MutableStateFlow(ContactsUiState())
    val state: StateFlow<ContactsUiState> = _state.asStateFlow()

    private var searchJob: Job? = null

    init {
        // Drop private notes immediately on account changes, even before fetch.
        viewModelScope.launch {
            authRepository.sessionFlow.map { it?.userId }.distinctUntilChanged().collect { owner ->
                _state.update { it.copy(remarks = emptyMap(), remarkError = null) }
                if (!owner.isNullOrBlank()) loadRemarks(owner)
            }
        }
        // Show everything we already know about while the user types.
        viewModelScope.launch {
            runCatching {
                val local = userRepository.searchUsers("").first()
                if (local.isNotEmpty()) {
                    _state.update { it.copy(contacts = merge(it.contacts, local)) }
                }
            }
        }
    }

    /** Remarks are fetched per logged-in account and discarded immediately on switch/logout. */
    private suspend fun loadRemarks(owner: String) {
        val result = runCatching { restApi.getContactRemarks(owner) }
        if (owner != authRepository.sessionFlow.value?.userId) return
        result.onSuccess { rows ->
            val data = rows.mapNotNull { row ->
                val id = row["contact_user_id"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                id to PrivateContactRemark(
                    alias = row["alias"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    mobile = row["mobile"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                    tags = runCatching {
                        row["tags"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }
                    }.getOrNull().orEmpty(),
                    remark = row["remark"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                )
            }.toMap()
            _state.update { it.copy(remarks = data, remarkError = null) }
        }.onFailure {
            _state.update { it.copy(remarkError = "Couldn't load private contact remarks.") }
        }
    }

    fun clearRemarkError() { _state.update { it.copy(remarkError = null) } }

    fun saveRemark(
        contactId: String, alias: String, mobile: String, tags: List<String>,
        remark: String, onSaved: () -> Unit,
    ) {
        val owner = authRepository.sessionFlow.value?.userId ?: return
        if (owner == contactId) return
        _state.update { it.copy(savingRemark = true, remarkError = null) }
        viewModelScope.launch {
            val saved = runCatching {
                restApi.saveContactRemark(
                    ownerId = owner,
                    contactId = contactId,
                    alias = alias.trim().take(64),
                    mobile = mobile.trim().take(40),
                    tags = tags.map { it.trim().take(32) }.filter { it.isNotBlank() }.distinct().take(16),
                    remark = remark.trim().take(1200),
                )
            }
            if (owner != authRepository.sessionFlow.value?.userId) return@launch
            _state.update {
                if (saved.isSuccess) it.copy(
                    savingRemark = false,
                    remarks = it.remarks + (contactId to PrivateContactRemark(
                        alias = alias.trim().take(64),
                        mobile = mobile.trim().take(40),
                        tags = tags.map { v -> v.trim().take(32) }.filter { v -> v.isNotBlank() }.distinct().take(16),
                        remark = remark.trim().take(1200),
                    )),
                ) else it.copy(savingRemark = false, remarkError = "Couldn't save remark. Please retry.")
            }
            if (saved.isSuccess) onSaved()
        }
    }

    fun onQueryChange(value: String) {
        _state.update { it.copy(query = value, error = null) }
        searchJob?.cancel()
        val trimmed = value.trim()
        if (trimmed.isEmpty()) {
            // Fall back to the full local cache.
            viewModelScope.launch {
                runCatching {
                    val local = userRepository.searchUsers("").first()
                    _state.update { it.copy(contacts = local, isLoading = false) }
                }
            }
            return
        }
        searchJob = viewModelScope.launch {
            // Instant local results first.
            runCatching {
                val local = userRepository.searchUsers(trimmed).first()
                // Search private aliases too, but only among users already
                // available in this account's local contact cache.
                val aliasMatches = userRepository.searchUsers("").first().filter { user ->
                    _state.value.remarks[user.id]?.alias
                        ?.contains(trimmed, ignoreCase = true) == true
                }
                _state.update { it.copy(contacts = merge(aliasMatches, local)) }
            }
            delay(300) // debounce before hitting the network
            _state.update { it.copy(isLoading = true) }
            when (val result = userRepository.searchUsersRemote(trimmed)) {
                is AppResult.Success -> {
                    val me = authRepository.sessionFlow.value?.userId
                    val remote = result.data.filter { it.id != me }
                    _state.update {
                        it.copy(contacts = merge(remote, it.contacts), isLoading = false)
                    }
                }
                is AppResult.Failure -> _state.update {
                    it.copy(isLoading = false, error = result.error.toUserMessage())
                }
                AppResult.Loading -> Unit
            }
        }
    }

    /**
     * Resolves (or creates) the direct conversation with [otherUserId] and hands
     * the conversation id back via [onReady] so the caller can navigate to chat.
     * Matches the People surface behaviour (Master Spec §C).
     */
    fun openChat(otherUserId: String, onReady: (String) -> Unit) {
        val me = authRepository.sessionFlow.value?.userId
        if (me.isNullOrBlank()) return
        viewModelScope.launch {
            when (val result = conversationRepository.openDirectConversation(me, otherUserId)) {
                is AppResult.Success -> onReady(result.data)
                else -> Unit
            }
        }
    }

    /** Remote results take precedence; local entries fill any gaps. */
    private fun merge(primary: List<User>, secondary: List<User>): List<User> {
        val seen = LinkedHashMap<String, User>()
        primary.forEach { seen[it.id] = it }
        secondary.forEach { if (!seen.containsKey(it.id)) seen[it.id] = it }
        return seen.values.toList()
    }
}
