package app.gagachat.feature.calls.call

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import app.gagachat.core.common.util.AppLogger
import com.zegocloud.uikit.plugin.common.PluginCallbackListener
import com.zegocloud.uikit.plugin.invitation.ZegoInvitationType
import com.zegocloud.uikit.prebuilt.call.ZegoUIKitPrebuiltCallConfig
import com.zegocloud.uikit.prebuilt.call.ZegoUIKitPrebuiltCallService
import com.zegocloud.uikit.prebuilt.call.config.ZegoNotificationConfig
import com.zegocloud.uikit.prebuilt.call.core.invite.ZegoCallInvitationData
import com.zegocloud.uikit.prebuilt.call.event.CallEndListener
import com.zegocloud.uikit.prebuilt.call.event.ZegoCallEndReason
import com.zegocloud.uikit.prebuilt.call.invite.ZegoUIKitPrebuiltCallInvitationConfig
import com.zegocloud.uikit.prebuilt.call.invite.internal.ZegoUIKitPrebuiltCallConfigProvider
import com.zegocloud.uikit.service.defines.ZegoUIKitUser
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import java.lang.ref.WeakReference
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Thin, app-wide wrapper around the ZEGOCLOUD Call Kit (PDF \u00a78 \u2014 real calling).
 *
 * The Call Kit bundles everything a production call needs in one SDK:
 *  * **ZIM** for the invitation/signaling channel (ring, accept, reject, hang-up),
 *  * **Express** for the actual audio/video media transport, and
 *  * a **prebuilt call UI** (incoming/outgoing/in-call screens) so we do not have
 *    to hand-roll WebRTC negotiation or the call surface.
 *
 * Authentication uses the project **AppSign** (the credentials the project owner
 * supplied), which is the simplest production-ready mode. A token-based seam is
 * intentionally documented in [init] so a server-issued Token04 can be dropped in
 * later without touching any caller.
 *
 * Lifecycle: [init] is called once a signed-in session exists and [uninit] on
 * logout (driven from `AppViewModel`). The manager tracks the current foreground
 * [Activity] because the Call Kit's UI launcher requires one.
 */
