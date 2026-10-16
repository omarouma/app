package app.gagachat.navigation

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Navigation labels may collapse, but no tab is removed on 320dp devices. */
class BottomNavigationSizingTest {
    @Test fun smallPhonesUseCompactLabels() {
        assertTrue(useCompactBottomLabels(320f, 1f))
        assertTrue(useCompactBottomLabels(349f, 1f))
        assertFalse(useCompactBottomLabels(360f, 1f))
    }

    @Test fun accessibilityScaleKeepsNavigationTouchableWithoutCrowding() {
        assertTrue(useCompactBottomLabels(412f, 1.6f))
        assertTrue(useCompactBottomLabels(600f, 2f))
        assertFalse(useCompactBottomLabels(412f, 1.15f))
    }
    @Test fun explicitProfilesAreDetailsRatherThanTheMeTab() {
        val profile = app.gagachat.feature.profile.navigation.ProfileRoutes.PROFILE
        assertTrue(shouldShowBottomTabs(profile, false))
        assertTrue(shouldShowBottomTabs(profile, false, ""))
        assertFalse(shouldShowBottomTabs(profile, false, "another-user"))
        assertFalse(shouldShowBottomTabs(profile, false, "explicit-self-profile"))
        assertFalse(shouldShowBottomTabs(null, false))
    }
    @Test fun keyboardSuppressesOnlyPrimaryBottomTabs() {
        assertTrue(shouldShowBottomTabs(app.gagachat.feature.home.navigation.HomeRoutes.HOME, false))
        assertTrue(shouldShowBottomTabs(app.gagachat.feature.dailylife.DailyRoutes.HOME, false))
        assertFalse(shouldShowBottomTabs(app.gagachat.feature.home.navigation.HomeRoutes.HOME, true))
        assertFalse(shouldShowBottomTabs("chat/room/123", false))
    }
}
