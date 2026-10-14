package app.gagachat.core.ui

import android.graphics.Bitmap
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import app.gagachat.core.ui.component.*
import app.gagachat.core.ui.theme.GagaTheme
import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Actual native renders of shared components, with test-only labels; no account data. */
class RedesignVisualTest {
    @get:Rule val compose = createComposeRule()
    private fun render(dark: Boolean, name: String) {
        var opened = false
        compose.setContent {
            GagaTheme(darkTheme = dark, textScale = 1.2f) {
                GagaScaffold(title = "GaGa design preview", subtitle = "Native component visual check") { insets ->
                    Column(Modifier.fillMaxSize().padding(insets).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Your space. Your choices.", Modifier.padding(16.dp), style = MaterialTheme.typography.headlineMedium)
                        GagaSearchBar(query = "", onQueryChange = {}, placeholder = "Find a setting")
                        GagaSectionHeader("Privacy & communication")
                        GagaSettingsRow("Privacy", subtitle = "Choose who can reach you", leadingIcon = Icons.Default.Lock, onClick = { opened = true })
                        GagaSettingsRow("Notifications", subtitle = "Messages, people and plans", leadingIcon = Icons.Default.Notifications)
                        GagaSettingsRow("Circles", subtitle = "Family, friends, class and work", leadingIcon = Icons.Default.People)
                        GagaSectionHeader("Conversation preview")
                        GagaListRow("Sample conversation", subtitle = "A preview using sample text", avatar = { GagaAvatar(name = "Sample", imageUrl = null) })
                    }
                }
            }
        }
        compose.onNodeWithText("Privacy", useUnmergedTree = true).performScrollTo().performClick()
        compose.waitForIdle()
        assertTrue("Settings row remains reachable at enlarged text size", opened)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.getExternalFilesDir("screenshots"), name)
        file.parentFile?.mkdirs()
        file.outputStream().use { compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it) }
        assertTrue(file.length() > 0)
    }
    @Test fun smallPhoneLightTheme() = render(false, "redesign-light.png")
    @Test fun smallPhoneDarkTheme() = render(true, "redesign-dark.png")
}
