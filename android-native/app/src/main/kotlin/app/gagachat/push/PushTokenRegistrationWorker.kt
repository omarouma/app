package app.gagachat.push

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.gagachat.core.data.repository.AuthRepository
import com.google.firebase.messaging.FirebaseMessaging
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Retries transient token retrieval/registration failures without storing token input data. */
@HiltWorker
class PushTokenRegistrationWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted parameters: WorkerParameters,
    private val registrar: PushTokenRegistrar,
    private val auth: AuthRepository,
) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val userId = auth.sessionFlow.value?.userId ?: return Result.success()
        return try {
            withTimeout(20_000L) {
                val token = suspendCancellableCoroutine<String> { continuation ->
                    FirebaseMessaging.getInstance().token
                        .addOnSuccessListener { if (continuation.isActive) continuation.resume(it) }
                        .addOnFailureListener { if (continuation.isActive) continuation.resumeWithException(it) }
                }
                check(token.isNotBlank()) { "Push token unavailable" }
                if (auth.sessionFlow.value?.userId == userId) registrar.register(token)
            }
            Result.success()
        } catch (error: Exception) {
            if (error is CancellationException && error !is TimeoutCancellationException) throw error
            if (runAttemptCount < 5) Result.retry() else Result.failure()
        }
    }
}
