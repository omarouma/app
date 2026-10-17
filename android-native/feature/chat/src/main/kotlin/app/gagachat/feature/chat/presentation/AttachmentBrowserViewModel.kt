package app.gagachat.feature.chat.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.SavedMessagesRepository
import app.gagachat.core.data.repository.AttachmentSearchRepository
import app.gagachat.core.model.Message
import app.gagachat.core.data.mapper.toDomain
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.core.model.User
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.CancellationException
import javax.inject.Inject

@HiltViewModel
class AttachmentBrowserViewModel @Inject constructor(
    private val auth: AuthRepository,
    private val friends: FriendsRepository,
    private val saved: SavedMessagesRepository,
    private val attachmentSearch: AttachmentSearchRepository,
    private val api: SupabaseRestApi,
) : ViewModel() {
    private val _contacts = MutableStateFlow<List<User>>(emptyList())
    val contacts = _contacts.asStateFlow()
    val error = MutableStateFlow<String?>(null)
    val loading = MutableStateFlow(false)
    val files = MutableStateFlow<List<Message>>(emptyList())
    val filesLoading = MutableStateFlow(false)
    val filesError = MutableStateFlow<String?>(null)
    val hasMoreFiles = MutableStateFlow(false)
    private var fileJob: Job? = null
    private var fileQuery = ""
    private var fileOffset = 0
    private var fileGeneration = 0
    val directory = MutableStateFlow<List<User>>(emptyList())
    val directoryLoading = MutableStateFlow(false)
    val directoryError = MutableStateFlow<String?>(null)
    val directoryHasMore = MutableStateFlow(false)
    val verificationStatus = MutableStateFlow<String?>(null)
    val verificationSending = MutableStateFlow(false)
    private var directoryJob: Job? = null
    private var directoryGeneration = 0
    private var directoryKind = "official"
    private var directoryQuery = ""
    private var directoryOffset = 0

    fun searchDirectory(kind: String, query: String) {
        directoryGeneration++
        directoryJob?.cancel()
        directoryJob = null
        directory.value = emptyList()
        directoryHasMore.value = false
        directoryKind = kind
        directoryQuery = query
        directoryOffset = 0
        loadDirectory()
    }

    fun loadDirectory() {
        if (directoryJob?.isActive == true) return
        val owner = auth.sessionFlow.value?.userId ?: return
        val generation = directoryGeneration
        directoryLoading.value = true
        directoryError.value = null
        directoryJob = viewModelScope.launch {
            try {
                delay(300)
                val rows = api.getAccountDirectory(directoryKind, directoryQuery, directoryOffset)
                if (generation != directoryGeneration || owner != auth.sessionFlow.value?.userId) return@launch
                directory.value = (directory.value + rows.map { it.toDomain() }).distinctBy { it.id }
                directoryOffset += rows.size
                directoryHasMore.value = rows.size == 40
            } catch (t: Exception) {
                if (t is CancellationException) throw t
                if (generation == directoryGeneration && owner == auth.sessionFlow.value?.userId)
                    directoryError.value = "Couldn't load the account directory. Retry when connected."
            } finally { if (generation == directoryGeneration) directoryLoading.value = false }
        }
    }

    fun requestVerification(kind: String, organization: String, website: String) {
        if (verificationSending.value) return
        val owner = auth.sessionFlow.value?.userId ?: return
        verificationSending.value = true
        verificationStatus.value = null
        viewModelScope.launch {
            try {
                api.requestAccountVerification(kind, organization, website)
                if (owner == auth.sessionFlow.value?.userId)
                    verificationStatus.value = "Request submitted. Your organization must be verified before appearing in the directory."
            } catch (t: Exception) {
                if (t is CancellationException) throw t
                if (owner == auth.sessionFlow.value?.userId)
                    verificationStatus.value = "Couldn't submit. Check the organization and HTTPS website. Approved accounts cannot resubmit."
            } finally { verificationSending.value = false }
        }
    }

    fun searchFiles(query: String) {
        fileQuery = query
        fileGeneration++
        fileJob?.cancel()
        files.value = emptyList()
        filesError.value = null
        hasMoreFiles.value = false
        fileOffset = 0
        loadFiles(debounce = true)
    }

    fun loadMoreFiles() { if (!filesLoading.value && hasMoreFiles.value) loadFiles() }
    fun retryFiles() { if (!filesLoading.value) loadFiles() }

    private fun loadFiles(debounce: Boolean = false) {
        val generation = fileGeneration
        val owner = auth.sessionFlow.value?.userId ?: return
        filesLoading.value = true
        filesError.value = null
        fileJob = viewModelScope.launch {
            try {
                if (debounce) delay(300)
                val page = attachmentSearch.search(fileQuery, fileOffset)
                if (generation != fileGeneration || owner != auth.sessionFlow.value?.userId) return@launch
                files.value = (files.value + reusableAttachments(page.messages)).distinctBy { it.serverMessageId ?: it.localId }
                fileOffset = page.nextOffset
                hasMoreFiles.value = page.hasMore
            } catch (t: Exception) {
                if (t is CancellationException) throw t
                if (generation == fileGeneration && owner == auth.sessionFlow.value?.userId)
                    filesError.value = "Couldn't load chat files. Retry when connected."
            } finally {
                if (generation == fileGeneration) filesLoading.value = false
            }
        }
    }
    val favorites = combine(auth.sessionFlow, saved.savedMessages) { session, rows ->
        rows.filter { it.userId == session?.userId }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        viewModelScope.launch {
            auth.sessionFlow.map { it?.userId }.distinctUntilChanged().collectLatest { owner ->
                _contacts.value = emptyList()
                fileGeneration++
                fileJob?.cancel()
                files.value = emptyList()
                filesLoading.value = false
                filesError.value = null
                hasMoreFiles.value = false
                directoryGeneration++
                directoryJob?.cancel()
                directoryJob = null
                directory.value = emptyList()
                directoryLoading.value = false
                directoryError.value = null
                directoryHasMore.value = false
                verificationStatus.value = null
                if (!owner.isNullOrBlank()) {
                    searchFiles(fileQuery)
                    searchDirectory(directoryKind, directoryQuery)
                    refreshOwner(owner)
                }
            }
        }
    }

    fun refresh() = viewModelScope.launch {
        auth.sessionFlow.value?.userId?.let { refreshOwner(it) }
    }

    private suspend fun refreshOwner(owner: String) {
        loading.value = true
        error.value = null
        val friendResult = friends.refresh()
        val savedResult = saved.refresh()
        if (owner != auth.sessionFlow.value?.userId) { loading.value = false; return }
        _contacts.value = friends.friends.value.map { it.user }.filter { it.id != owner }
        if (friendResult is AppResult.Failure || savedResult is AppResult.Failure)
            error.value = "Couldn't refresh everything. Retry when connected."
        loading.value = false
    }
}
