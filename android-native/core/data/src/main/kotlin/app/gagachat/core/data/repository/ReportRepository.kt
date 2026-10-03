package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.network.dto.ReportRow
import app.gagachat.core.network.error.ErrorMapper
import app.gagachat.core.network.rest.SupabaseRestApi
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Abuse reports (LIVE table `reports`). A report is written once and reviewed
 * out-of-band by moderators; the client never reads the table back, so this is
 * a fire-and-forget write that still returns an explicit result so the UI can
 * give honest feedback instead of a fake "submitted" confirmation.
 */
interface ReportRepository {
    suspend fun submitReport(
        targetUserId: String,
        conversationId: String? = null,
        reason: String? = null,
        details: String? = null,
    ): AppResult<Unit>
}

@Singleton
class DefaultReportRepository @Inject constructor(
    private val restApi: SupabaseRestApi,
    private val authRepository: AuthRepository,
    private val dispatchers: DispatcherProvider,
) : ReportRepository {

    private val currentUserId: String
        get() = authRepository.sessionFlow.value?.userId.orEmpty()

    override suspend fun submitReport(
        targetUserId: String,
        conversationId: String?,
        reason: String?,
        details: String?,
    ): AppResult<Unit> = withContext(dispatchers.io) {
        val me = currentUserId
        if (me.isBlank()) return@withContext AppResult.Failure(AppError.Unauthorized("Not signed in"))
        if (targetUserId.isBlank()) {
            return@withContext AppResult.Failure(AppError.Validation("Nothing to report"))
        }
        if (me == targetUserId) {
            return@withContext AppResult.Failure(AppError.Validation("You can't report yourself"))
        }
        try {
            restApi.submitReport(
                ReportRow(
                    reporterId = me,
                    targetId = targetUserId,
                    conversationId = conversationId,
                    reason = reason,
                    details = details,
                ),
            )
            AppResult.Success(Unit)
        } catch (t: Throwable) {
            AppResult.Failure(ErrorMapper.map(t))
        }
    }
}
