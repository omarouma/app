package app.gagachat.feature.calls.presentation

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import app.gagachat.core.model.*
import app.gagachat.core.ui.theme.GagaTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class CallHistoryLayoutTest {
    @get:Rule val compose = createComposeRule()
    @Test fun videoCallbackMessageAndDetailsRemainAvailableAt320dp() {
        var video = false; var message = false; var details = false
        compose.setContent {
            GagaTheme {
                Surface(Modifier.width(320.dp)) {
                    CallHistoryRow(CallSession("test", "chat", "peer", type = CallType.VIDEO, peerName = "A very long caller name", status = CallStatus.ENDED),
                        onClick = { message = true }, onCall = {}, onVideoCall = { video = true }, onDelete = {}, onDetails = { details = true })
                }
            }
        }
        compose.onNodeWithContentDescription("Video call").assertIsDisplayed().performClick()
        assertTrue(video)
        compose.onNodeWithContentDescription("Call options").performClick()
        compose.onNodeWithText("Message").performClick()
        assertTrue(message)
        compose.onNodeWithContentDescription("Call options").performClick()
        compose.onNodeWithText("Call details").performClick()
        assertTrue(details)
    }
}
