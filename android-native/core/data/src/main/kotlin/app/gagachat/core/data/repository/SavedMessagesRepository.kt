package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.model.SavedMessage
import app.gagachat.core.network.dto.SavedMessageInsert
import app.gagachat.core.network.dto.SavedMessageRow
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Bookmarked messages (LIVE table `saved_messages`). Network-first with an
 * in-memory cache so the Profile hub "Saved Messages" list is instant on
 * re-entry.
 */
interface SavedMessagesRepository {
    val savedMessages: StateFlow<List<SavedMessage>>

    suspend fun refresh(): AppResult<Unit>
    suspend fun save(message: SavedMessage): AppResult<Unit>
    suspend fun delete(id: String): AppResult<Unit>
}

@Singleton
class DefaultSavedMessagesRepository @Inject constructor(
    private val restApi: SupabaseRestApi,
    private val authRepository: AuthRepository,
    private val dispatchers: DispatcherProvider,
) : SavedMessagesRepository {

    private val _savedMessages = MutableStateFlow<List<SavedMessage>>(emptyList())
    override val savedMessages: StateFlow<List<SavedMessage>> = _savedMessages.asStateFlow()

    private val currentUserId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    override suspend fun refresh(): AppResult<Unit> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized("Not signed in"))
        try {
            val rows = restApi.getSavedMessages(me)
            _savedMessages.value = rows.map { it.toDomain() }
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun save(message: SavedMessage): AppResult<Unit> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized("Not signed in"))
        try {
            val row = restApi.saveMessage(
                SavedMessageInsert(
                    userId = me,
                    messageId = message.messageId,
                    chatId = message.chatId,
                    senderId = message.senderId,
                    content = message.content,
                    type = message.type,
                    mediaUrl = message.mediaUrl,
                ),
            )
            val domain = row.toDomain()
            _savedMessages.value = (listOf(domain) + _savedMessages.value.filterNot { it.id == domain.id })
                .sortedByDescending { it.savedAt }
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun delete(id: String): AppResult<Unit> = withContext(dispatchers.io) {
        try {
            restApi.deleteSavedMessage(id)
            _savedMessages.value = _savedMessages.value.filterNot { it.id == id }
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }
}

private fun SavedMessageRow.toDomain(): SavedMessage = SavedMessage(
    id = id,
    userId = userId,
    messageId = messageId,
    chatId = chatId,
    senderId = senderId,
    content = content,
    type = type ?: "text",
    mediaUrl = mediaUrl,
    savedAt = savedAt ?: 0L,
)
