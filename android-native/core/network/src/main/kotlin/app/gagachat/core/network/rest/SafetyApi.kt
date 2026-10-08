package app.gagachat.core.network.rest

import app.gagachat.core.model.SafetyCheckIn
import app.gagachat.core.model.SafetyContact
import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * GaGa Safe backend access (Signature Features 2.3). Trusted contacts and timed
 * check-ins are owner-private rows; status changes go through the
 * `gaga_safety_resolve` / `gaga_safety_escalate` RPCs so the client can never
 * write an arbitrary status.
 */
@Singleton
class SafetyApi @Inject constructor(
    private val client: HttpClient,
    private val config: SupabaseConfig,
    private val session: SessionStore,
) {
    private fun io.ktor.client.request.HttpRequestBuilder.auth() {
        val token = requireNotNull(session.accessToken()) { "Please sign in again" }
        header("apikey", config.anonKey)
        header("Authorization", "Bearer $token")
        contentType(ContentType.Application.Json)
    }

    suspend fun contacts(): List<SafetyContact> =
        client.get("${config.restUrl}/gaga_safety_contacts") {
            auth()
            parameter("order", "priority.asc,created_at.asc")
            parameter("limit", 100)
        }.body()

    suspend fun addContact(contact: SafetyContact): SafetyContact {
        val rows: List<SafetyContact> = client.post("${config.restUrl}/gaga_safety_contacts") {
            auth()
            header("Prefer", "return=representation,resolution=ignore-duplicates")
            setBody(
                buildJsonObject {
                    put("id", contact.id)
                    put("owner_id", contact.ownerId)
                    put("name", contact.name)
                    put("phone", contact.phone)
                    put("contact_id", contact.contactId?.let(::JsonPrimitive) ?: JsonNull)
                    put("priority", contact.priority)
                },
            )
        }.body()
        return rows.singleOrNull() ?: contacts().first { it.id == contact.id }
    }

    suspend fun removeContact(id: String) {
        client.delete("${config.restUrl}/gaga_safety_contacts") {
            auth()
            parameter("id", "eq.$id")
        }
    }

    suspend fun checkIns(): List<SafetyCheckIn> =
        client.get("${config.restUrl}/gaga_safety_checkins") {
            auth()
            parameter("order", "due_at.desc,id.desc")
            parameter("limit", 200)
        }.body()

    suspend fun createCheckIn(checkIn: SafetyCheckIn): SafetyCheckIn {
        val rows: List<SafetyCheckIn> = client.post("${config.restUrl}/gaga_safety_checkins") {
            auth()
            header("Prefer", "return=representation,resolution=ignore-duplicates")
            setBody(
                buildJsonObject {
                    put("id", checkIn.id)
                    put("owner_id", checkIn.ownerId)
                    put("label", checkIn.label)
                    put("due_at", checkIn.dueAt)
                    put("chat_id", checkIn.chatId?.let(::JsonPrimitive) ?: JsonNull)
                },
            )
        }.body()
        return rows.singleOrNull() ?: checkIns().first { it.id == checkIn.id }
    }

    suspend fun resolve(id: String, status: String) {
        client.post("${config.restUrl}/rpc/gaga_safety_resolve") {
            auth()
            setBody(buildJsonObject { put("checkin_id", id); put("new_status", status) })
        }
    }

    suspend fun escalate(id: String) {
        client.post("${config.restUrl}/rpc/gaga_safety_escalate") {
            auth()
            setBody(buildJsonObject { put("checkin_id", id) })
        }
    }
}
