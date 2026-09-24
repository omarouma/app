package app.gagachat.baselineprofile

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Generates the Baseline Profile (PDF §9). The profile warms the critical
 * startup + first-screen code paths so the release build starts and scrolls
 * without JIT warm-up jank.
 *
 * Run: ./gradlew :app:generateReleaseBaselineProfile
 */
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {

    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generate() {
        rule.collect(packageName = "gagachat.app") {
            pressHome()
            startActivityAndWait()

            // Wait for the home conversation list to appear (session bootstrap +
            // first composition). This is the hottest startup path.
            device.wait(Until.hasObject(By.pkg("gagachat.app")), 5_000)
            device.waitForIdle()

            // Exercise the bottom navigation to warm each top-level destination.
            device.findObject(By.text("Contacts"))?.click()
            device.waitForIdle()
            device.findObject(By.text("Calls"))?.click()
            device.waitForIdle()
            device.findObject(By.text("Settings"))?.click()
            device.waitForIdle()
            device.findObject(By.text("Chats"))?.click()
            device.waitForIdle()
        }
    }
}
