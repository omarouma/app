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
        DailyRecord("old-event", "sample", "event", "Last month meeting", happenedAt = now.toString(), dueAt = "2026-09-14T10:00:00Z"),
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
        compose.onNodeWithText("Make today count").assertIsDisplayed()
        compose.onNodeWithText("GaGa China Direct", substring = true).assertDoesNotExist()
        // Regression guard: the quick-action strip must never clip "Shared lists"
        // (the fifth action) off the edge at phone widths.
        compose.onNodeWithTag("today_content").performScrollToNode(hasContentDescription("Open Shared lists"))
        compose.onNodeWithContentDescription("Open Shared lists").assertIsDisplayed()
        capture("today-light.png")
        compose.onNodeWithTag("today_content").performScrollToNode(hasText("Needs your attention"))
        compose.onNodeWithText("Last month meeting").assertDoesNotExist()
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

    @Test fun opensRealDataWorkspace() {
        render(DailyUi(records = records, loading = false))
        compose.onNodeWithTag("today_content").performScrollToNode(hasText("All tools"))
        compose.onNodeWithText("All tools").performClick()
        assertEquals(DailyRoutes.WORKSPACE, route)
    }

    @Test fun workspaceShowsOnlyActualActivityAndHasSearch() {
        compose.setContent {
            GagaTheme {
                TodayWorkspaceScreen(
                    ui = DailyUi(records = records, loading = false),
                    onBack = {},
                    onRefresh = {},
                    onNavigate = { route = it },
                    showBack = false,
                )
            }
        }
        compose.onNodeWithText("Today workspace").assertIsDisplayed()
        compose.onNodeWithText("Organize your day").assertIsDisplayed()
        compose.onNodeWithText("1 open · 0 completed").assertIsDisplayed()
        compose.onNodeWithText("Family, Class & Work").assertDoesNotExist()
        capture("today-workspace-approved-layout.png")
        compose.onNodeWithContentDescription("Search Today tools").performClick()
        compose.onNode(hasSetTextAction()).performTextInput("reminders")
        compose.onNodeWithText("Tasks").assertDoesNotExist()
        compose.onNodeWithText("Reminders").assertIsDisplayed()
        capture("today-workspace-search.png")
    }

    @Test fun workspaceCardsUseRealCountsAndRoutes() {
        compose.setContent {
            GagaTheme {
                TodayWorkspaceScreen(
                    ui = DailyUi(records = records, loading = false),
                    onBack = {},
                    onRefresh = {},
                    onNavigate = { route = it },
                )
            }
        }
        compose.onNodeWithText("Organize your day").assertIsDisplayed()
        compose.onNodeWithText("Tasks").performClick()
        assertEquals(DailyRoutes.records("task"), route)
        capture("today-workspace-light.png")
    }
    @Test fun darkWorkspaceAccentsAndLargeTextStayVisible() {
        compose.setContent {
            GagaTheme(darkTheme = true, textScale = 1.4f) {
                TodayWorkspaceScreen(
                    ui = DailyUi(records = records, loading = false),
                    onBack = {}, onRefresh = {}, onNavigate = { route = it },
                )
            }
        }
        compose.onNodeWithText("Tasks").assertIsDisplayed()
        compose.onNodeWithText("Reminders").assertIsDisplayed()
        capture("today-workspace-dark-large-text.png")
        compose.onNodeWithText("Tasks").performClick()
        assertEquals(DailyRoutes.records("task"), route)
    }

}
