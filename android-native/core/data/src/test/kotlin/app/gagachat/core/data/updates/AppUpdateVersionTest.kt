package app.gagachat.core.data.updates

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppUpdateVersionTest {
    @Test fun noOfferWhenCurrent() {
        assertFalse(AppUpdateRepository.shouldOfferUpdate(47, 47, 47))
    }

    @Test fun newerPublishedApkIsOffered() {
        assertTrue(AppUpdateRepository.shouldOfferUpdate(47, 48, 48))
    }

    @Test fun unreleasedPlayChannelIsNotOffered() {
        assertFalse(AppUpdateRepository.shouldOfferUpdate(47, 0, 48))
    }

    @Test fun futureClaimBeyondRegistryIsRejected() {
        assertFalse(AppUpdateRepository.shouldOfferUpdate(47, 99, 48))
    }

    @Test fun olderPublishedChannelIsNotOffered() {
        assertFalse(AppUpdateRepository.shouldOfferUpdate(48, 47, 48))
    }
}
