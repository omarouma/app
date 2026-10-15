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
}
