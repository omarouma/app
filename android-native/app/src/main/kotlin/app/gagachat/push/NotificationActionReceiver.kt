package app.gagachat.push

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import app.gagachat.MainActivity
import app.gagachat.core.common.result.getOrNull
import app.gagachat.core.data.repository.CallRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.MessageRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.CallStatus
import app.gagachat.core.model.NotificationPolicy
import app.gagachat.core.network.session.SessionStore
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Handles the notification action buttons (GaGa Notifications V3, issue #135).
 *
 * All actions are delivered as explicit, non-exported broadcasts, so only the
 * app itself can trigger them. Each action re-checks the authenticated session
 * and performs the same repository call the in-app UI would, which keeps the
 * notification surface from becoming a privilege boundary.
 *
 *  - [ACTION_REPLY] sends the [RemoteInput] text through the normal outbox path.
 *  - [ACTION_MARK_READ] clears the unread count for the authenticated recipient.
 *  - [ACTION_DECLINE_CALL] rejects the call and dismisses the ringing notification.
 *  - [ACTION_CALL_BACK] opens the originating chat, where the user can start a
 *    validated new call (a background process never places a call on its own).
 */
@AndroidEntryPoint
class NotificationActionReceiver : BroadcastReceiver() {

    @Inject lateinit var messages: MessageRepository
    @Inject lateinit var conversations: ConversationRepository
    @Inject lateinit var calls: CallRepository
    @Inject lateinit var users: UserRepository
    @Inject lateinit var sessionStore: SessionStore

    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                when (intent.action) {
                    ACTION_REPLY -> handleReply(context, intent)
                    ACTION_MARK_READ -> handleMarkRead(context, intent)
                    ACTION_DECLINE_CALL -> handleDecline(context, intent)
                    ACTION_CALL_BACK -> handleCallBack(context, intent)
                }
            } finally {
                pending.finish()
            }
        }
    }

    private suspend fun handleReply(context: Context, intent: Intent) {
        val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID) ?: return
        val results = RemoteInput.getResultsFromIntent(intent) ?: return
        val text = results.getCharSequence(KEY_REPLY_TEXT)?.toString()?.trim().orEmpty()
        if (text.isEmpty()) return
        val userId = sessionStore.userId() ?: return
        val me = users.getUser(userId).getOrNull()
        messages.sendText(
            conversationId = conversationId,
            senderId = userId,
            senderName = me?.displayLabel,
            senderAvatar = me?.avatar,
            text = text,
        )
        // The message is queued locally and will be delivered by the outbox; the
        // tray entry has served its purpose, so clear it.
        dismissConversation(context, conversationId)
    }

    private suspend fun handleMarkRead(context: Context, intent: Intent) {
        val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID) ?: return
        if (sessionStore.userId() == null) return
        val messageId = intent.getStringExtra(EXTRA_MESSAGE_ID)
            ?: conversations.lastMessageId(conversationId)
            ?: ""
        conversations.markRead(conversationId, messageId)
        dismissConversation(context, conversationId)
    }

    private suspend fun handleDecline(context: Context, intent: Intent) {
        val callId = intent.getStringExtra(EXTRA_CALL_ID) ?: return
        val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID)
        if (sessionStore.userId() == null) return
        runCatching { calls.endCall(callId, CallStatus.REJECTED, null) }
        if (conversationId != null) NotificationHelper.cancelIncomingCall(context, conversationId)
    }

    private fun handleCallBack(context: Context, intent: Intent) {
        val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID) ?: return
        val launch = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data = android.net.Uri.parse("gagachat://chat/$conversationId")
        }
        context.startActivity(launch)
        NotificationManagerCompat.from(context).cancel(
            NotificationPolicy.missedCallNotificationId(conversationId),
        )
    }

    private fun dismissConversation(context: Context, conversationId: String) {
        val manager = NotificationManagerCompat.from(context)
        manager.cancel(NotificationPolicy.conversationNotificationId(conversationId))
        manager.cancel(NotificationPolicy.summaryId(conversationId))
    }

    companion object {
        const val ACTION_REPLY = "app.gagachat.notification.REPLY"
        const val ACTION_MARK_READ = "app.gagachat.notification.MARK_READ"
        const val ACTION_DECLINE_CALL = "app.gagachat.notification.DECLINE_CALL"
        const val ACTION_CALL_BACK = "app.gagachat.notification.CALL_BACK"

        const val KEY_REPLY_TEXT = "gaga_reply_text"
        const val EXTRA_CONVERSATION_ID = "conversation_id"
        const val EXTRA_MESSAGE_ID = "message_id"
        const val EXTRA_CALL_ID = "call_id"

        /** Builds the explicit broadcast PendingIntent used by notification actions. */
        fun pending(
            context: Context,
            action: String,
            requestCode: Int,
            conversationId: String? = null,
            messageId: String? = null,
            callId: String? = null,
            mutable: Boolean = false,
        ): PendingIntent {
            val intent = Intent(context, NotificationActionReceiver::class.java).apply {
                this.action = action
                conversationId?.let { putExtra(EXTRA_CONVERSATION_ID, it) }
                messageId?.let { putExtra(EXTRA_MESSAGE_ID, it) }
                callId?.let { putExtra(EXTRA_CALL_ID, it) }
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                if (mutable) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE
            return PendingIntent.getBroadcast(context, requestCode, intent, flags)
        }
    }
}
