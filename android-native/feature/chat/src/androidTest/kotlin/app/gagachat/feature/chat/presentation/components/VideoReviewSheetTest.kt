package app.gagachat.feature.chat.presentation.components

import android.net.Uri
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class VideoReviewSheetTest {
    @get:Rule val compose = createComposeRule()

    @Test fun sendingIsLatchedEvenWhenParentKeepsSheetOpen() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val source = File(instrumentation.targetContext.cacheDir, "video-review-ui.mp4")
        instrumentation.context.assets.open("video-editor-source.mp4").use { input ->
            source.outputStream().use { input.copyTo(it) }
        }
        var sends = 0
        try {
            compose.setContent {
                MaterialTheme {
                    VideoReviewSheet(Uri.fromFile(source), onDismiss = {}, onSend = { _, _ -> sends++ })
                }
            }
            compose.waitUntil(timeoutMillis = 15_000) {
                compose.onAllNodes(hasText("Send video") and isEnabled()).fetchSemanticsNodes().isNotEmpty()
            }
            compose.onNodeWithText("Send video").performScrollTo().performClick()
            compose.onNodeWithText("Send video").assertIsNotEnabled()
            compose.runOnIdle { assertEquals(1, sends) }
        } finally { source.delete() }
    }
}
