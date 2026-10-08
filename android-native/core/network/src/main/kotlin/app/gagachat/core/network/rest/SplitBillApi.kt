package app.gagachat.core.network.rest

import app.gagachat.core.model.SplitBill
import app.gagachat.core.model.SplitBillMember
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
class SplitBillApi @Inject constructor(
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

    suspend fun create(
        id: String,
        chatId: String,
        sourceMessage: String?,
        title: String,
        totalMinor: Long,
        currency: String,
        dueAt: String?,
        participantIds: List<String>,
        shareMinors: List<Long>,
    ) {
        client.post("${config.restUrl}/rpc/gaga_create_split_bill") {
            auth()
            setBody(buildJsonObject {
                put("p_bill_id", id)
                put("p_chat_id", chatId)
                put("p_source_message", sourceMessage?.let(::JsonPrimitive) ?: JsonNull)
                put("p_title", title)
                put("p_total_minor", totalMinor)
                put("p_currency", currency)
                put("p_due_at", dueAt?.let(::JsonPrimitive) ?: JsonNull)
                put("p_participant_ids", JsonArray(participantIds.map(::JsonPrimitive)))
                put("p_share_minors", JsonArray(shareMinors.map(::JsonPrimitive)))
            })
        }
    }

    suspend fun bills(chatId: String? = null): List<SplitBill> = client.get("${config.restUrl}/gaga_split_bills") {
        auth()
        parameter("order", "created_at.desc")
        parameter("limit", 200)
        chatId?.let { parameter("chat_id", "eq.$it") }
    }.body()

    suspend fun members(billId: String? = null): List<SplitBillMember> =
        client.get("${config.restUrl}/gaga_split_bill_members") {
            auth()
            parameter("order", "bill_id.asc,user_id.asc")
            parameter("limit", 1000)
            billId?.let { parameter("bill_id", "eq.$it") }
        }.body()

    suspend fun setSettled(billId: String, userId: String, settled: Boolean) {
        client.post("${config.restUrl}/rpc/gaga_set_split_share_status") {
            auth()
            setBody(buildJsonObject {
                put("p_bill_id", billId)
                put("p_user_id", userId)
                put("p_settled", settled)
            })
        }
    }
}
