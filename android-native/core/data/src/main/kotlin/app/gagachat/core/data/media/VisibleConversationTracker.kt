package app.gagachat.core.data.media

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Tracks the conversation currently visible in the UI. When a matching FCM
 * message arrives while the app is foregrounded, the chat itself updates and
 * plays the permitted short tone; posting an additional system notification
 * would create a duplicate audible alert.
 *
 * Never use this to suppress pushes while GaGa is backgrounded: the platform
 * lifecycle is checked separately by PushHandler.
 */
@Singleton
class VisibleConversationTracker @Inject constructor() {
    @Volatile private var visible: Pair<String, String>? = null

    fun show(userId: String, conversationId: String) {
        if (userId.isNotBlank() && conversationId.isNotBlank()) {
            visible = userId to conversationId
        }
    }

    fun hide(userId: String, conversationId: String) {
        if (visible == userId to conversationId) visible = null
    }

    fun isVisible(userId: String, conversationId: String): Boolean =
        visible == userId to conversationId
}
