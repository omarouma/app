package app.gagachat.core.firebase

import app.gagachat.core.common.result.AppError
import app.gagachat.core.common.result.AppResult
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Authoritative Firestore chat transport (migration spec §3, §6).
 *
 * When the Firebase transport is enabled this class — not the legacy Supabase
 * mirror — is the source of truth for messages, typing, presence, read receipts
 * and reactions. Every write is shaped to satisfy `firestore.rules`:
 *
 *   • the acting user's canonical id is the `gaga_user_id` claim, so a write only
 *     succeeds when the caller is a mapped participant;
 *   • a message's `senderId` must equal the caller (author-only edits);
 *   • receipts/reactions are keyed by the acting user (doc id == uid);
 *   • a message is written under the client-supplied [MessageDraft.clientMessageId]
 *     so an at-least-once retry is idempotent (the same doc is overwritten, never
 *     duplicated) — this is the client half of the durable-outbox contract.
 *
 * All methods are guarded by [enabled] and return an [AppResult] instead of
 * throwing, so a transport failure is explicit and never crashes the UI.
 */
@Singleton
class FirestoreChatTransport @Inject constructor(
    private val environment: FirebaseEnvironment,
    private val config: FirebaseTransportConfig,
) {
    val enabled: Boolean get() = config.enabled && environment.isConfigured

    /** Transport-neutral message model, independent of any provider DTO. */
    data class ChatMessage(
        val id: String,
        val conversationId: String,
        val senderId: String,
        val type: String,
        val text: String?,
        val clientMessageId: String?,
        val serverTs: Long?,
        val clientTs: Long?,
        val replyToId: String?,
        val forwardedFrom: String?,
        val status: String?,
        val editedAt: Long?,
        val deletedAt: Long?,
        val attachments: List<Map<String, Any?>>,
    )

    /** A message the caller wants to send. */
    data class MessageDraft(
        val conversationId: String,
        val clientMessageId: String,
        val senderId: String,
        val type: String,
        val text: String?,
        val replyToId: String? = null,
        val forwardedFrom: String? = null,
        val attachments: List<Map<String, Any?>> = emptyList(),
    )

    private val db: FirebaseFirestore? get() = environment.firestore

    private fun messages(chatId: String) = db!!.collection("chats").document(chatId).collection("messages")

    // ── conversations ─────────────────────────────────────────────────────────

    /**
     * Creates (or merges) the `chats/{chatId}` document. `participants` uses
     * `arrayUnion` so membership only ever grows here; authoritative membership
     * changes (add/remove) go through the admin path, not this call.
     */
    suspend fun ensureConversation(
        conversationId: String,
        participants: List<String>,
        type: String,
        createdBy: String? = null,
    ): AppResult<Unit> = guard {
        val data = mutableMapOf<String, Any>("type" to type, "updatedAt" to FieldValue.serverTimestamp())
        createdBy?.let { data["createdBy"] = it }
        val cleaned = participants.filter { it.isNotBlank() }.distinct()
        if (cleaned.isNotEmpty()) data["participants"] = FieldValue.arrayUnion(*cleaned.toTypedArray())
        db!!.collection("chats").document(conversationId).set(data, SetOptions.merge()).awaitResult()
        AppResult.Success(Unit)
    }

    // ── messages ──────────────────────────────────────────────────────────────

    /**
     * Writes a message under its [MessageDraft.clientMessageId]. Returns the doc
     * id (the client message id) so the caller can reconcile its optimistic row.
     */
    suspend fun sendMessage(draft: MessageDraft): AppResult<String> = guard {
        val data = mutableMapOf<String, Any?>(
            "senderId" to draft.senderId,
            "type" to draft.type,
            "clientMessageId" to draft.clientMessageId,
            "serverTs" to FieldValue.serverTimestamp(),
            "clientTs" to System.currentTimeMillis(),
            "status" to "sent",
        )
        draft.text?.let { data["text"] = it }
        draft.replyToId?.let { data["replyToId"] = it }
        draft.forwardedFrom?.let { data["forwardedFrom"] = it }
        if (draft.attachments.isNotEmpty()) data["attachments"] = draft.attachments
        messages(draft.conversationId).document(draft.clientMessageId).set(data).awaitResult()
        // Keep the conversation preview fresh for the Chats list (participant-writable fields only).
        db!!.collection("chats").document(draft.conversationId).set(
            mapOf(
                "lastMessageAt" to FieldValue.serverTimestamp(),
                "lastMessagePreview" to (draft.text ?: "").take(140),
                "lastMessageSenderId" to draft.senderId,
                "updatedAt" to FieldValue.serverTimestamp(),
            ),
            SetOptions.merge(),
        ).awaitResult()
        AppResult.Success(draft.clientMessageId)
    }

    /** Author-only edit (rules enforce `resource.data.senderId == myId()`). */
    suspend fun editMessage(conversationId: String, messageId: String, text: String): AppResult<Unit> = guard {
        messages(conversationId).document(messageId).set(
            mapOf("text" to text, "editedAt" to FieldValue.serverTimestamp()),
            SetOptions.merge(),
        ).awaitResult()
        AppResult.Success(Unit)
    }

    /** Author-only soft delete; the body is cleared and a tombstone timestamp set. */
    suspend fun deleteMessage(conversationId: String, messageId: String): AppResult<Unit> = guard {
        messages(conversationId).document(messageId).set(
            mapOf(
                "text" to null,
                "deletedAt" to FieldValue.serverTimestamp(),
                "attachments" to emptyList<Map<String, Any?>>(),
            ),
            SetOptions.merge(),
        ).awaitResult()
        AppResult.Success(Unit)
    }

    /**
     * Streams messages in a conversation ordered by server time. The listener is
     * removed when the collector cancels, so a screen leaving the chat stops all
     * reads immediately.
     */
    fun observeMessages(conversationId: String, limit: Long = 200): Flow<List<ChatMessage>> = callbackFlow {
        if (!enabled) { close(); return@callbackFlow }
        val registration: ListenerRegistration = messages(conversationId)
            .orderBy("serverTs", Query.Direction.ASCENDING)
            .limit(limit)
            .addSnapshotListener { snapshot, error ->
                if (error != null) { close(error); return@addSnapshotListener }
                val list = snapshot?.documents.orEmpty().mapNotNull { it.toChatMessage(conversationId) }
                trySend(list)
            }
        awaitClose { registration.remove() }
    }

    // ── typing / presence ─────────────────────────────────────────────────────

    suspend fun setTyping(conversationId: String, userId: String, isTyping: Boolean): AppResult<Unit> = guard {
        db!!.collection("chats").document(conversationId).collection("typing").document(userId).set(
            mapOf("isTyping" to isTyping, "updatedAt" to System.currentTimeMillis()),
            SetOptions.merge(),
        ).awaitResult()
        AppResult.Success(Unit)
    }

    /**
     * Publishes presence to RTDB `presence/{uid}` with the schema the deployed
     * `database.rules.json` validates (`state` + `lastChanged`).
     */
    suspend fun setPresence(userId: String, online: Boolean): AppResult<Unit> = guard {
        val database = environment.database
            ?: return@guard AppResult.Failure(AppError.Unknown("Realtime Database unavailable."))
        database.getReference("presence").child(userId).updateChildren(
            mapOf("state" to if (online) "online" else "offline", "lastChanged" to System.currentTimeMillis()),
        ).awaitResult()
        AppResult.Success(Unit)
    }

    // ── receipts / reactions ──────────────────────────────────────────────────

    /** Marks a message read by [userId] (doc id == recipient, per the rules). */
    suspend fun markRead(conversationId: String, messageId: String, userId: String): AppResult<Unit> = guard {
        messages(conversationId).document(messageId).collection("receipts").document(userId).set(
            mapOf("state" to "read", "at" to FieldValue.serverTimestamp()),
            SetOptions.merge(),
        ).awaitResult()
        // Advance the member read cursor (self-service field).
        db!!.collection("chats").document(conversationId).collection("members").document(userId).set(
            mapOf(
                "lastReadMessageId" to messageId,
                "lastReadAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp(),
            ),
            SetOptions.merge(),
        ).awaitResult()
        AppResult.Success(Unit)
    }

    suspend fun addReaction(conversationId: String, messageId: String, userId: String, emoji: String): AppResult<Unit> = guard {
        messages(conversationId).document(messageId).collection("reactions").document(userId).set(
            mapOf("emoji" to emoji, "at" to FieldValue.serverTimestamp()),
        ).awaitResult()
        AppResult.Success(Unit)
    }

    suspend fun removeReaction(conversationId: String, messageId: String, userId: String): AppResult<Unit> = guard {
        messages(conversationId).document(messageId).collection("reactions").document(userId).delete().awaitResult()
        AppResult.Success(Unit)
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private inline fun <T> guard(block: () -> AppResult<T>): AppResult<T> {
        if (!enabled) return AppResult.Failure(AppError.Unknown("Firebase transport is disabled."))
        return try {
            block()
        } catch (t: Throwable) {
            if (t is kotlinx.coroutines.CancellationException) throw t
            AppResult.Failure(mapFirestoreError(t))
        }
    }

    private fun mapFirestoreError(t: Throwable): AppError = when {
        t is com.google.firebase.firestore.FirebaseFirestoreException &&
            t.code == com.google.firebase.firestore.FirebaseFirestoreException.Code.PERMISSION_DENIED ->
            AppError.Forbidden("You do not have access to this conversation.")
        t is com.google.firebase.firestore.FirebaseFirestoreException &&
            t.code == com.google.firebase.firestore.FirebaseFirestoreException.Code.UNAVAILABLE ->
            AppError.Network("Firestore is unreachable right now.", t)
        else -> AppError.Unknown(t.message, t)
    }

    private fun com.google.firebase.firestore.DocumentSnapshot.toChatMessage(conversationId: String): ChatMessage? {
        val senderId = getString("senderId") ?: return null
        @Suppress("UNCHECKED_CAST")
        val attachments = (get("attachments") as? List<Map<String, Any?>>).orEmpty()
        return ChatMessage(
            id = id,
            conversationId = conversationId,
            senderId = senderId,
            type = getString("type") ?: "text",
            text = getString("text"),
            clientMessageId = getString("clientMessageId"),
            serverTs = getTimestamp("serverTs")?.toDate()?.time,
            clientTs = getLong("clientTs"),
            replyToId = getString("replyToId"),
            forwardedFrom = getString("forwardedFrom"),
            status = getString("status"),
            editedAt = getTimestamp("editedAt")?.toDate()?.time,
            deletedAt = getTimestamp("deletedAt")?.toDate()?.time,
            attachments = attachments,
        )
    }
}
