package app.gagachat.feature.chat.presentation.components

import android.graphics.Bitmap
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import app.gagachat.core.model.*
import app.gagachat.core.ui.component.GagaTopAppBar
import app.gagachat.core.ui.theme.GagaTheme
import java.io.File
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class ChatConversationLayoutTest {
    @get:Rule val compose = createComposeRule()
    private var sent = 0
    private var videoCall: Boolean? = null
    private var mediaOpens = 0
    private fun message(id: String, type: MessageType, text: String? = null) = Message(
        localId = id, clientMessageId = id, conversationId = "chat", senderId = "me", type = type,
        text = text, status = MessageStatus.SENT, createdAtClient = 1_760_000_000_000L)

    @Composable private fun Composer() {
        var draft by remember { mutableStateOf("") }
        MessageComposer(draft, { draft = it }, { sent++; draft = "" }, null, {}, null, {},
            onAttach = {}, onPickImage = {}, onTakePhoto = {}, onPickVideo = {}, onPickAudio = {},
            onShareLocation = {}, onPickContact = {}, isRecording = false, recordingElapsedMs = 0,
            onStartRecording = {}, onStopRecording = {}, onCancelRecording = {})
    }
    @Composable private fun Bubble(item: Message) {
        MessageBubble(item, true, "me", null, onRetry = {}, onMediaClick = { mediaOpens++ }, onLongPress = {},
            onReactionClick = { _, _ -> }, onReplyClick = {}, onCallBack = { videoCall = it })
    }
    private fun render(dark: Boolean = false, scale: Float = 1f) {
        compose.setContent {
            GagaTheme(darkTheme = dark, textScale = scale) {
                val context = LocalContext.current
                DisposableEffect(context) {
                    val activity = generateSequence(context) { (it as? android.content.ContextWrapper)?.baseContext }
                        .filterIsInstance<android.app.Activity>().firstOrNull()
                    val originalMode = activity?.window?.attributes?.softInputMode
                    activity?.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
                    onDispose { if (originalMode != null) activity?.window?.setSoftInputMode(originalMode) }
                }
                Surface {
                    Column(Modifier.width(320.dp).fillMaxHeight()) {
                        GagaTopAppBar("Sample Contact", subtitle = "last seen recently", compactHeader = true,
                            onBack = {}, onTitleClick = {})
                        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                            DateSeparator(1_760_000_000_000L)
                            Bubble(message("call", MessageType.CALL_EVENT, "Missed video call"))
                            Bubble(message("location", MessageType.LOCATION, "Shared location")
                                .copy(latitude = 23.88355, longitude = 90.38782))
                        }
                        Composer()
                    }
                }
            }
        }
    }
    private fun save(name: String) {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.getExternalFilesDir("screenshots"), "conversation/$name.png")
        file.parentFile?.mkdirs()
        file.outputStream().use { compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
    @Test fun compactComposerSendsAndVideoCardCallsBackCorrectMedia() {
        render()
        val row = compose.onNodeWithTag("chat-composer-controls").fetchSemanticsNode().boundsInRoot
        val density = InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.density
        assertTrue("Composer controls should fit within 60dp", row.height / density <= 60f)
        compose.onNodeWithTag("chat-call-card").performClick()
        assertEquals(true, videoCall)
        save("compact-light")
        compose.onNodeWithTag("chat-message-input").performTextInput("Hello")
        compose.onNodeWithContentDescription("Send message").assertIsDisplayed().performClick()
        assertEquals(1, sent)
        compose.onNodeWithContentDescription("Record voice message").assertIsDisplayed()
        compose.onNodeWithText("Sample Contact").assertIsDisplayed()
        save("keyboard-input")
    }
    @Test fun locationCardIsCompactAndOpensAnInAppMap() {
        render()
        val node = compose.onNodeWithTag("chat-location-card", useUnmergedTree = true)
        node.performScrollTo().assertIsDisplayed()
        val density = InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.density
        assertTrue(node.fetchSemanticsNode().boundsInRoot.height / density <= 220f)
        compose.onNodeWithText("Open map").performClick()
        compose.onNodeWithContentDescription("Zoom in").assertIsDisplayed()
    }
    @Test fun largeTextDarkKeepsLocationActionsAndComposerReachable() {
        render(dark = true, scale = 2f)
        compose.onNodeWithText("Directions").performScrollTo()
        val open = compose.onNodeWithText("Open map").fetchSemanticsNode().boundsInRoot
        val directions = compose.onNodeWithText("Directions").fetchSemanticsNode().boundsInRoot
        assertTrue("Large-text map actions must stack", directions.top >= open.bottom)
        compose.onNodeWithTag("chat-message-input").assertIsDisplayed()
        save("dark-large-text")
    }
    @Test fun photoUsesDecodedAspectAndStillOpensViewer() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "chat-layout-photo.png")
        val bitmap = Bitmap.createBitmap(240, 160, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(android.graphics.Color.rgb(65, 130, 160))
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        try {
            compose.setContent { GagaTheme { Surface(Modifier.width(320.dp)) {
                Bubble(message("photo", MessageType.IMAGE).copy(localMediaPath = file.absolutePath))
            } } }
            compose.waitUntil(5_000) {
                runCatching {
                    val bounds = compose.onNodeWithContentDescription("Photo").fetchSemanticsNode().boundsInRoot
                    kotlin.math.abs(bounds.width / bounds.height - 1.5f) < 0.05f
                }.getOrDefault(false)
            }
            compose.onNodeWithContentDescription("Photo").performClick()
            assertEquals(1, mediaOpens)
            save("photo-fit")
        } finally { file.delete() }
    }

}
