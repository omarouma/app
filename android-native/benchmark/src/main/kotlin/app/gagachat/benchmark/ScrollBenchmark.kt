package app.gagachat.benchmark

import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Scroll jank benchmark (PDF §9). Measures frame timing while flinging the home
 * conversation list — the screen most sensitive to recomposition and image
 * decode cost.
 */
@RunWith(AndroidJUnit4::class)
class ScrollBenchmark {

    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun scrollHomeList() = benchmarkRule.measureRepeated(
        packageName = "gagachat.app",
        metrics = listOf(FrameTimingMetric()),
        iterations = 5,
        startupMode = StartupMode.WARM,
        compilationMode = CompilationMode.Partial(),
    ) {
        pressHome()
        startActivityAndWait()

        val list = device.findObject(By.pkg("gagachat.app"))
        list.setGestureMargin(device.displayWidth / 5)
        repeat(3) { list.fling(Direction.DOWN) }
        repeat(3) { list.fling(Direction.UP) }
    }
}
