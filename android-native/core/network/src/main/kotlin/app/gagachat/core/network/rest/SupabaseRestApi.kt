package app.gagachat.core.network.rest

import app.gagachat.core.model.CoinActivity
import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.dto.BlockRow
import app.gagachat.core.network.dto.CallHistoryRow
import app.gagachat.core.network.dto.CreateCallResponse
import app.gagachat.core.network.dto.ChatReadRow
import app.gagachat.core.network.dto.ConversationInsert
import app.gagachat.core.network.dto.ConversationRow
import app.gagachat.core.network.dto.DeviceRow
import app.gagachat.core.network.dto.FriendRequestInsert
import app.gagachat.core.network.dto.FriendRequestRow
import app.gagachat.core.network.dto.FriendshipInsert
import app.gagachat.core.network.dto.FriendshipRow
import app.gagachat.core.network.dto.GroupInsert
import app.gagachat.core.network.dto.GroupMemberInsert
import app.gagachat.core.network.dto.GroupMemberRow
import app.gagachat.core.network.dto.GroupRow
import app.gagachat.core.network.dto.MessageInsert
import app.gagachat.core.network.dto.MessageRow
import app.gagachat.core.network.dto.NotificationRow
import app.gagachat.core.network.dto.SavedMessageInsert
import app.gagachat.core.network.dto.SavedMessageRow
import app.gagachat.core.network.dto.UserRow
import app.gagachat.core.network.dto.WalletInsert
import app.gagachat.core.network.dto.WalletRow
import app.gagachat.core.network.dto.ZegoTokenResponse
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * PostgREST access to the LIVE Supabase tables. All calls are authenticated and
 * rely on backend RLS for authorization.
 *
 * Timestamps are passed as ISO-8601 strings (PostgREST timestamptz format).
 */
