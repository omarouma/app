package app.gagachat.core.firebase

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.SetOptions
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Best-effort mirror of the Supabase chat state into Firebase
 * (Firestore for messages/typing, RTDB for presence).
 *
 * Every method is guarded by [enabled] and swallows its own errors: a failed
 * mirror must never block or fail the authoritative Supabase send path.
 */
@Singleton
class FirestoreChatMirror @Inject constructor(
    private val environment: FirebaseEnvironment,
    private val config: FirebaseTransportConfig,
) {
    val enabled: Boolean get() = config.enabled && environment.isConfigured

    /** Transport-neutral snapshot of a message for the Firestore mirror. */
    data class MirrorMessage(
        val messageId: String,
        val conversationId: String,
        val senderId: String,
        val type: String,
        val text: String?,
        val createdAt: Long,
    )

    /**
     * Creates (or merges into) the `chats/{conversationId}` document. Uses
     * `arrayUnion` so the participant set only ever grows and never shrinks.
     */
    suspend fun ensureChat(conversationId: String, participants: List<String>, type: String) {
        if (!enabled) return
        val db = environment.firestore ?: return
        runCatching {
            val data = mutableMapOf<String, Any>(
                "type" to type,
                "updatedAt" to FieldValue.serverTimestamp(),
            )
            val cleaned = participants.filter { it.isNotBlank() }.distinct()
            if (cleaned.isNotEmpty()) {
                data["participants"] = FieldValue.arrayUnion(*cleaned.toTypedArray())
            }
            db.collection("chats").document(conversationId)
                .set(data, SetOptions.merge())
                .awaitResult()
        }
    }

    /** Mirrors a single message into `chats/{conversationId}/messages/{messageId}`. */
    suspend fun mirrorMessage(message: MirrorMessage) {
        if (!enabled) return
        val db = environment.firestore ?: return
        runCatching {
            val data = mutableMapOf<String, Any>(
                "senderId" to message.senderId,
                "type" to message.type,
                "createdAt" to message.createdAt,
            )
            message.text?.let { data["text"] = it }
            db.collection("chats").document(message.conversationId)
                .collection("messages").document(message.messageId)
                .set(data, SetOptions.merge())
                .awaitResult()
        }
    }

    /** Mirrors the ephemeral typing indicator into `chats/{conversationId}/typing/{uid}`. */
    suspend fun mirrorTyping(conversationId: String, userId: String, isTyping: Boolean) {
        if (!enabled) return
        val db = environment.firestore ?: return
        runCatching {
            db.collection("chats").document(conversationId)
                .collection("typing").document(userId)
                .set(
                    mapOf("isTyping" to isTyping, "updatedAt" to System.currentTimeMillis()),
                    SetOptions.merge(),
                )
                .awaitResult()
        }
    }

    /**
     * Mirrors presence into RTDB `presence/{uid}`. The schema (`state` +
     * `lastChanged`) matches the deployed `database.rules.json` validation.
     */
    suspend fun mirrorPresence(userId: String, online: Boolean) {
        if (!enabled) return
        val db = environment.database ?: return
        runCatching {
            db.getReference("presence").child(userId)
                .updateChildren(
                    mapOf(
                        "state" to if (online) "online" else "offline",
                        "lastChanged" to System.currentTimeMillis(),
                    ),
                )
                .awaitResult()
        }
    }
}
