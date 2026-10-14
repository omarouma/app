package app.gagachat.feature.dailylife

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import app.gagachat.core.model.DailyRecord
import app.gagachat.core.ui.theme.GagaTheme
import java.io.File
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/** Renders the production Today dashboard with explicitly test-only data. */
class TodayDesignTest {
    @get:Rule val compose = createComposeRule()
    private val now = Instant.parse("2026-10-14T08:00:00Z")
    private val records = listOf(
        DailyRecord("test-task", "sample", "task", "Review class notes", happenedAt = now.toString(), dueAt = "2026-10-14T10:00:00Z"),
        DailyRecord("test-event", "sample", "event", "Team catch-up", happenedAt = now.toString(), dueAt = "2026-10-14T11:00:00Z"),
        DailyRecord("test-reminder", "sample", "reminder", "Bring the documents", happenedAt = now.toString(), dueAt = "2026-10-13T10:00:00Z"),
    )
    private var route = ""
    private var completed = ""
    private fun render(ui: DailyUi, dark: Boolean = false, scale: Float = 1f) {
        compose.setContent { GagaTheme(darkTheme = dark, textScale = scale) {
            TodayDashboard(ui, now, "sample", {}, { route = it }, {}, {}, { completed = it.id })
        } }
    }
    private fun capture(name: String) {
        compose.waitForIdle()
        val file = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir("screenshots"), name)
        file.parentFile?.mkdirs()
        file.outputStream().use { compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
    @Test fun populatedLightAndActions() {
        render(DailyUi(records = records, loading = false))
        compose.onNodeWithText("Your day, organized.").assertIsDisplayed()
        compose.onNodeWithText("GaGa China Direct", substring = true).assertDoesNotExist()
        capture("today-light.png")
        compose.onNodeWithTag("today_content").performScrollToNode(hasContentDescription("Complete Review class notes"))
        compose.onNodeWithContentDescription("Complete Review class notes").performClick()
        assertEquals("test-task", completed)
        compose.onNodeWithTag("today_content").performScrollToNode(hasText("Explore your tools"))
        compose.onNodeWithText("Explore your tools").performClick()
        compose.onNodeWithTag("today_content").performScrollToNode(hasText("GaGa China Direct", substring = true))
        compose.onNodeWithText("GaGa China Direct", substring = true).assertIsDisplayed()
    }
    @Test fun darkAtLargeText() {
        render(DailyUi(records = records, loading = false), dark = true, scale = 1.4f)
        capture("today-dark-large-text.png")
        compose.onNodeWithTag("today_content").performScrollToNode(hasText("More"))
        compose.onNodeWithText("More").performClick()
        compose.onNodeWithText("Add Private note").performClick()
        assertEquals(DailyRoutes.edit("note"), route)
    }
    @Test fun emptyDayIsHonest() {
        render(DailyUi(loading = false))
        compose.onNodeWithTag("today_content").performScrollToNode(hasText("Nothing due today"))
        compose.onNodeWithText("Nothing due today").assertIsDisplayed()
        capture("today-empty.png")
    }
    @Test fun loadingIsNotAnEmptySuccess() {
        render(DailyUi(loading = true))
        compose.onNodeWithTag("today_content").performScrollToNode(hasText("Loading your agenda…"))
        compose.onNodeWithText("Nothing due today").assertDoesNotExist()
        capture("today-loading.png")
    }
    @Test fun failureIsNotAnEmptySuccess() {
        render(DailyUi(loading = false, error = "Sample connection failure"))
        compose.onNodeWithText("Couldn't refresh your day").assertIsDisplayed()
        compose.onNodeWithTag("today_content").performScrollToNode(hasText("Your agenda is unavailable"))
        compose.onNodeWithText("Nothing due today").assertDoesNotExist()
        capture("today-error.png")
    }
}
