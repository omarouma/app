package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.model.BlockEntry
import app.gagachat.core.model.User
import app.gagachat.core.network.dto.BlockRow
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Blocked-users (LIVE table `blocked_users`). Network-first with an in-memory
 * cache so the Blocked-users settings screen renders instantly after first load.
 */
interface BlockRepository {
    val blocked: StateFlow<List<BlockEntry>>

    suspend fun refresh(): AppResult<Unit>
    suspend fun block(userId: String, reason: String? = null): AppResult<Unit>
    suspend fun unblock(userId: String): AppResult<Unit>
    suspend fun isBlocked(userId: String): Boolean

    /** Resolves the blocked user profiles (for display in the settings list). */
    suspend fun resolveUsers(): List<User>
}

@Singleton
class DefaultBlockRepository @Inject constructor(
    private val restApi: SupabaseRestApi,
    private val authRepository: AuthRepository,
    private val userRepository: UserRepository,
    private val dispatchers: DispatcherProvider,
) : BlockRepository {

    private val _blocked = MutableStateFlow<List<BlockEntry>>(emptyList())
    override val blocked: StateFlow<List<BlockEntry>> = _blocked.asStateFlow()

    private val currentUserId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    override suspend fun refresh(): AppResult<Unit> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized("Not signed in"))
        try {
            val rows = restApi.getBlocks(me)
            _blocked.value = rows.map {
                BlockEntry(ownerId = it.ownerId, targetId = it.targetId, createdAt = it.createdAt ?: 0L)
            }
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun block(userId: String, reason: String?): AppResult<Unit> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        try {
            restApi.upsertBlock(BlockRow(ownerId = me, targetId = userId, reason = reason))
            _blocked.value = _blocked.value.filterNot { it.targetId == userId } +
                BlockEntry(ownerId = me, targetId = userId)
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun unblock(userId: String): AppResult<Unit> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized())
        try {
            restApi.deleteBlock(me, userId)
            _blocked.value = _blocked.value.filterNot { it.targetId == userId }
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun isBlocked(userId: String): Boolean =
        _blocked.value.any { it.targetId == userId }

    override suspend fun resolveUsers(): List<User> = withContext(dispatchers.io) {
        _blocked.value.mapNotNull { entry ->
            when (val r = userRepository.getUser(entry.targetId)) {
                is AppResult.Success -> r.data
                else -> null
            }
        }
    }
}
