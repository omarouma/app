package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.data.mapper.toDomain
import app.gagachat.core.database.dao.UserDao
import app.gagachat.core.database.mapper.toDomain
import app.gagachat.core.database.mapper.toEntity
import app.gagachat.core.model.User
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * User/profile access (PDF §4 — show cached, refresh in background).
 */
interface UserRepository {
    fun observeUser(id: String): Flow<User?>
    fun observeUsers(ids: List<String>): Flow<List<User>>
    fun searchUsers(query: String): Flow<List<User>>
    suspend fun getUser(id: String): AppResult<User>
    suspend fun refreshUser(id: String): AppResult<User>
    suspend fun cacheUsers(users: List<User>)
}

@Singleton
class DefaultUserRepository @Inject constructor(
    private val userDao: UserDao,
    private val restApi: SupabaseRestApi,
    private val timeProvider: TimeProvider,
    private val dispatchers: DispatcherProvider,
) : UserRepository {

    override fun observeUser(id: String): Flow<User?> =
        userDao.observeById(id).map { it?.toDomain() }

    override fun observeUsers(ids: List<String>): Flow<List<User>> =
        userDao.observeByIds(ids).map { list -> list.map { it.toDomain() } }

    override fun searchUsers(query: String): Flow<List<User>> =
        userDao.search(query, 30).map { list -> list.map { it.toDomain() } }

    override suspend fun getUser(id: String): AppResult<User> = withContext(dispatchers.io) {
        // Cache-first: return local immediately if present, else fetch.
        userDao.getById(id)?.let { return@withContext AppResult.Success(it.toDomain()) }
        refreshUser(id)
    }

    override suspend fun refreshUser(id: String): AppResult<User> = withContext(dispatchers.io) {
        try {
            val row = restApi.getUser(id)
                ?: return@withContext AppResult.Failure(
                    app.gagachat.core.common.result.AppError.Validation("User not found"),
                )
            val user = row.toDomain()
            userDao.upsert(user.toEntity(timeProvider.nowMillis()))
            AppResult.Success(user)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }

    override suspend fun cacheUsers(users: List<User>) = withContext(dispatchers.io) {
        val now = timeProvider.nowMillis()
        userDao.upsertAll(users.map { it.toEntity(now) })
    }
}
