package app.gagachat.core.firebase

import com.google.firebase.database.ServerValue
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
     * Creates the Firebase chat mirror once, then refreshes only its derived
     * timestamp. Membership/type remain authoritative in Supabase and therefore
     * are never expanded by a client-side mirror write after creation.
     */
    suspend fun ensureChat(conversationId: String, participants: List<String>, type: String) {
        if (!enabled) return
        val db = environment.firestore ?: return
        runCatching {
            val ref = db.collection("chats").document(conversationId)
            val snapshot = ref.get().awaitResult()
            if (!snapshot.exists()) {
                val cleaned = participants.filter { it.isNotBlank() }.distinct()
                if (cleaned.isEmpty()) return@runCatching
                ref.set(
                    mapOf(
                        "type" to type,
                        "participants" to cleaned,
                        "updatedAt" to FieldValue.serverTimestamp(),
                    ),
                ).awaitResult()
            } else {
                ref.set(
                    mapOf("updatedAt" to FieldValue.serverTimestamp()),
                    SetOptions.merge(),
                ).awaitResult()
            }
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
        if (!enabled || userId.isBlank()) return
        val db = environment.database ?: return
        runCatching {
            val ref = db.getReference("presence").child(userId)
            if (online) {
                // If the process/network disappears without a clean sign-out,
                // RTDB marks the user offline server-side instead of leaving a
                // permanent stale "online" record.
                ref.onDisconnect().setValue(
                    mapOf(
                        "state" to "offline",
                        "lastChanged" to ServerValue.TIMESTAMP,
                    ),
                ).awaitResult()
            }
            ref.setValue(
                mapOf(
                    "state" to if (online) "online" else "offline",
                    "lastChanged" to ServerValue.TIMESTAMP,
                ),
            ).awaitResult()
        }
    }
}
