package app.gagachat.shop

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** Preview-only China Direct shopping surface. No checkout or live supplier connection. */
private val Emerald = Color(0xFF008D76)
private val Dark = Color(0xFF09141B)
data class ShopDemoProduct(val id: String, val name: String, val category: String, val cny: Int)
private val demo = listOf(
    ShopDemoProduct("a", "Wireless Earbuds", "Electronics", 39),
    ShopDemoProduct("b", "Smart Watch", "Electronics", 79),
    ShopDemoProduct("c", "Canvas Backpack", "Fashion", 46),
    ShopDemoProduct("d", "Kitchen Organizer", "Home", 28),
    ShopDemoProduct("e", "USB-C Hub", "Computers", 55),
    ShopDemoProduct("f", "LED Desk Lamp", "Home", 33),
    ShopDemoProduct("g", "Sports Bottle", "Sports", 19),
    ShopDemoProduct("h", "Toy Building Set", "Toys", 49)
)
@Composable
fun GaGaChinaShopPreview(onBack: () -> Unit = {}) {
    var category by remember { mutableStateOf("All") }
    var search by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<ShopDemoProduct?>(null) }
    val cart = remember { mutableStateMapOf<String, Int>() }
    val categories = listOf("All", "Electronics", "Fashion", "Home", "Computers", "Sports", "Toys")
    MaterialTheme(colorScheme = lightColorScheme(primary = Emerald)) {
        Column(Modifier.fillMaxSize().background(Color(0xFFF5F7F8)).padding(16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TextButton(onClick = { if (selected != null) selected = null else onBack() }) { Text("‹ Back") }
                Text("GaGa · China Direct", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(10.dp))
            if (selected != null) {
                val p = selected!!
                Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(p.name, style = MaterialTheme.typography.headlineSmall)
                        Text("China source price · ¥${p.cny}", color = Emerald)
                        Text("Demo product. Bangladesh landed cost is calculated only after verified supplier, freight, customs and FX quote.")
                        Button(onClick = { cart[p.id] = (cart[p.id] ?: 0) + 1 }) { Text("Add to demo cart") }
                    }
                }
            } else {
                Card(colors = CardDefaults.cardColors(containerColor = Dark)) {
                    Column(Modifier.fillMaxWidth().padding(20.dp)) {
                        Text("Shop in China", color = Color.White, style = MaterialTheme.typography.headlineMedium)
                        Text("Delivered to Bangladesh", color = Color(0xFF65E188))
                        Text("Verified sourcing · Transparent landed costs", color = Color.White)
                    }
                }
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(search, { search = it }, label = { Text("Search products") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                androidx.compose.foundation.lazy.LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(categories.size) { i ->
                        FilterChip(selected = category == categories[i], onClick = { category = categories[i] }, label = { Text(categories[i]) })
                    }
                }
                Text("Demo catalog · Cart items: ${cart.values.sum()}", modifier = Modifier.padding(vertical = 10.dp))
                val filtered = demo.filter { (category == "All" || it.category == category) && it.name.contains(search, ignoreCase = true) }
                LazyVerticalGrid(columns = GridCells.Fixed(2), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(filtered, key = { it.id }) { p ->
                        Card(onClick = { selected = p }, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Box(Modifier.fillMaxWidth().height(72.dp).background(Color(0xFFE6F5EF), RoundedCornerShape(12.dp)))
                                Text(p.name, fontWeight = FontWeight.SemiBold)
                                Text("¥${p.cny} · China source demo", color = Emerald)
                                OutlinedButton(onClick = { cart[p.id] = (cart[p.id] ?: 0) + 1 }) { Text("Add +") }
                            }
                        }
                    }
                }
            }
        }
    }
}
