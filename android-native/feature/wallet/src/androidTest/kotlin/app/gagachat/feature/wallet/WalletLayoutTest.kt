package app.gagachat.feature.wallet

import android.graphics.Bitmap
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import app.gagachat.core.model.Wallet
import app.gagachat.core.ui.theme.GagaTheme
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.assertTrue
import java.io.File

class WalletLayoutTest {
    @get:Rule val compose = createComposeRule()
    private fun render(dark: Boolean, scale: Float, name: String) {
        var opens = 0
        compose.setContent {
            GagaTheme(darkTheme = dark, textScale = scale) {
                Surface {
                    Column(Modifier.width(320.dp).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        BalanceCard(Wallet("wallet-fixture", "owner-fixture", coins = 1234))
                        AssetRow("G", "GaGa Coins", "In-app coins", "1,234", "Available") { opens++ }
                        AssetRow("$", "US Dollar", "USD · Server balance", "$12.34", "Read only") { opens++ }
                        AssetRow("T", "Tether", "USDT", "Not connected", "Setup needed") { opens++ }
                    }
                }
            }
        }
        compose.onNodeWithText("In-app balance").assertIsDisplayed()
        val balance = compose.onNodeWithText("In-app balance").fetchSemanticsNode().boundsInRoot
        val account = compose.onNodeWithText("Coin wallet", substring = true).fetchSemanticsNode().boundsInRoot
        assertTrue("Balance and wallet label overlap", account.top >= balance.bottom)
        save("$name-balance.png")
        compose.onNodeWithText("Tether").performScrollTo().assertIsDisplayed().performClick()
        assertTrue(opens == 1)
        compose.onNodeWithText("Not connected").assertIsDisplayed()
        save("$name-assets.png")
    }
    private fun save(name: String) {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.getExternalFilesDir("screenshots"), name)
        file.parentFile?.mkdirs()
        file.outputStream().use { compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it) }
        assertTrue(file.length() > 0)
    }
    @Test fun narrowLightWallet() = render(false, 1f, "wallet-light")
    @Test fun narrowDarkLargeTextWallet() = render(true, 2f, "wallet-dark-large")
}
