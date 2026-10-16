package app.gagachat.feature.dailylife

import androidx.compose.foundation.*
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import app.gagachat.core.network.rest.ChinaShopApi
import app.gagachat.core.network.rest.ChinaShopLandedQuote
import app.gagachat.core.network.rest.ChinaShopQuoteRequest
import app.gagachat.core.network.rest.ChinaShopSupplierApplication
import app.gagachat.core.network.rest.ChinaShopAdminApplication
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Live China Direct shopping surface. Products, cart, quote requests, landed-cost
 * quotations and supplier applications are all backed by [ChinaShopApi]
 * (Supabase PostgREST/RPC). Payment and checkout remain intentionally disabled
 * until supplier and landed-cost verification are complete.
 */
private val Emerald = Color(0xFF008D76)
private val Dark = Color(0xFF09141B)
data class ShopProduct(
    val id: String,
    val name: String,
    val category: String,
    val sourcePriceCny: Double,
    val availableQuantity: Int?,
    val inventoryCheckedAt: String?,
    val originCity: String?,
    val imageUrls: List<String>,
)
private fun stockLabel(p: ShopProduct): String = when {
    p.availableQuantity == null || p.inventoryCheckedAt == null -> "Stock not verified"
    p.availableQuantity == 0 -> "Out of stock"
    else -> "Supplier-reported stock: ${p.availableQuantity}"
}
@HiltViewModel
class ChinaShopViewModel @Inject constructor(private val api: ChinaShopApi) : ViewModel() {
    var products by mutableStateOf<List<ShopProduct>>(emptyList())
        private set
    var loading by mutableStateOf(true)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var cart by mutableStateOf<Map<String, Int>>(emptyMap())
        private set
    var cartError by mutableStateOf<String?>(null)
        private set
    var quotes by mutableStateOf<List<ChinaShopLandedQuote>>(emptyList())
        private set
    var quoteError by mutableStateOf<String?>(null)
        private set
    var verificationMessage by mutableStateOf<String?>(null)
        private set
    fun verifyProduct(id: String, price: Double, stock: Int, priceEvidence: String, stockEvidence: String) {
        viewModelScope.launch {
            try { api.adminVerifyProduct(id, price, stock, priceEvidence, stockEvidence)
                verificationMessage = "Price and stock verification saved. Product remains unpublished."
            } catch (_: Exception) { verificationMessage = "Verification failed. Check admin permissions, supplier and evidence." }
        }
    }
    fun publishProduct(id: String) {
        viewModelScope.launch {
            try { api.adminPublishProduct(id, true)
                verificationMessage = "Product published after server validation."
            } catch (_: Exception) { verificationMessage = "Publishing blocked. Verify supplier, recent price and inventory." }
        }
    }
    var draftMessage by mutableStateOf<String?>(null)
        private set
    fun createDraftProduct(supplierId: String, title: String, category: String, price: Double, stock: Int, city: String) {
        viewModelScope.launch {
            try {
                api.adminCreateDraftProduct(supplierId, title, category, price, stock, city)
                draftMessage = "Unpublished product draft saved. Verify source price and inventory before publishing."
            } catch (_: Exception) { draftMessage = "Could not create draft. Check admin access and verified supplier." }
        }
    }
    var adminQueue by mutableStateOf<List<ChinaShopAdminApplication>>(emptyList())
        private set
    var adminMessage by mutableStateOf<String?>(null)
        private set
    fun refreshAdminQueue() {
        viewModelScope.launch {
            try { adminQueue = api.adminReviewQueue(); adminMessage = null }
            catch (_: Exception) { adminMessage = "Admin access required or queue unavailable." }
        }
    }
    fun reviewSupplier(id: String, decision: String, notes: String, evidence: String) {
        viewModelScope.launch {
            try {
                api.adminReviewSupplier(id, decision, notes, evidence)
                adminMessage = "Review saved."
                refreshAdminQueue()
            } catch (_: Exception) { adminMessage = "Review failed. Check permissions and verification evidence." }
        }
    }
    var supplierApplications by mutableStateOf<List<ChinaShopSupplierApplication>>(emptyList())
        private set
    var supplierMessage by mutableStateOf<String?>(null)
        private set
    fun refreshSupplierApplications() {
        viewModelScope.launch {
            try { supplierApplications = api.mySupplierApplications() }
            catch (_: Exception) { supplierMessage = "Could not load supplier applications." }
        }
    }
    fun applyAsSupplier(business: String, contact: String, email: String, city: String, registration: String) {
        viewModelScope.launch {
            try {
                api.applyAsSupplier(business, contact, email, city, registration)
                supplierMessage = "Application submitted. Verification is pending."
                refreshSupplierApplications()
            } catch (_: Exception) { supplierMessage = "Supplier application failed. Check details and sign-in." }
        }
    }
    var requests by mutableStateOf<List<ChinaShopQuoteRequest>>(emptyList())
        private set
    var requestError by mutableStateOf<String?>(null)
        private set
    fun refreshRequests() {
        viewModelScope.launch {
            try {
                requests = api.myQuoteRequests()
                requestError = null
            } catch (_: Exception) { requestError = "Could not load request history." }
        }
    }
    var quoteRequestMessage by mutableStateOf<String?>(null)
        private set
    fun requestQuote(productId: String, quantity: Int, city: String) {
        viewModelScope.launch {
            try {
                api.requestQuote(productId, quantity, city)
                quoteRequestMessage = "Quotation request submitted for supplier review."
                refreshRequests()
            } catch (_: Exception) {
                quoteRequestMessage = "Request failed. Check sign-in, verified stock and destination."
            }
        }
    }
    init { refresh(); refreshCart(); refreshQuotes(); refreshRequests(); refreshSupplierApplications() }
    fun refreshQuotes() {
        viewModelScope.launch {
            try {
                quotes = api.myQuotes()
                quoteError = null
            } catch (_: Exception) { quoteError = "Unable to load quotations." }
        }
    }
    fun refreshCart() {
        viewModelScope.launch {
            try {
                cart = api.cart().associate { it.productId to it.quantity }
                cartError = null
            } catch (_: Exception) { cartError = "Cart could not sync. Please retry." }
        }
    }
    fun add(productId: String) {
        val quantity = (cart[productId] ?: 0) + 1
        if (quantity > 99) return
        viewModelScope.launch {
            try {
                api.setCartQuantity(productId, quantity)
                refreshCart()
            } catch (_: Exception) { cartError = "Could not save cart. Please retry." }
        }
    }
    fun changeCartQuantity(productId: String, quantity: Int) {
        if (quantity !in 0..99) return
        viewModelScope.launch {
            try {
                api.setCartQuantity(productId, quantity)
                refreshCart()
                cartError = null
            } catch (_: Exception) {
                cartError = "Could not update cart. Please retry."
            }
        }
    }
    fun refresh() {
        viewModelScope.launch {
            loading = true
            error = null
            try {
                products = api.publishedProducts().map { ShopProduct(it.id, it.title, it.category, it.sourcePriceCny, it.availableQuantity, it.inventoryCheckedAt, it.originCity, it.imageUrls) }
            } catch (_: Exception) {
                error = "Could not load the live catalog. Please retry."
            } finally {
                loading = false
            }
        }
    }
}

