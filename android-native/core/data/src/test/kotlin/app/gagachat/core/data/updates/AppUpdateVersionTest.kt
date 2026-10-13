package app.gagachat.core.data.updates

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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

    // ---- In-app installability ----

    @Test fun apkChannelOverHttpsIsInAppInstallable() {
        val update = update(channel = GaGaUpdate.CHANNEL_APK, url = "https://gagachat.app/downloads/gaga-latest.apk")
        assertTrue(update.isInAppInstallable)
    }

    @Test fun playChannelIsNotInAppInstallable() {
        val update = update(channel = GaGaUpdate.CHANNEL_PLAY, url = "https://play.google.com/store/apps/details?id=gagachat.app")
        assertFalse(update.isInAppInstallable)
    }

    @Test fun insecureApkUrlIsNotInAppInstallable() {
        val update = update(channel = GaGaUpdate.CHANNEL_APK, url = "http://gagachat.app/downloads/gaga-latest.apk")
        assertFalse(update.isInAppInstallable)
    }

    // ---- Download host allow-list ----

    @Test fun firstPartyHostsAreAllowed() {
        assertTrue(AppUpdateDownloader.isAllowedHost("gagachat.app"))
        assertTrue(AppUpdateDownloader.isAllowedHost("www.gagachat.app"))
        assertTrue(AppUpdateDownloader.isAllowedHost("oumagachat.web.app"))
    }

    @Test fun githubReleaseHostsAreAllowed() {
        assertTrue(AppUpdateDownloader.isAllowedHost("github.com"))
        assertTrue(AppUpdateDownloader.isAllowedHost("objects.githubusercontent.com"))
        assertTrue(AppUpdateDownloader.isAllowedHost("release-assets.githubusercontent.com"))
        assertTrue(AppUpdateDownloader.isAllowedHost("github-releases.githubusercontent.com"))
    }

    @Test fun thirdPartyHostsAreRejected() {
        assertFalse(AppUpdateDownloader.isAllowedHost("evil.example.com"))
        assertFalse(AppUpdateDownloader.isAllowedHost("gagachat.app.evil.com"))
        assertFalse(AppUpdateDownloader.isAllowedHost("notgagachat.app"))
    }

    @Test fun hostCheckIsCaseInsensitive() {
        assertTrue(AppUpdateDownloader.isAllowedHost("GaGaChat.App"))
    }

    // ---- Download progress ----

    @Test fun progressFractionIsNullWhenTotalUnknown() {
        assertNull(DownloadProgress(downloadedBytes = 512, totalBytes = 0).fraction)
    }

    @Test fun progressFractionIsComputedAndClamped() {
        assertEquals(0.5f, DownloadProgress(50, 100).fraction!!, 0.0f)
        assertEquals(1f, DownloadProgress(120, 100).fraction!!, 0.0f)
    }

    private fun update(channel: String, url: String) = GaGaUpdate(
        versionCode = 51,
        versionName = "2.7.6",
        releaseNotes = "",
        required = false,
        destination = url,
        downloadUrl = url,
        channel = channel,
    )
}
