package app.gagachat.mobile.realtime

import android.content.Context
import androidx.work.*
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.prefs.SessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Durable retry for text messages after connectivity returns. client_message_id makes retries idempotent. */
class MessageOutboxWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        if (!SessionStore.isLoggedIn()) return@withContext Result.success()
        for (item in SessionStore.pendingTexts()) {
            val chatId = item.optString("chat_id")
            val clientId = item.optString("client_id")
            if (chatId.isBlank() || clientId.isBlank()) {
                SessionStore.removePendingText(clientId)
                continue
            }
            try {
                Api.post("/chats/$chatId/messages", JSONObject()
                    .put("text", item.optString("text"))
                    .put("client_message_id", clientId))
                SessionStore.removePendingText(clientId)
            } catch (e: Api.ApiError) {
                // Auth/conflict/validation errors need user/server intervention; don't retry forever.
                if (e.status in 400..499 && e.status != 408 && e.status != 429) {
                    SessionStore.removePendingText(clientId)
                    continue
                }
                return@withContext Result.retry()
            } catch (_: Exception) {
                return@withContext Result.retry()
            }
        }
        Result.success()
    }

    companion object {
        private const val UNIQUE = "gaga-message-outbox"
        fun schedule(ctx: Context) {
            val request = OneTimeWorkRequestBuilder<MessageOutboxWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(ctx.applicationContext)
                .enqueueUniqueWork(UNIQUE, ExistingWorkPolicy.KEEP, request)
        }
    }
}
