package app.gagachat.core.network.rest

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.*
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/** Reads only server-published products; Postgres RLS is authoritative. */
@Serializable
data class ChinaShopProduct(
    val id: String,
    val title: String,
    val category: String,
    val description: String? = null,
    @SerialName("source_price_cny") val sourcePriceCny: Double,
    @SerialName("source_price_checked_at") val priceCheckedAt: String? = null,
    @SerialName("supplier_id") val supplierId: String,
    @SerialName("image_urls") val imageUrls: List<String> = emptyList(),
    @SerialName("available_quantity") val availableQuantity: Int? = null,
    @SerialName("inventory_checked_at") val inventoryCheckedAt: String? = null,
    @SerialName("origin_city") val originCity: String? = null,
)

@Serializable
data class ChinaShopSupplierApplication(
    val id: String,
    @SerialName("legal_business_name") val legalBusinessName: String,
    val status: String,
    @SerialName("submitted_at") val submittedAt: String,
)
@Serializable
data class ChinaShopQuoteRequest(
    val id: String,
    @SerialName("product_id") val productId: String,
    val quantity: Int,
    @SerialName("destination_city") val destinationCity: String,
    val status: String,
    @SerialName("created_at") val createdAt: String,
)
@Serializable
data class ChinaShopLandedQuote(
    val id: String,
    @SerialName("product_id") val productId: String,
    val quantity: Int,
    @SerialName("quote_status") val status: String,
    @SerialName("product_cost_bdt") val productCostBdt: Double,
    @SerialName("international_freight_bdt") val freightBdt: Double,
    @SerialName("customs_duty_bdt") val customsBdt: Double,
    @SerialName("taxes_bdt") val taxesBdt: Double,
    @SerialName("local_delivery_bdt") val deliveryBdt: Double,
    @SerialName("service_fee_bdt") val serviceFeeBdt: Double,
    @SerialName("total_bdt") val totalBdt: Double,
    @SerialName("expires_at") val expiresAt: String,
)
@Singleton
class ChinaShopApi @Inject constructor(
    private val client: HttpClient,
    private val config: SupabaseConfig,
    private val session: SessionStore,
) {
    @Serializable
    data class CartRow(@SerialName("product_id") val productId: String, val quantity: Int)
    private fun token(): String = requireNotNull(session.accessToken()) { "Sign in to manage cart" }
    suspend fun cart(): List<CartRow> = client.get("${config.restUrl}/china_shop_cart_items") {
        header("apikey", config.anonKey)
        header("Authorization", "Bearer ${token()}")
        parameter("select", "product_id,quantity")
        parameter("limit", 100)
    }.body()
    suspend fun setCartQuantity(productId: String, quantity: Int) {
        require(quantity in 0..99)
        val userId = requireNotNull(session.userId()) { "Sign in to manage cart" }
        if (quantity == 0) {
            client.delete("${config.restUrl}/china_shop_cart_items") {
                header("apikey", config.anonKey)
                header("Authorization", "Bearer ${token()}")
                parameter("product_id", "eq.$productId")
                parameter("user_id", "eq.$userId")
            }
        } else {
            client.post("${config.restUrl}/china_shop_cart_items") {
                header("apikey", config.anonKey)
                header("Authorization", "Bearer ${token()}")
                header("Prefer", "resolution=merge-duplicates")
                contentType(ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("user_id", userId)
                    put("product_id", productId)
                    put("quantity", quantity)
                })
            }
        }
    }

    suspend fun mySupplierApplications(): List<ChinaShopSupplierApplication> =
        client.get("${config.restUrl}/china_shop_supplier_applications") {
            header("apikey", config.anonKey)
            header("Authorization", "Bearer ${token()}")
            parameter("select", "id,legal_business_name,status,submitted_at")
            parameter("order", "submitted_at.desc")
            parameter("limit", 30)
        }.body()
    suspend fun applyAsSupplier(business: String, contact: String, email: String, city: String, registration: String) {
        require(business.trim().length in 2..160 && contact.trim().length in 2..120)
            && email.trim().length in 5..254 && city.trim().length in 2..120 && registration.trim().length in 3..120)
        val userId = requireNotNull(session.userId()) { "Sign in to apply" }
        client.post("${config.restUrl}/china_shop_supplier_applications") {
            header("apikey", config.anonKey)
            header("Authorization", "Bearer ${token()}")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("applicant_user_id", userId)
                put("legal_business_name", business.trim())
                put("contact_name", contact.trim())
                put("contact_email", email.trim())
                put("business_city", city.trim())
                put("registration_number", registration.trim())
            })
        }
    }
    /** Customer submits a request, not a price or an approval. RLS enforces verified stock. */
    suspend fun requestQuote(productId: String, quantity: Int, destinationCity: String) {
        require(quantity in 1..99)
        require(destinationCity.trim().length in 2..120)
        val userId = requireNotNull(session.userId()) { "Sign in to request a quote" }
        client.post("${config.restUrl}/china_shop_quote_requests") {
            header("apikey", config.anonKey)
            header("Authorization", "Bearer ${token()}")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("user_id", userId)
                put("product_id", productId)
                put("quantity", quantity)
                put("destination_city", destinationCity.trim())
            })
        }
    }
    suspend fun myQuoteRequests(limit: Int = 40): List<ChinaShopQuoteRequest> =
        client.get("${config.restUrl}/china_shop_quote_requests") {
            header("apikey", config.anonKey)
            header("Authorization", "Bearer ${token()}")
            parameter("select", "id,product_id,quantity,destination_city,status,created_at")
            parameter("order", "created_at.desc")
            parameter("limit", limit.coerceIn(1, 100))
        }.body()
    /** Read only: quotes must be created and verified by an authorized server. */
    suspend fun myQuotes(limit: Int = 40): List<ChinaShopLandedQuote> =
        client.get("${config.restUrl}/china_shop_landed_quotes") {
            header("apikey", config.anonKey)
            header("Authorization", "Bearer ${token()}")
            parameter("select", "id,product_id,quantity,quote_status,product_cost_bdt,international_freight_bdt,customs_duty_bdt,taxes_bdt,local_delivery_bdt,service_fee_bdt,total_bdt,expires_at")
            parameter("order", "created_at.desc")
            parameter("limit", limit.coerceIn(1, 100))
        }.body()

    suspend fun publishedProducts(limit: Int = 40): List<ChinaShopProduct> {
        val token = requireNotNull(session.accessToken()) { "Sign in to view China Direct" }
        return client.get("${config.restUrl}/china_shop_products") {
            header("apikey", config.anonKey)
            header("Authorization", "Bearer $token")
            parameter("select", "id,title,category,description,source_price_cny,source_price_checked_at,supplier_id,image_urls,available_quantity,inventory_checked_at,origin_city")
            parameter("order", "created_at.desc")
            parameter("limit", limit.coerceIn(1, 100))
        }.body()
    }
}