@Singleton
class SupabaseRestApi @Inject constructor(
    private val client: HttpClient,
    private val config: SupabaseConfig,
    private val sessionStore: SessionStore,
) {

    private fun HttpRequestBuilder.auth() {
        header("apikey", config.anonKey)
        sessionStore.accessToken()?.let { header("Authorization", "Bearer $it") }
    }

    private fun iso(epochMillis: Long): String = Instant.ofEpochMilli(epochMillis).toString()

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

    suspend fun searchUsers(query: String, limit: Int = 30): List<UserRow> {
        val q = query.trim()
        if (q.isEmpty()) return emptyList()
        return client.get("${config.restUrl}/users") {
            auth()
            parameter("select", "*")
            parameter(
                "or",
                "(display_name.ilike.*$q*,username.ilike.*$q*,name.ilike.*$q*)",
            )
            parameter("limit", limit)
        }.body()
    }

    suspend fun upsertUser(row: UserRow) {
        client.post("${config.restUrl}/users") {
            auth()
            parameter("on_conflict", "id")
            header("Prefer", "resolution=merge-duplicates,return=minimal")
            contentType(ContentType.Application.Json)
            setBody(row)
        }
    }

    /**
     * Pre-flight check for the profile-setup screen: returns true when [username]
     * is free to claim. The current user is excluded so re-saving your own handle
     * is never reported as a conflict. The backend still enforces the unique
     * constraint (`users_username_key`) as the source of truth.
     */
    suspend fun isUsernameAvailable(username: String): Boolean {
        val handle = username.trim().lowercase()
        if (handle.isEmpty()) return false
        val selfId = sessionStore.userId()
        val rows: List<UserRow> = client.get("${config.restUrl}/users") {
            auth()
            parameter("select", "id")
            parameter("username", "eq.$handle")
            parameter("limit", "1")
        }.body()
        return rows.none { it.id != selfId }
    }

    // ---- Chats (conversations) ----

    suspend fun getConversations(limit: Int, offset: Int): List<ConversationRow> =
        client.get("${config.restUrl}/chats") {
            auth()
            parameter("select", "*")
            parameter("order", "updated_at.desc")
            parameter("limit", limit)
            parameter("offset", offset)
        }.body()

    suspend fun getConversationsUpdatedSince(since: Long, limit: Int): List<ConversationRow> =
        client.get("${config.restUrl}/chats") {
            auth()
            parameter("select", "*")
            parameter("updated_at", "gt.${iso(since)}")
            parameter("order", "updated_at.desc")
            parameter("limit", limit)
        }.body()

    suspend fun getConversation(id: String): ConversationRow? =
        client.get("${config.restUrl}/chats") {
            auth()
            parameter("select", "*")
            parameter("id", "eq.$id")
            parameter("limit", 1)
        }.body<List<ConversationRow>>().firstOrNull()

    /** Find an existing direct chat containing exactly these two members. */
    suspend fun findDirectConversation(userA: String, userB: String): ConversationRow? =
        client.get("${config.restUrl}/chats") {
            auth()
            parameter("select", "*")
            parameter("type", "eq.direct")
            parameter("participants", "cs.{$userA,$userB}")
            parameter("limit", 1)
        }.body<List<ConversationRow>>().firstOrNull()

    suspend fun insertConversation(row: ConversationInsert): ConversationRow =
        client.post("${config.restUrl}/chats") {
            auth()
            header("Prefer", "return=representation")
            contentType(ContentType.Application.Json)
            setBody(row)
        }.body<List<ConversationRow>>().first()

    suspend fun updateConversationFlags(
        id: String,
        pinned: Boolean? = null,
        muted: Boolean? = null,
        archived: Boolean? = null,
        unreadCount: Int? = null,
    ) {
        val body = buildMap<String, Any> {
            pinned?.let { put("pinned", it) }
            muted?.let { put("is_muted", it) }
            archived?.let { put("archived", it) }
            unreadCount?.let { put("unread_count", it) }
        }
        if (body.isEmpty()) return
        client.patch("${config.restUrl}/chats") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
    }

    /** Update a conversation's display metadata (title/avatar/description). */
    suspend fun updateConversationMeta(
        id: String,
        title: String? = null,
        avatar: String? = null,
        description: String? = null,
    ) {
        val body = buildMap<String, Any> {
            title?.let { put("name", it) }
            avatar?.let { put("avatar", it) }
            description?.let { put("description", it) }
        }
        if (body.isEmpty()) return
        client.patch("${config.restUrl}/chats") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
    }

    /** Delete a conversation (chats table) by id. */
    suspend fun deleteConversation(id: String) {
        client.delete("${config.restUrl}/chats") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
        }
    }

    // ---- Messages ----

    suspend fun getMessages(
        conversationId: String,
        limit: Int,
        beforeTimestamp: Long? = null,
    ): List<MessageRow> = client.get("${config.restUrl}/messages") {
        auth()
        parameter("select", "*")
        parameter("chat_id", "eq.$conversationId")
        beforeTimestamp?.let { parameter("created_at", "lt.${iso(it)}") }
        parameter("order", "created_at.desc")
        parameter("limit", limit)
    }.body()

    suspend fun getMessagesSince(conversationId: String, since: Long, limit: Int): List<MessageRow> =
        client.get("${config.restUrl}/messages") {
            auth()
            parameter("select", "*")
            parameter("chat_id", "eq.$conversationId")
            parameter("created_at", "gt.${iso(since)}")
            parameter("order", "created_at.asc")
            parameter("limit", limit)
        }.body()

    suspend fun getMessageByLocalId(localId: String): MessageRow? =
        client.get("${config.restUrl}/messages") {
            auth()
            parameter("select", "*")
            parameter("local_id", "eq.$localId")
            parameter("limit", 1)
        }.body<List<MessageRow>>().firstOrNull()

    /**
     * Idempotent insert. PostgREST cannot target the partial unique index on
     * `local_id`, so we first check for an existing row and return it if present.
     */
    suspend fun insertMessage(payload: MessageInsert): MessageRow {
        getMessageByLocalId(payload.clientMessageId)?.let { return it }
        return client.post("${config.restUrl}/messages") {
            auth()
            header("Prefer", "return=representation")
            contentType(ContentType.Application.Json)
            setBody(payload)
        }.body<List<MessageRow>>().first()
    }

    suspend fun updateMessageText(id: String, text: String) {
        client.patch("${config.restUrl}/messages") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(mapOf("content" to text, "edited" to true))
        }
    }

    suspend fun deleteMessage(id: String) {
        client.patch("${config.restUrl}/messages") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(mapOf("content" to null, "destroyed" to true, "media_url" to null))
        }
    }

    suspend fun updateMessageDelivery(id: String, status: String, deliveredAt: Long?, readAt: Long?) {
        val body = buildMap<String, Any?> {
            put("delivery_status", status)
            deliveredAt?.let { put("delivered_at", iso(it)) }
            readAt?.let { put("read_at", iso(it)) }
        }
        client.patch("${config.restUrl}/messages") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
    }

    /**
     * Lightweight presence write: patches only the live-status columns on the
     * `users` row (never touches the rest of the profile) so peers can render
     * online/last-seen without a full upsert clobbering unrelated fields.
     */
    suspend fun updateUserPresence(userId: String, isOnline: Boolean, lastSeen: Long) {
        client.patch("${config.restUrl}/users") {
            auth()
            parameter("id", "eq.$userId")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(
                mapOf(
                    "status" to if (isOnline) "online" else "offline",
                    "last_seen" to iso(lastSeen),
                ),
            )
        }
    }

    suspend fun updateMessageReactions(id: String, reactions: JsonObject) {
        client.patch("${config.restUrl}/messages") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(mapOf("reactions" to reactions))
        }
    }

    // ---- Chat reads ----

    suspend fun upsertChatRead(row: ChatReadRow) {
        client.post("${config.restUrl}/chat_reads") {
            auth()
            parameter("on_conflict", "chat_id,user_id")
            header("Prefer", "resolution=merge-duplicates,return=minimal")
            contentType(ContentType.Application.Json)
            setBody(row)
        }
    }

    suspend fun getChatReads(chatIds: List<String>): List<ChatReadRow> {
        if (chatIds.isEmpty()) return emptyList()
        return client.get("${config.restUrl}/chat_reads") {
            auth()
            parameter("select", "*")
            parameter("chat_id", "in.(${chatIds.joinToString(",")})")
        }.body()
    }

    // ---- Calls ----

    /**
     * Creates a call through the authenticated server boundary. The Edge Function
     * validates the caller, conversation membership, block state and busy state,
     * then returns the canonical call/room ids used throughout the app.
     */
    suspend fun createCall(
        conversationId: String,
        calleeId: String,
        type: String,
    ): CreateCallResponse = client.post("${config.functionsUrl}/create-call") {
        auth()
        contentType(ContentType.Application.Json)
        setBody(
            mapOf(
                "chat_id" to conversationId,
                "callee_id" to calleeId,
                "type" to type,
            ),
        )
    }.body()

    /**
     * Requests a short-lived ZIM identity token for the signed-in user.
     * The server cryptographically verifies the Supabase session and never
     * exposes the ZEGO ServerSecret to the Android client.
     */
    suspend fun getZegoZimToken(userId: String, userName: String): ZegoTokenResponse =
        client.get("${config.functionsUrl}/zego-token") {
            auth()
            parameter("type", "zim")
            parameter("user", userId.filter { it.isLetterOrDigit() || it == '_' }.take(64))
            parameter("name", userName.take(80))
        }.body()

    suspend fun insertCallHistory(row: CallHistoryRow): CallHistoryRow =
        client.post("${config.restUrl}/call_history") {
            auth()
            header("Prefer", "return=representation")
            contentType(ContentType.Application.Json)
            setBody(row)
        }.body<List<CallHistoryRow>>().first()

    suspend fun updateCallHistory(
        id: String,
        status: String,
        endedAt: Long,
        duration: Long?,
    ) {
        client.patch("${config.restUrl}/call_history") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(
                buildMap<String, Any> {
                    put("status", status)
                    put("ended_at", iso(endedAt))
                    // `call_history.duration` is stored in seconds.
                    duration?.let { put("duration", (it / 1_000L).coerceAtLeast(0L)) }
                },
            )
        }
    }

    suspend fun getCallHistory(limit: Int): List<CallHistoryRow> =
        client.get("${config.restUrl}/call_history") {
            auth()
            parameter("select", "*")
            parameter("order", "started_at.desc.nullslast,created_at.desc")
            parameter("limit", limit)
        }.body()

    // ---- Devices ----

    /**
     * Registers/refreshes this install's push token in the LIVE `user_devices`
     * table. There is no server-side unique constraint on (user_id, device_id),
     * so we look the row up first and PATCH when it already exists, otherwise
     * INSERT. Safe to call repeatedly (e.g. on every FCM token refresh).
     */
    suspend fun upsertDevice(row: DeviceRow) {
        val existing = client.get("${config.restUrl}/user_devices") {
            auth()
            parameter("select", "id")
            parameter("user_id", "eq.${row.userId}")
            parameter("device_id", "eq.${row.deviceId}")
            parameter("limit", 1)
        }.body<List<JsonObject>>().firstOrNull()
        if (existing != null) {
            client.patch("${config.restUrl}/user_devices") {
                auth()
                parameter("user_id", "eq.${row.userId}")
                parameter("device_id", "eq.${row.deviceId}")
                header("Prefer", "return=minimal")
                contentType(ContentType.Application.Json)
                setBody(row)
            }
        } else {
            client.post("${config.restUrl}/user_devices") {
                auth()
                header("Prefer", "return=minimal")
                contentType(ContentType.Application.Json)
                setBody(row)
            }
        }
    }

    // ---- Blocks ----

    suspend fun getBlocks(ownerId: String): List<BlockRow> =
        client.get("${config.restUrl}/blocked_users") {
            auth()
            parameter("select", "*")
            parameter("blocker_id", "eq.$ownerId")
        }.body()

    suspend fun upsertBlock(row: BlockRow) {
        client.post("${config.restUrl}/blocked_users") {
            auth()
            parameter("on_conflict", "blocker_id,blocked_id")
            header("Prefer", "resolution=merge-duplicates,return=minimal")
            contentType(ContentType.Application.Json)
            setBody(row)
        }
    }

    suspend fun deleteBlock(ownerId: String, targetId: String) {
        client.delete("${config.restUrl}/blocked_users") {
            auth()
            parameter("blocker_id", "eq.$ownerId")
            parameter("blocked_id", "eq.$targetId")
        }
    }

    // ---- Friendships ----

    suspend fun getFriendships(userId: String): List<FriendshipRow> =
        client.get("${config.restUrl}/friendships") {
            auth()
            parameter("select", "*")
            parameter("user_id", "eq.$userId")
        }.body()

    suspend fun insertFriendship(row: FriendshipInsert) {
        client.post("${config.restUrl}/friendships") {
            auth()
            // friendships has UNIQUE(user_id, friend_id); ignore duplicates so
            // accepting a request twice (or re-adding) is idempotent, not a 409.
            parameter("on_conflict", "user_id,friend_id")
            header("Prefer", "resolution=ignore-duplicates,return=minimal")
            contentType(ContentType.Application.Json)
            setBody(row)
        }
    }

    suspend fun deleteFriendship(userId: String, friendId: String) {
        client.delete("${config.restUrl}/friendships") {
            auth()
            parameter("user_id", "eq.$userId")
            parameter("friend_id", "eq.$friendId")
        }
    }

    // ---- Friend requests ----

    suspend fun getFriendRequests(userId: String): List<FriendRequestRow> =
        client.get("${config.restUrl}/friend_requests") {
            auth()
            parameter("select", "*")
            parameter("or", "(from_user_id.eq.$userId,to_user_id.eq.$userId)")
            parameter("order", "created_at.desc")
        }.body()

    suspend fun insertFriendRequest(row: FriendRequestInsert): FriendRequestRow =
        client.post("${config.restUrl}/friend_requests") {
            auth()
            header("Prefer", "return=representation")
            contentType(ContentType.Application.Json)
            setBody(row)
        }.body<List<FriendRequestRow>>().first()

    suspend fun updateFriendRequestStatus(id: String, status: String) {
        client.patch("${config.restUrl}/friend_requests") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(mapOf("status" to status))
        }
    }

    // ---- Wallet ----

    suspend fun getWallet(userId: String): WalletRow? =
        client.get("${config.restUrl}/wallets") {
            auth()
            parameter("select", "*")
            parameter("user_id", "eq.$userId")
            parameter("limit", 1)
        }.body<List<WalletRow>>().firstOrNull()

    suspend fun upsertWallet(row: WalletInsert): WalletRow =
        client.post("${config.restUrl}/wallets") {
            auth()
            parameter("on_conflict", "user_id")
            header("Prefer", "resolution=merge-duplicates,return=representation")
            contentType(ContentType.Application.Json)
            setBody(row)
        }.body<List<WalletRow>>().first()

    suspend fun updateWalletCoins(userId: String, coins: Long) {
        client.patch("${config.restUrl}/wallets") {
            auth()
            parameter("user_id", "eq.$userId")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(mapOf("coins" to coins))
        }
    }

    /** Persist the wallet ledger (jsonb `transactions` column) for [userId]. */
    suspend fun updateWalletTransactions(userId: String, transactions: List<CoinActivity>) {
        client.patch("${config.restUrl}/wallets") {
            auth()
            parameter("user_id", "eq.$userId")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(mapOf("transactions" to transactions))
        }
    }

    // ---- Groups ----

    suspend fun getGroupsForUser(userId: String): List<GroupRow> {
        val memberships = client.get("${config.restUrl}/group_members") {
            auth()
            parameter("select", "group_id")
            parameter("user_id", "eq.$userId")
        }.body<List<GroupMemberRow>>()
        val ids = memberships.map { it.groupId }.distinct()
        if (ids.isEmpty()) return emptyList()
        return client.get("${config.restUrl}/groups") {
            auth()
            parameter("select", "*")
            parameter("id", "in.(${ids.joinToString(",")})")
            parameter("order", "updated_at.desc")
        }.body()
    }

    suspend fun getGroup(id: String): GroupRow? =
        client.get("${config.restUrl}/groups") {
            auth()
            parameter("select", "*")
            parameter("id", "eq.$id")
            parameter("limit", 1)
        }.body<List<GroupRow>>().firstOrNull()

    suspend fun insertGroup(row: GroupInsert): GroupRow =
        client.post("${config.restUrl}/groups") {
            auth()
            header("Prefer", "return=representation")
            contentType(ContentType.Application.Json)
            setBody(row)
        }.body<List<GroupRow>>().first()

    suspend fun updateGroup(id: String, name: String?, description: String?, avatar: String?) {
        val body = buildMap<String, Any> {
            name?.let { put("name", it) }
            description?.let { put("description", it) }
            avatar?.let { put("avatar", it) }
        }
        if (body.isEmpty()) return
        client.patch("${config.restUrl}/groups") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
    }

    suspend fun deleteGroup(id: String) {
        client.delete("${config.restUrl}/groups") {
            auth()
            parameter("id", "eq.$id")
        }
    }

    suspend fun getGroupMembers(groupId: String): List<GroupMemberRow> =
        client.get("${config.restUrl}/group_members") {
            auth()
            parameter("select", "*")
            parameter("group_id", "eq.$groupId")
        }.body()

    suspend fun insertGroupMember(row: GroupMemberInsert) {
        client.post("${config.restUrl}/group_members") {
            auth()
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(row)
        }
    }

    suspend fun deleteGroupMember(groupId: String, userId: String) {
        client.delete("${config.restUrl}/group_members") {
            auth()
            parameter("group_id", "eq.$groupId")
            parameter("user_id", "eq.$userId")
        }
    }

    // ---- Notifications ----

    suspend fun getNotifications(userId: String, limit: Int = 50): List<NotificationRow> =
        client.get("${config.restUrl}/notifications") {
            auth()
            parameter("select", "*")
            parameter("user_id", "eq.$userId")
            parameter("order", "created_at.desc")
            parameter("limit", limit)
        }.body()

    suspend fun markNotificationRead(id: String) {
        client.patch("${config.restUrl}/notifications") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(mapOf("read" to true))
        }
    }

    // ---- Saved Messages ----

    suspend fun getSavedMessages(userId: String, limit: Int = 200): List<SavedMessageRow> =
        client.get("${config.restUrl}/saved_messages") {
            auth()
            parameter("select", "*")
            parameter("user_id", "eq.$userId")
            parameter("order", "saved_at.desc")
            parameter("limit", limit)
        }.body()

    suspend fun saveMessage(payload: SavedMessageInsert): SavedMessageRow =
        client.post("${config.restUrl}/saved_messages") {
            auth()
            header("Prefer", "return=representation")
            contentType(ContentType.Application.Json)
            setBody(payload)
        }.body()

    suspend fun deleteSavedMessage(id: String) {
        client.delete("${config.restUrl}/saved_messages") {
            auth()
            parameter("id", "eq.$id")
            header("Prefer", "return=minimal")
        }
    }

    // ---- Typing ----

    suspend fun upsertTyping(chatId: String, userId: String, isTyping: Boolean) {
        client.post("${config.restUrl}/typing") {
            auth()
            parameter("on_conflict", "chat_id,user_id")
            header("Prefer", "resolution=merge-duplicates,return=minimal")
            contentType(ContentType.Application.Json)
            setBody(
                mapOf(
                    "chat_id" to chatId,
                    "user_id" to userId,
                    "is_typing" to isTyping,
                    "updated_at" to iso(System.currentTimeMillis()),
                ),
            )
        }
    }

    // ---- Account ----

    /**
     * Permanently deletes the signed-in user's account and all owned data via the
     * `delete_my_account()` RPC (Play Store requirement). The server scopes the
     * deletion to `auth.uid()`, so this can only ever delete the caller.
     */
    suspend fun deleteMyAccount() {
        client.post("${config.restUrl}/rpc/delete_my_account") {
            auth()
            header("Prefer", "return=minimal")
            contentType(ContentType.Application.Json)
            setBody(emptyMap<String, String>())
        }
    }

    // ---- Presence ----

    suspend fun upsertPresence(userId: String, isOnline: Boolean) {
        client.post("${config.restUrl}/presence") {
            auth()
            parameter("on_conflict", "user_id")
            header("Prefer", "resolution=merge-duplicates,return=minimal")
            contentType(ContentType.Application.Json)
            setBody(
                mapOf(
                    "user_id" to userId,
                    "is_online" to isOnline,
                    "last_seen" to iso(System.currentTimeMillis()),
                    "updated_at" to iso(System.currentTimeMillis()),
                ),
            )
        }
    }
}
