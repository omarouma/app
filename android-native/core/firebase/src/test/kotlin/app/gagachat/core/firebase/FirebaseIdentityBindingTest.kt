package app.gagachat.core.firebase

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pure binding checks; no Firebase app, server secret or test account needed. */
class FirebaseIdentityBindingTest {
    private val uid = "9cf3ba21-e4cd-46b6-a1b9-d63440164e8e"
    private val project = "oumagachat"
    private val token = "TEST_ONLY_not_a_real_token"

    @Test fun permitsOnlyMatchingUserAndFirebaseProject() {
        assertTrue(isExpectedFirebaseIdentity(uid, project, uid, project, token))
    }

    @Test fun rejectsWrongSupabaseIdentity() {
        assertFalse(isExpectedFirebaseIdentity(uid, project, "other-user", project, token))
        assertFalse(isExpectedFirebaseIdentity("", project, uid, project, token))
    }

    @Test fun rejectsMissingOrMismatchedFirebaseProject() {
        assertFalse(isExpectedFirebaseIdentity(uid, project, uid, null, token))
        assertFalse(isExpectedFirebaseIdentity(uid, project, uid, "", token))
        assertFalse(isExpectedFirebaseIdentity(uid, project, uid, "different-project", token))
        assertFalse(isExpectedFirebaseIdentity(uid, null, uid, project, token))
        assertFalse(isExpectedFirebaseIdentity(uid, "", uid, project, token))
    }

    @Test fun rejectsMissingCustomToken() {
        assertFalse(isExpectedFirebaseIdentity(uid, project, uid, project, ""))
    }
}
