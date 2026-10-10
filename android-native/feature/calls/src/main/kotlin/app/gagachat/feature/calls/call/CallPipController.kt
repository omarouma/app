package app.gagachat.feature.calls.call

import android.app.PictureInPictureParams
import android.os.Build
import android.util.Rational
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Process-wide bridge between the call surface (Compose) and the host Activity's
 * Picture-in-Picture lifecycle callbacks.
 *
 * Picture-in-Picture is a platform Activity feature, so the two sides cannot see
 * each other through Compose alone: the Activity needs to know whether a call is
 * live (to auto-minimise on Home) and the call surface needs to know whether it
 * is currently in the PiP window (to drop the controls and show just the video).
 * This tiny singleton carries exactly that state and nothing else.
 *
 * Everything here is real and behaviour-changing: the aspect ratio drives the
 * actual PiP window shape, [callActive] gates auto-enter, and [inPip] drives the
 * compact layout.
 */
object CallPipController {

    /** True while a call surface is on screen and eligible to minimise. */
    @Volatile
    var callActive: Boolean = false

    /** True when the active call carries video (drives the PiP aspect ratio). */
    @Volatile
    var isVideo: Boolean = false

    private val _inPip = MutableStateFlow(false)

    /** Emits the platform's current PiP state so the UI can adapt its layout. */
    val inPip: StateFlow<Boolean> = _inPip.asStateFlow()

    /** Called from the Activity's `onPictureInPictureModeChanged`. */
    fun onPipChanged(value: Boolean) {
        _inPip.value = value
    }

    /**
     * Builds the [PictureInPictureParams] for the current call. Video calls use a
     * 16:9 window; audio calls use a square one (the platform clamps the ratio to
     * 0.418–2.39, and both of these sit comfortably inside that range).
     *
     * On Android 12+ `autoEnterEnabled` lets the system animate straight into PiP
     * on the Home gesture; on older releases the Activity falls back to
     * `onUserLeaveHint`.
     */
    fun buildParams(): PictureInPictureParams {
        val ratio = if (isVideo) Rational(16, 9) else Rational(1, 1)
        val builder = PictureInPictureParams.Builder().setAspectRatio(ratio)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(callActive)
        }
        return builder.build()
    }
}