@Singleton
class ZegoCallManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val logger: AppLogger,
) {

    /** Emits every time a call finishes, so the UI can persist the final status. */
    private val _callEnded = MutableSharedFlow<ZegoCallEndReason>(extraBufferCapacity = 8)
    val callEnded: SharedFlow<ZegoCallEndReason> = _callEnded.asSharedFlow()

    /** The most recently resumed Activity, needed to launch the Call Kit UI. */
    private var currentActivity: WeakReference<Activity>? = null

    /** Guards against double-initialisation across recompositions / reconnects. */
    @Volatile
    private var initialized = false

    @Volatile
    private var currentUserId: String? = null

    init {
        (context.applicationContext as? Application)?.registerActivityLifecycleCallbacks(
            object : Application.ActivityLifecycleCallbacks {
                override fun onActivityResumed(activity: Activity) {
                    currentActivity = WeakReference(activity)
                }

                override fun onActivityPaused(activity: Activity) {
                    if (currentActivity?.get() === activity) currentActivity = null
                }

                override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
                override fun onActivityStarted(activity: Activity) = Unit
                override fun onActivityStopped(activity: Activity) = Unit
                override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
                override fun onActivityDestroyed(activity: Activity) = Unit
            },
        )
    }

    /**
     * Initialises the Call Kit for [userId]. Idempotent: repeated calls for the
     * same user are ignored, and switching users re-initialises cleanly.
     */
    fun init(userId: String, userName: String) {
        val safeId = sanitizeUserId(userId)
        if (safeId.isBlank()) {
            logger.w(TAG, "init skipped: empty user id")
            return
        }
        if (initialized && currentUserId == safeId) return

        val app = context.applicationContext as? Application ?: return
        if (initialized && currentUserId != safeId) uninit()

        val config = ZegoUIKitPrebuiltCallInvitationConfig().apply {
            // Incoming calls show both Accept and Decline.
            showDeclineButton = true
            // Ring-back / ringtone channel matches the app's high-importance call
            // channel so incoming calls bypass Do-Not-Disturb like a real phone.
            notificationConfig = ZegoNotificationConfig().apply {
                channelID = CALL_CHANNEL_ID
                channelName = "Calls"
                channelDesc = "Incoming voice and video calls"
            }
            // Provide the 1:1 call configuration for every invitation. The default
            // is a correct one-on-one video/voice call; we only need to return it.
            provider = ZegoUIKitPrebuiltCallConfigProvider { data ->
                defaultCallConfig(data)
            }
        }

        try {
            // AppSign authentication. To switch to server-issued tokens, replace
            // this with:
            //   ZegoUIKitPrebuiltCallService.initWithToken(app, APP_ID, token, safeId, name, config)
            ZegoUIKitPrebuiltCallService.init(
                app,
                APP_ID,
                APP_SIGN,
                safeId,
                userName.ifBlank { "GaGa User" },
                config,
            )
            ZegoUIKitPrebuiltCallService.events.callEvents.setCallEndListener(
                CallEndListener { reason, _ ->
                    logger.i(TAG, "Call ended: $reason")
                    _callEnded.tryEmit(reason)
                },
            )
            initialized = true
            currentUserId = safeId
            logger.i(TAG, "ZEGO Call Kit initialised for user $safeId")
        } catch (t: Throwable) {
            logger.e(TAG, "ZEGO Call Kit init failed", t)
        }
    }

    /** Tears the Call Kit down (logout). Safe to call when not initialised. */
    fun uninit() {
        if (!initialized) return
        runCatching { ZegoUIKitPrebuiltCallService.unInit() }
            .onFailure { logger.w(TAG, "ZEGO unInit failed", it) }
        initialized = false
        currentUserId = null
    }

    /**
     * Starts a 1:1 call with [peerId] and shows the Call Kit's outgoing-call UI.
     * Returns true if the invitation was dispatched (a foreground Activity was
     * available and the peer id was valid).
     */
    fun startCall(peerId: String, peerName: String, isVideo: Boolean): Boolean {
        val activity = currentActivity?.get()
        if (activity == null) {
            logger.w(TAG, "startCall skipped: no foreground Activity")
            return false
        }
        val safePeer = sanitizeUserId(peerId)
        if (safePeer.isBlank()) {
            logger.w(TAG, "startCall skipped: empty peer id")
            return false
        }
        val invitee = ZegoUIKitUser(safePeer, peerName.ifBlank { "GaGa User" })
        val type = if (isVideo) ZegoInvitationType.VIDEO_CALL else ZegoInvitationType.VOICE_CALL
        return try {
            ZegoUIKitPrebuiltCallService.sendInvitationWithUIChange(
                activity,
                listOf(invitee),
                type,
                PluginCallbackListener { result ->
                    logger.i(TAG, "Invitation dispatched: $result")
                },
            )
            true
        } catch (t: Throwable) {
            logger.e(TAG, "startCall failed", t)
            false
        }
    }

    /** Hangs up the active call (used by the app's own end-call affordances). */
    fun endCall() {
        runCatching { ZegoUIKitPrebuiltCallService.endCall() }
            .onFailure { logger.w(TAG, "endCall failed", it) }
    }

    /** True when the Call Kit has been initialised for a user. */
    fun isInitialized(): Boolean = initialized

    /**
     * ZEGO user ids may only contain letters, digits and underscores. Supabase
     * UUIDs contain dashes, so they are stripped before being used as a ZEGO id.
     */
    fun sanitizeUserId(raw: String): String =
        raw.filter { it.isLetterOrDigit() || it == '_' }.take(64)

    private fun defaultCallConfig(data: ZegoCallInvitationData): ZegoUIKitPrebuiltCallConfig =
        ZegoUIKitPrebuiltCallInvitationConfig.generateDefaultConfig(data)

    companion object {
        private const val TAG = "ZegoCallManager"

        /** GaGa project credentials (ZEGOCLOUD console). */
        const val APP_ID = 372536818L
        const val APP_SIGN =
            "571d8d6b2261709b5f09d4b610151af464d7f388e61bd91d0f69e8d07bd6f2a4"

        /** Matches NotificationChannels.CALLS so calls use the ringing channel. */
        const val CALL_CHANNEL_ID = "gaga_calls"
    }
}
