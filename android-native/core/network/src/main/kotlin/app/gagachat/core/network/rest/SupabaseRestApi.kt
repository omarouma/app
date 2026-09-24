package app.gagachat.core.network.rest

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.dto.BlockRow
import app.gagachat.core.network.dto.CallSessionRow
import app.gagachat.core.network.dto.ConversationMemberRow
import app.gagachat.core.network.dto.ConversationRow
import app.gagachat.core.network.dto.DeviceRow
import app.gagachat.core.network.dto.MessageInsert
import app.gagachat.core.network.dto.MessageReceiptRow
import app.gagachat.core.network.dto.MessageRow
import app.gagachat.core.network.dto.UserRow
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import javax.inject.Inject
import javax.inject.Singleton

/**
 * PostgREST access to Supabase tables (PDF §7). All calls are authenticated and
 * rely on backend RLS for authorization (PDF §11).
 */
@Singleton
class SupabaseRestApi @Inject constructor(
    private val client: HttpClient,
    private val config: SupabaseConfig,
    private val sessionStore: SessionStore,
) {

    private fun io.ktor.client.request.HttpRequestBuilder.auth() {
        header("apikey", config.anonKey)
        sessionStore.accessToken()?.let { header("Authorization", "Bearer $it") }
    }

    // ---- Users ----

    suspend fun getUsers(ids: List<String>): List<UserRow> {
        if (ids.isEmpty()) return emptyList()
        return client.get("${config.restUrl}/users") {
            auth()
            parameter("select", "*")
            parameter("id", "in.(${ids.joinToString(",")})")
        }.body()
    }

    suspend fun getUser(id: String): UserRow? = client.get("${config.restUrl}/users") {
        auth()
        parameter("select", "*")
        parameter("id", "eq.$id")
        parameter("limit", 1)
    }.body<List<UserRow>>().firstOrNull()

    suspend fun searchUsers(query: String, limit: Int = 30): List<UserRow> =
        client.get("${config.restUrl}/users") {
            auth()
            parameter("select", "*")
            parameter("or", "(display_name.ilike.*$query*,username.ilike.*$query*)")
            parameter("limit", limit)
        }.body()

    suspend fun upsertUser(row: UserRow) {
        client.post("${config.restUrl}/users") {
            auth()
            header("Prefer", "resolution=merge-duplicates,return=minimal")
            contentType(ContentType.Application.Json)
            setBody(row)
        }
    }

    // ---- Conversations ----

    suspend fun getConversations(limit: Int, offset: Int): List<ConversationRow> =
        client.get("${config.restUrl}/conversations") {
            auth()
            parameter("select", "*")
            parameter("order", "updated_at.desc")
            parameter("limit", limit)
            parameter("offset", offset)
        }.body()

    suspend fun getConversationsUpdatedSince(since: Long, limit: Int): List<ConversationRow> =
        client.get("${config.restUrl}/conversations") {
            auth()
            parameter("select", "*")
            parameter("updated_at", "gt.$since")
            parameter("order", "updated_at.desc")
            parameter("limit", limit)
        }.body()

    suspend fun getConversationMembers(conversationIds: List<String>): List<ConversationMemberRow> {
        if (conversationIds.isEmpty()) return emptyList()
        return client.get("${config.restUrl}/conversation_members") {
            auth()
            parameter("select", "*")
            parameter("conversation_id", "in.(${conversationIds.joinToString(",")})")
        }.body()
    }

    // ---- Messages ----

    suspend fun getMessages(
        conversationId: String,
        limit: Int,
        beforeTimestamp: Long? = null,
    ): List<MessageRow> = client.get("${config.restUrl}/messages") {
        auth()
        parameter("select", "*")
        parameter("conversation_id", "eq.$conversationId")
        beforeTimestamp?.let { parameter("created_at", "lt.$it") }
        parameter("order", "created_at.desc")
        parameter("limit", limit)
    }.body()

    suspend fun getMessagesSince(conversationId: String, since: Long, limit: Int): List<MessageRow> =
        client.get("${config.restUrl}/messages") {
            auth()
            parameter("select", "*")
            parameter("conversation_id", "eq.$conversationId")
            parameter("created_at", "gt.$since")
            parameter("order", "created_at.asc")
            parameter("limit", limit)
        }.body()

    /**
     * Idempotent insert. `on_conflict=client_message_id` + merge-duplicates means a
     * retried send returns the existing row instead of creating a duplicate
     * (PDF §5.2).
     */
    suspend fun insertMessage(payload: MessageInsert): MessageRow =
        client.post("${config.restUrl}/messages") {
            auth()
            parameter("on_conflict", "client_message_id")
            header("Prefer", "resolution=merge-duplicates,return=representation")
            contentType(ContentType.Application.Json)
            setBody(payload)
        }.body<List<MessageRow>>().first()

    suspend fun updateMessageText(id: String, text: String, editedAt: Long) {
        client.patch("${config.restUrl}/messages") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(mapOf("text" to text, "edited_at" to editedAt))
        }
    }

    suspend fun deleteMessage(id: String, deletedAt: Long) {
        client.patch("${config.restUrl}/messages") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(mapOf("deleted_at" to deletedAt, "text" to null))
        }
    }

    // ---- Receipts ----

    suspend fun upsertReceipt(row: MessageReceiptRow) {
        client.post("${config.restUrl}/message_receipts") {
            auth()
            header("Prefer", "resolution=merge-duplicates,return=minimal")
            contentType(ContentType.Application.Json)
            setBody(row)
        }
    }

    suspend fun getReceipts(messageIds: List<String>): List<MessageReceiptRow> {
        if (messageIds.isEmpty()) return emptyList()
        return client.get("${config.restUrl}/message_receipts") {
            auth()
            parameter("select", "*")
            parameter("message_id", "in.(${messageIds.joinToString(",")})")
        }.body()
    }

    // ---- Calls ----

    suspend fun insertCallSession(row: CallSessionRow): CallSessionRow =
        client.post("${config.restUrl}/call_sessions") {
            auth()
            header("Prefer", "return=representation")
            contentType(ContentType.Application.Json)
            setBody(row)
        }.body<List<CallSessionRow>>().first()

    suspend fun updateCallSession(id: String, status: String, endedAt: Long) {
        client.patch("${config.restUrl}/call_sessions") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(mapOf("status" to status, "ended_at" to endedAt))
        }
    }

    suspend fun getCallHistory(limit: Int): List<CallSessionRow> =
        client.get("${config.restUrl}/call_sessions") {
            auth()
            parameter("select", "*")
            parameter("order", "started_at.desc")
            parameter("limit", limit)
        }.body()

    // ---- Devices ----

    suspend fun upsertDevice(row: DeviceRow) {
        client.post("${config.restUrl}/devices") {
            auth()
            parameter("on_conflict", "user_id,device_id")
            header("Prefer", "resolution=merge-duplicates,return=minimal")
            contentType(ContentType.Application.Json)
            setBody(row)
        }
    }

    // ---- Blocks ----

    suspend fun getBlocks(ownerId: String): List<BlockRow> =
        client.get("${config.restUrl}/blocks") {
            auth()
            parameter("select", "*")
            parameter("owner_id", "eq.$ownerId")
        }.body()

    suspend fun upsertBlock(row: BlockRow) {
        client.post("${config.restUrl}/blocks") {
            auth()
            parameter("on_conflict", "owner_id,target_id")
            header("Prefer", "resolution=merge-duplicates,return=minimal")
            contentType(ContentType.Application.Json)
            setBody(row)
        }
    }

    suspend fun deleteBlock(ownerId: String, targetId: String) {
        client.delete("${config.restUrl}/blocks") {
            auth()
            parameter("owner_id", "eq.$ownerId")
            parameter("target_id", "eq.$targetId")
        }
    }
}
