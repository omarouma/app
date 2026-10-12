package app.gagachat.core.network.rest

import app.gagachat.core.network.config.SupabaseConfig
import app.gagachat.core.network.session.SessionStore
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.*
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
)

@Singleton
class ChinaShopApi @Inject constructor(
    private val client: HttpClient,
    private val config: SupabaseConfig,
    private val session: SessionStore,
) {
    suspend fun publishedProducts(limit: Int = 40): List<ChinaShopProduct> {
        val token = requireNotNull(session.accessToken()) { "Sign in to view China Direct" }
        return client.get("${config.restUrl}/china_shop_products") {
            header("apikey", config.anonKey)
            header("Authorization", "Bearer $token")
            parameter("select", "id,title,category,description,source_price_cny,source_price_checked_at,supplier_id")
            parameter("order", "created_at.desc")
            parameter("limit", limit.coerceIn(1, 100))
        }.body()
    }
}
