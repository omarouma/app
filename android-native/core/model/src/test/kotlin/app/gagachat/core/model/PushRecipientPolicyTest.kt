package app.gagachat.core.model

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PushRecipientPolicyTest {
    private val me = "11111111-1111-4111-8111-111111111111"
    private val other = "22222222-2222-4222-8222-222222222222"

    @Test fun senderCurrentPayloadOnlyRoutesToItsRecipient() {
        assertTrue(PushRecipientPolicy.canDisplay(me, mapOf("type" to "message", "recipient_user_id" to me)))
        assertFalse(PushRecipientPolicy.canDisplay(other, mapOf("type" to "message", "recipient_user_id" to me)))
    }

    @Test fun friendRequestAndCallMustBeAddressed() {
        assertFalse(PushRecipientPolicy.canDisplay(me, mapOf("type" to "friend_request")))
        assertFalse(PushRecipientPolicy.canDisplay(me, mapOf("type" to "call")))
        assertTrue(PushRecipientPolicy.canDisplay(me, mapOf("type" to "friend_accepted", "user_id" to me)))
        assertTrue(PushRecipientPolicy.canDisplay(me, mapOf("type" to "call", "callee_id" to me)))
    }

    @Test fun conflictingRecipientClaimsAreNeverAccepted() {
        assertFalse(PushRecipientPolicy.canDisplay(me, mapOf(
            "type" to "call", "recipient_user_id" to me, "callee_id" to other,
        )))
        assertFalse(PushRecipientPolicy.canDisplay(me, mapOf(
            "type" to "message", "user_id" to other, "recipient_user_id" to me,
        )))
    }

    @Test fun signedOutUsersNeverReceiveNotifications() {
        assertFalse(PushRecipientPolicy.canDisplay(null, mapOf("type" to "message", "recipient_user_id" to me)))
        assertFalse(PushRecipientPolicy.canDisplay("", mapOf("type" to "security")))
    }

    @Test fun nonPersonalUpdateCanStillUseTheVerifiedReleaseFeed() {
        assertTrue(PushRecipientPolicy.canDisplay(me, mapOf("type" to "app_update")))
    }
}