@Composable
fun GaGaChinaDirectScreen(onBack: () -> Unit = {}, viewModel: ChinaShopViewModel = hiltViewModel()) {
    var category by remember { mutableStateOf("All") }
    var search by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<ShopProduct?>(null) }
    var showCart by remember { mutableStateOf(false) }
    var showSupplierForm by remember { mutableStateOf(false) }
    var showAdminReview by remember { mutableStateOf(false) }
    var verifyProductId by remember { mutableStateOf("") }
    var verifyPrice by remember { mutableStateOf("") }
    var verifyStock by remember { mutableStateOf("") }
    var priceEvidence by remember { mutableStateOf("") }
    var stockEvidence by remember { mutableStateOf("") }
    var draftSupplierId by remember { mutableStateOf("") }
    var draftTitle by remember { mutableStateOf("") }
    var draftCategory by remember { mutableStateOf("") }
    var draftPrice by remember { mutableStateOf("") }
    var draftStock by remember { mutableStateOf("") }
    var draftOrigin by remember { mutableStateOf("") }
    var reviewNotes by remember { mutableStateOf("") }
    var evidenceReference by remember { mutableStateOf("") }
    var supplierBusiness by remember { mutableStateOf("") }
    var supplierContact by remember { mutableStateOf("") }
    var supplierEmail by remember { mutableStateOf("") }
    var supplierCity by remember { mutableStateOf("") }
    var supplierRegistration by remember { mutableStateOf("") }
    var destinationCity by remember { mutableStateOf("") }
    val cart = viewModel.cart
    val catalog = viewModel.products
    val categories = listOf("All", "Electronics", "Fashion", "Home", "Computers", "Sports", "Toys")
    MaterialTheme(colorScheme = lightColorScheme(primary = Emerald)) {
        Column(Modifier.fillMaxSize().background(Color(0xFFF5F7F8)).then(if (showAdminReview || showSupplierForm) Modifier.verticalScroll(rememberScrollState()) else Modifier).padding(16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TextButton(onClick = { if (showAdminReview) showAdminReview = false else if (showSupplierForm) showSupplierForm = false else if (showCart) showCart = false else if (selected != null) selected = null else onBack() }) { Text("‹ Back") }
                Text("GaGa · China Direct", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(10.dp))
            if (showAdminReview) {
                Text("Supplier Admin Review", style = MaterialTheme.typography.headlineSmall)
                Text("Restricted to authorized GaGa reviewers. Verify registration documents independently.")
                TextButton(onClick = viewModel::refreshAdminQueue) { Text("Load pending applications") }
                viewModel.adminMessage?.let { Text(it) }
                OutlinedTextField(reviewNotes, { reviewNotes = it }, label = { Text("Review notes (required)") })
                OutlinedTextField(evidenceReference, { evidenceReference = it }, label = { Text("Verified document reference") })
                HorizontalDivider()
                Text("Verify and publish product", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(verifyProductId, { verifyProductId = it }, label = { Text("Existing draft product UUID") })
                OutlinedTextField(verifyPrice, { verifyPrice = it }, label = { Text("Verified source price CNY") })
                OutlinedTextField(verifyStock, { verifyStock = it }, label = { Text("Verified stock quantity") })
                OutlinedTextField(priceEvidence, { priceEvidence = it }, label = { Text("Independent price evidence reference") })
                OutlinedTextField(stockEvidence, { stockEvidence = it }, label = { Text("Independent stock evidence reference") })
                Button(onClick = { viewModel.verifyProduct(verifyProductId, verifyPrice.toDoubleOrNull() ?: 0.0, verifyStock.toIntOrNull() ?: -1, priceEvidence, stockEvidence) }, enabled = verifyProductId.isNotBlank() && (verifyPrice.toDoubleOrNull() ?: 0.0) > 0 && (verifyStock.toIntOrNull() ?: -1) >= 0 && priceEvidence.length >= 8 && stockEvidence.length >= 8) { Text("Record independent verification") }
                OutlinedButton(onClick = { viewModel.publishProduct(verifyProductId) }, enabled = verifyProductId.isNotBlank()) { Text("Publish verified product") }
                viewModel.verificationMessage?.let { Text(it) }
                Text("New product draft", style = MaterialTheme.typography.titleMedium)
                Text("Use the verified supplier UUID. Draft products are not public until separately verified and published.")
                OutlinedTextField(draftSupplierId, { draftSupplierId = it }, label = { Text("Verified supplier UUID") })
                OutlinedTextField(draftTitle, { draftTitle = it }, label = { Text("Product title") })
                OutlinedTextField(draftCategory, { draftCategory = it }, label = { Text("Category") })
                OutlinedTextField(draftPrice, { draftPrice = it }, label = { Text("Source price (CNY)") })
                OutlinedTextField(draftStock, { draftStock = it }, label = { Text("Supplier-reported stock") })
                OutlinedTextField(draftOrigin, { draftOrigin = it }, label = { Text("Origin city, China") })
                Button(onClick = { viewModel.createDraftProduct(draftSupplierId, draftTitle, draftCategory, draftPrice.toDoubleOrNull() ?: 0.0, draftStock.toIntOrNull() ?: -1, draftOrigin) }, enabled = draftSupplierId.isNotBlank() && draftTitle.length >= 3 && draftCategory.length >= 2 && (draftPrice.toDoubleOrNull() ?: 0.0) > 0.0 && (draftStock.toIntOrNull() ?: -1) >= 0 && draftOrigin.length >= 2) { Text("Save unpublished draft") }
                viewModel.draftMessage?.let { Text(it) }
                viewModel.adminQueue.forEach { application ->
                    Card {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(application.businessName, fontWeight = FontWeight.Bold)
                            Text("${application.city} · ${application.registration}")
                            Text("${application.contactName} · ${application.contactEmail}")
                            Text("Status: ${application.status}")
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = { viewModel.reviewSupplier(application.id, "under_review", reviewNotes, "") }, enabled = reviewNotes.isNotBlank()) { Text("Review") }
                                OutlinedButton(onClick = { viewModel.reviewSupplier(application.id, "rejected", reviewNotes, "") }, enabled = reviewNotes.isNotBlank()) { Text("Reject") }
                            }
                            Button(onClick = { viewModel.reviewSupplier(application.id, "approved", reviewNotes, evidenceReference) }, enabled = reviewNotes.isNotBlank() && evidenceReference.isNotBlank()) { Text("Approve verified supplier") }
                        }
                    }
                }
            } else if (showSupplierForm) {
                Text("Apply as China Supplier", style = MaterialTheme.typography.headlineSmall)
                Text("Application only. GaGa will verify business registration before publishing products.")
                OutlinedTextField(supplierBusiness, { supplierBusiness = it }, label = { Text("Legal business name") })
                OutlinedTextField(supplierContact, { supplierContact = it }, label = { Text("Contact person") })
                OutlinedTextField(supplierEmail, { supplierEmail = it }, label = { Text("Business email") })
                OutlinedTextField(supplierCity, { supplierCity = it }, label = { Text("China city") })
                OutlinedTextField(supplierRegistration, { supplierRegistration = it }, label = { Text("Registration number") })
                Button(onClick = { viewModel.applyAsSupplier(supplierBusiness, supplierContact, supplierEmail, supplierCity, supplierRegistration) }, enabled = supplierBusiness.trim().length >= 2 && supplierContact.trim().length >= 2 && supplierEmail.trim().length >= 5 && supplierCity.trim().length >= 2 && supplierRegistration.trim().length >= 3) { Text("Submit for verification") }
                viewModel.supplierMessage?.let { Text(it) }
                TextButton(onClick = viewModel::refreshSupplierApplications) { Text("Refresh application status") }
                viewModel.supplierApplications.forEach { application ->
                    Text("${application.legalBusinessName} · ${application.status}")
                }
            } else if (showCart) {
                Text("Your saved cart", style = MaterialTheme.typography.headlineSmall)
                Text("My quote requests", style = MaterialTheme.typography.titleMedium)
                viewModel.requestError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = viewModel::refreshRequests) { Text("Refresh request status") }
                if (viewModel.requests.isEmpty() && viewModel.requestError == null) Text("No quote requests submitted yet.")
                viewModel.requests.forEach { request ->
                    Text("${request.destinationCity} · ${request.quantity} item(s) · ${request.status}")
                }
                Text("BDT landed-cost quotations", style = MaterialTheme.typography.titleMedium)
                viewModel.quoteError?.let {
                    Text(it, color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = viewModel::refreshQuotes) { Text("Retry quotations") }
                }
                if (viewModel.quotes.isEmpty() && viewModel.quoteError == null) {
                    Text("No supplier-verified quotations available yet.")
                }
                viewModel.quotes.forEach { quote ->
                    Card {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Quote status: ${quote.status} · Quantity ${quote.quantity}")
                            Text("Product: ৳${quote.productCostBdt}")
                            Text("International freight: ৳${quote.freightBdt}")
                            Text("Customs duty: ৳${quote.customsBdt}")
                            Text("Taxes: ৳${quote.taxesBdt}")
                            Text("Local delivery: ৳${quote.deliveryBdt}")
                            Text("Service fee: ৳${quote.serviceFeeBdt}")
                            Text("Total: ৳${quote.totalBdt}", fontWeight = FontWeight.Bold)
                            Text("Valid until: ${quote.expiresAt}")
                            Text("Quote display only. Payment and checkout are disabled.")
                        }
                    }
                }
                viewModel.cartError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = viewModel::refreshCart) { Text("Refresh cart") }
                catalog.filter { (cart[it.id] ?: 0) > 0 }.forEach { product ->
                    val quantity = cart[product.id] ?: 0
                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(product.name, fontWeight = FontWeight.SemiBold)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            OutlinedButton(onClick = { viewModel.changeCartQuantity(product.id, quantity - 1) }) { Text("−") }
                            Text("$quantity × ¥${product.sourcePriceCny} = ¥${product.sourcePriceCny * quantity}")
                            OutlinedButton(onClick = { viewModel.changeCartQuantity(product.id, quantity + 1) }, enabled = quantity < 99 && (product.availableQuantity == null || quantity < product.availableQuantity)) { Text("+") }
                        }
                        TextButton(onClick = { viewModel.changeCartQuantity(product.id, 0) }) { Text("Remove") }
                    }
                }
                Text("China source subtotal: ¥${catalog.sumOf { it.sourcePriceCny * (cart[it.id] ?: 0) }}")
                Text("Shipping, customs, tax, exchange rate and Bangladesh delivery are not included.")
                Text("Checkout is unavailable until supplier and landed-cost verification.", color = Emerald)
            } else if (selected != null) {
                val p = selected!!
                Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        p.imageUrls.firstOrNull()?.takeIf { it.startsWith("https://") }?.let { url ->
                            AsyncImage(model = url, contentDescription = p.name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().height(190.dp))
                        }
                        Text(p.name, style = MaterialTheme.typography.headlineSmall)
                        Text("China source price · ¥${p.sourcePriceCny}", color = Emerald)
                        Text(stockLabel(p))
                        p.originCity?.let { Text("Origin: $it, China") }
                        Text("China source price only. Bangladesh landed cost requires verified freight, customs and FX quote.")
                        Button(onClick = { viewModel.add(p.id) }, enabled = p.availableQuantity != 0 && p.inventoryCheckedAt != null && p.availableQuantity != null) { Text("Add to cart") }
                        OutlinedTextField(value = destinationCity, onValueChange = { destinationCity = it }, label = { Text("Bangladesh destination city") }, singleLine = true)
                        Button(onClick = { viewModel.requestQuote(p.id, 1, destinationCity) }, enabled = destinationCity.trim().length in 2..120 && p.availableQuantity != null && p.availableQuantity > 0 && p.inventoryCheckedAt != null) { Text("Request BDT landed-cost quote") }
                        viewModel.quoteRequestMessage?.let { Text(it) }
                    }
                }
            } else {
                Card(colors = CardDefaults.cardColors(containerColor = Dark)) {
                    Column(Modifier.fillMaxWidth().padding(20.dp)) {
                        Text("Shop in China", color = Color.White, style = MaterialTheme.typography.headlineMedium)
                        Text("Delivered to Bangladesh", color = Color(0xFF65E188))
                        Text("Supplier verification required · Landed-cost quotes on request", color = Color.White)
                    }
                }
                TextButton(onClick = { showSupplierForm = true }) { Text("Become a China Supplier") }
                TextButton(onClick = { showAdminReview = true; viewModel.refreshAdminQueue() }) { Text("Supplier admin review (restricted)") }
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(search, { search = it }, label = { Text("Search products") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                androidx.compose.foundation.lazy.LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(categories.size) { i ->
                        FilterChip(selected = category == categories[i], onClick = { category = categories[i] }, label = { Text(categories[i]) })
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("China catalog · ${cart.values.sum()} items", modifier = Modifier.padding(vertical = 10.dp))
                    TextButton(onClick = { showCart = true }) { Text("View cart") }
                }
                if (viewModel.loading) { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                viewModel.cartError?.let { Text(it, color = MaterialTheme.colorScheme.error); TextButton(onClick = viewModel::refreshCart) { Text("Retry cart") } }
                if (viewModel.error != null) {
                    Text(viewModel.error!!, color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = viewModel::refresh) { Text("Retry") }
                }
                if (!viewModel.loading && viewModel.error == null && catalog.isEmpty()) {
                    Text("No verified China products published yet. Check back soon.")
                }
                val filtered = catalog.filter { (category == "All" || it.category == category) && it.name.contains(search, ignoreCase = true) }
                LazyVerticalGrid(columns = GridCells.Fixed(2), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(filtered, key = { it.id }) { p ->
                        Card(onClick = { selected = p }, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                val imageUrl = p.imageUrls.firstOrNull()?.takeIf { it.startsWith("https://") }
                                if (imageUrl != null) {
                                    AsyncImage(model = imageUrl, contentDescription = p.name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().height(96.dp))
                                } else {
                                    Box(Modifier.fillMaxWidth().height(96.dp).background(Color(0xFFE6F5EF), RoundedCornerShape(12.dp)))
                                }
                                Text(p.name, fontWeight = FontWeight.SemiBold)
                                Text("¥${p.sourcePriceCny} · China source", color = Emerald)
                                OutlinedButton(onClick = { viewModel.add(p.id) }, enabled = p.availableQuantity != 0 && p.inventoryCheckedAt != null && p.availableQuantity != null) { Text("Add +") }
                            }
                        }
                    }
                }
            }
        }
    }
}
