package app.gagachat.core.network.rest

import app.gagachat.core.model.DailyRecord
import app.gagachat.core.model.ShoppingList
import app.gagachat.core.model.ShoppingItem
import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.serialization.json.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DailyLifeApi @Inject constructor(
    private val client: HttpClient,
    private val config: SupabaseConfig,
    private val session: SessionStore,
) {
    private fun HttpRequestBuilder.auth() {
        val token = requireNotNull(session.accessToken()) { "Please sign in again" }
        header("apikey", config.anonKey)
        header("Authorization", "Bearer $token")
        contentType(ContentType.Application.Json)
    }

    suspend fun records(): List<DailyRecord> {
        val result = mutableListOf<DailyRecord>()
        var offset = 0
        do {
            val page: List<DailyRecord> = client.get("${config.restUrl}/gaga_daily_records") {
                auth(); parameter("order", "happened_at.desc,id.desc")
                parameter("limit", 500); parameter("offset", offset)
            }.body()
            result.addAll(page); offset += page.size
        } while (page.size == 500)
        return result
    }

    suspend fun record(id: String): DailyRecord? = client.get("${config.restUrl}/gaga_daily_records") {
        auth(); parameter("id", "eq.$id"); parameter("limit", 1)
    }.body<List<DailyRecord>>().firstOrNull()

    suspend fun save(record: DailyRecord, editing: Boolean): DailyRecord {
        val json = buildJsonObject {
            put("title", record.title); put("amount_minor", record.amountMinor)
            put("currency", record.currency); put("category", record.category)
            put("account", record.account); put("note", record.note)
            put("happened_at", record.happenedAt)
            put("due_at", record.dueAt?.let(::JsonPrimitive) ?: JsonNull)
            put("completed", record.completed)
            if (!editing) {
                put("id", record.id); put("owner_id", record.ownerId); put("kind", record.kind)
                put("source_chat", record.sourceChat?.let(::JsonPrimitive) ?: JsonNull)
                put("source_message", record.sourceMessage?.let(::JsonPrimitive) ?: JsonNull)
            }
        }
        val rows: List<DailyRecord> = if (editing) client.patch("${config.restUrl}/gaga_daily_records") {
            auth(); parameter("id", "eq.${record.id}"); header("Prefer", "return=representation"); setBody(json)
        }.body() else client.post("${config.restUrl}/gaga_daily_records") {
            auth(); header("Prefer", "return=representation,resolution=ignore-duplicates"); setBody(json)
        }.body()
        return rows.singleOrNull() ?: requireNotNull(record(record.id))
    }

    suspend fun remove(id: String) {
        val rows: List<DailyRecord> = client.delete("${config.restUrl}/gaga_daily_records") {
            auth(); parameter("id", "eq.$id"); header("Prefer", "return=representation")
        }.body()
        check(rows.size == 1) { "Record no longer available" }
    }

    suspend fun contribute(id: String, amount: Long, operation: String) {
        client.post("${config.restUrl}/rpc/gaga_daily_contribute") {
            auth(); setBody(buildJsonObject { put("record_id", id); put("amount", amount); put("operation_id", operation) })
        }
    }

    suspend fun lists(): List<ShoppingList> = client.get("${config.restUrl}/gaga_shopping_lists") {
        auth(); parameter("order", "created_at.desc"); parameter("limit", 500)
    }.body()

    suspend fun createList(id: String, title: String): ShoppingList = client.post("${config.restUrl}/gaga_shopping_lists") {
        auth(); header("Prefer", "return=representation,resolution=ignore-duplicates")
        setBody(buildJsonObject { put("id", id); put("owner_id", requireNotNull(session.userId())); put("title", title) })
    }.body<List<ShoppingList>>().singleOrNull() ?: lists().first { it.id == id }

    suspend fun items(listId: String): List<ShoppingItem> = client.get("${config.restUrl}/gaga_shopping_items") {
        auth(); parameter("list_id", "eq.$listId"); parameter("order", "created_at.asc"); parameter("limit", 1000)
    }.body()

    suspend fun addItem(id: String, listId: String, name: String, quantity: String) {
        client.post("${config.restUrl}/gaga_shopping_items") {
            auth(); header("Prefer", "resolution=ignore-duplicates")
            setBody(buildJsonObject { put("id", id); put("list_id", listId); put("name", name); put("quantity", quantity) })
        }
    }

    suspend fun purchase(item: ShoppingItem) {
        val rows: List<ShoppingItem> = client.patch("${config.restUrl}/gaga_shopping_items") {
            auth(); parameter("id", "eq.${item.id}"); header("Prefer", "return=representation")
            setBody(buildJsonObject { put("purchased", !item.purchased) })
        }.body()
        check(rows.size == 1) { "You no longer have access to this list" }
    }

    suspend fun renameList(id: String, title: String) {
        val rows: List<ShoppingList> = client.patch("${config.restUrl}/gaga_shopping_lists") {
            auth(); parameter("id", "eq.$id"); header("Prefer", "return=representation")
            setBody(buildJsonObject { put("title", title) })
        }.body()
        check(rows.size == 1) { "Only the owner can rename this list" }
    }

    suspend fun removeList(id: String) {
        val rows: List<ShoppingList> = client.delete("${config.restUrl}/gaga_shopping_lists") {
            auth(); parameter("id", "eq.$id"); header("Prefer", "return=representation")
        }.body()
        check(rows.size == 1) { "Only the owner can delete this list" }
    }

    suspend fun editItem(item: ShoppingItem, name: String, quantity: String) {
        val rows: List<ShoppingItem> = client.patch("${config.restUrl}/gaga_shopping_items") {
            auth(); parameter("id", "eq.${item.id}"); header("Prefer", "return=representation")
            setBody(buildJsonObject { put("name", name); put("quantity", quantity) })
        }.body()
        check(rows.size == 1) { "You no longer have access to this item" }
    }

    suspend fun removeItem(item: ShoppingItem) {
        val rows: List<ShoppingItem> = client.delete("${config.restUrl}/gaga_shopping_items") {
            auth(); parameter("id", "eq.${item.id}"); header("Prefer", "return=representation")
        }.body()
        check(rows.size == 1) { "You no longer have access to this item" }
    }

    suspend fun share(listId: String, userId: String, remove: Boolean = false) {
        client.post("${config.restUrl}/rpc/gaga_share_shopping_list") {
            auth(); setBody(buildJsonObject { put("list_id", listId); put("member_id", userId); put("remove_member", remove) })
        }
    }
}
