package app.gagachat.feature.calls.call

import app.gagachat.core.model.CallStatus
import app.gagachat.core.common.di.ApplicationScope
import app.gagachat.core.network.session.SessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import java.util.UUID
import com.zegocloud.uikit.prebuilt.call.invite.internal.ZegoInvitationCallListener
import com.zegocloud.uikit.prebuilt.call.invite.internal.ZegoCallUser
import com.zegocloud.uikit.prebuilt.call.invite.internal.ZegoCallType
import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.network.rest.SupabaseRestApi
import com.zegocloud.uikit.plugin.common.PluginCallbackListener
import com.zegocloud.uikit.plugin.invitation.ZegoInvitationType
import com.zegocloud.uikit.prebuilt.call.ZegoUIKitPrebuiltCallConfig
import com.zegocloud.uikit.prebuilt.call.ZegoUIKitPrebuiltCallService
import com.zegocloud.uikit.prebuilt.call.config.ZegoNotificationConfig
import com.zegocloud.uikit.prebuilt.call.core.invite.ZegoCallInvitationData
import com.zegocloud.uikit.prebuilt.call.event.CallEndListener
import com.zegocloud.uikit.prebuilt.call.event.ErrorEventsListener
import com.zegocloud.uikit.prebuilt.call.event.SignalPluginConnectListener
import com.zegocloud.uikit.prebuilt.call.event.ZegoCallEndReason
import im.zego.zim.enums.ZIMConnectionEvent
import im.zego.zim.enums.ZIMConnectionState
import org.json.JSONObject
import com.zegocloud.uikit.prebuilt.call.invite.ZegoUIKitPrebuiltCallInvitationConfig
import com.zegocloud.uikit.prebuilt.call.invite.internal.ZegoUIKitPrebuiltCallConfigProvider
import com.zegocloud.uikit.service.defines.ZegoUIKitUser
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.coroutines.resume
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.first
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
 * Authentication uses a short-lived server-issued ZIM token. The ZEGO
 * ServerSecret/AppSign is never embedded in the APK.
 *
 * Lifecycle: [init] is called once a signed-in session exists and [uninit] on
 * logout (driven from `AppViewModel`). The manager tracks the current foreground
 * [Activity] because the Call Kit's UI launcher requires one.
 */

/** Coarse ZIM signaling-channel state, surfaced to the call UI. */
enum class ZimConnection { UNKNOWN, DISCONNECTED, CONNECTING, CONNECTED }

@Singleton
class ZegoCallManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val logger: AppLogger,
    private val restApi: SupabaseRestApi,
    private val sessionStore: SessionStore,
    @ApplicationScope private val applicationScope: CoroutineScope,
) {

    private val initMutex = Mutex()
    private var activeServerCallId: String? = null
    private var activeOwnerId: String? = null

    @Synchronized private fun trackCall(sdkId: String): String? {
        val id = runCatching { UUID.fromString(sdkId.removePrefix("call_")).toString() }.getOrNull() ?: return null
        if (activeServerCallId != null && activeServerCallId != id) return null
        if (activeServerCallId != id) _durationSeconds.value = 0L
        activeServerCallId = id
        activeOwnerId = sessionStore.userId()
        return id
    }

    private fun heartbeat(sdkId: String? = null) {
        val id = if (sdkId != null) trackCall(sdkId) else activeServerCallId
        val owner = activeOwnerId
        if (id == null || owner == null) return
        applicationScope.launch {
            if (sessionStore.userId() != owner) return@launch
            runCatching { restApi.touchCall(id) }
                .onFailure { logger.w(TAG, "Call heartbeat could not sync", it) }
        }
    }

    /** Application scope keeps incoming and outgoing call state out of screen lifecycle. */
    @Synchronized private fun completeCall(status: CallStatus, sdkId: String? = null) {
        val id = activeServerCallId ?: return
        if (sdkId != null && sdkId.removePrefix("call_") != id) return
        val owner = activeOwnerId
        val duration = _durationSeconds.value
        activeServerCallId = null
        activeOwnerId = null
        _callEnded.tryEmit(status)
        applicationScope.launch {
            // Transient failures retry independently of the dismissed call screen.
            repeat(3) { attempt ->
                if (sessionStore.userId() != owner) return@launch
                try {
                    restApi.finishCall(id, status.name.lowercase(), duration)
                    return@launch
                } catch (t: Throwable) {
                    if (t is CancellationException) throw t
                    logger.w(TAG, "Call completion could not sync (attempt ${attempt + 1})", t)
                    if (attempt < 2) delay(1_000L shl attempt)
                }
            }
        }
    }
    private var tokenExpiresAt = 0L
    var lastError: String? = null
        private set
    private val _durationSeconds = MutableStateFlow(0L)
    val durationSeconds = _durationSeconds.asStateFlow()

    /** Live ZIM signaling state — invitations can only be sent when CONNECTED. */
    private val _connection = MutableStateFlow(ZimConnection.UNKNOWN)
    val connection: StateFlow<ZimConnection> = _connection.asStateFlow()

    /** Last ZIM error code observed (init or invitation), for diagnostics. */
    private val _lastErrorCode = MutableStateFlow<Int?>(null)
    val lastErrorCode: StateFlow<Int?> = _lastErrorCode.asStateFlow()

    /** Emits every time a call finishes, so the UI can persist the final status. */
    private val _callEnded = MutableSharedFlow<CallStatus>(extraBufferCapacity = 8)
    val callEnded: SharedFlow<CallStatus> = _callEnded.asSharedFlow()

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
    suspend fun init(userId: String, userName: String) = initMutex.withLock {
        val safeId = sanitizeUserId(userId)
        if (safeId.isBlank()) {
            logger.w(TAG, "init skipped: empty user id")
            return@withLock
        }
        if (initialized && currentUserId == safeId && tokenExpiresAt > System.currentTimeMillis() / 1000 + 60) return@withLock

        val app = context.applicationContext as? Application ?: return@withLock
        if (initialized) uninit()

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
            val displayName = userName.ifBlank { "GaGa User" }
            val token = restApi.getZegoZimToken(safeId, displayName)
            require(token.appId > 0 && token.zimToken.startsWith("04") && token.userId == safeId) {
                "Calling server returned an invalid token. Please contact support."
            }
            val resolvedAppId = token.appId
            _connection.value = ZimConnection.CONNECTING
            ZegoUIKitPrebuiltCallService.initWithToken(
                app,
                resolvedAppId,
                token.zimToken,
                safeId,
                displayName,
                config,
            )
            // Surface every SDK error (init + runtime) so failures are diagnosable
            // and the UI can react instead of silently hanging.
            ZegoUIKitPrebuiltCallService.events.setErrorEventsListener(
                object : ErrorEventsListener {
                    override fun onError(errorCode: Int, message: String?) {
                        logger.w(TAG, "ZEGO error $errorCode: ${message.orEmpty()}")
                        _lastErrorCode.value = errorCode
                    }
                },
            )
            // Track the signaling channel: invitations can only be delivered once
            // it reports CONNECTED (this is the fix for the opaque 6000011 path).
            ZegoUIKitPrebuiltCallService.events.invitationEvents.setPluginConnectListener(
                object : SignalPluginConnectListener {
                    override fun onSignalPluginConnectionStateChanged(
                        state: ZIMConnectionState,
                        event: ZIMConnectionEvent,
                        extendedData: JSONObject?,
                    ) {
                        _connection.value = when (state) {
                            ZIMConnectionState.CONNECTED -> ZimConnection.CONNECTED
                            ZIMConnectionState.CONNECTING,
                            ZIMConnectionState.RECONNECTING,
                            -> ZimConnection.CONNECTING
                            ZIMConnectionState.DISCONNECTED -> ZimConnection.DISCONNECTED
                            else -> ZimConnection.UNKNOWN
                        }
                        logger.i(TAG, "ZIM signaling: $state ($event)")
                    }
                },
            )
            ZegoUIKitPrebuiltCallService.events.callEvents.setCallEndListener(
                CallEndListener { reason, _ ->
                    logger.i(TAG, "Call ended: $reason")
                    completeCall(if (reason == ZegoCallEndReason.KICK_OUT) CallStatus.FAILED else CallStatus.ENDED)
                },
            )
            ZegoUIKitPrebuiltCallService.events.invitationEvents.setInvitationListener(
                object : ZegoInvitationCallListener {
                    override fun onIncomingCallReceived(callID: String, caller: ZegoCallUser, callType: ZegoCallType, callees: MutableList<ZegoCallUser>) { trackCall(callID) }
                    override fun onIncomingCallCanceled(callID: String, caller: ZegoCallUser) { completeCall(CallStatus.MISSED, callID) }
                    override fun onIncomingCallTimeout(callID: String, caller: ZegoCallUser) { completeCall(CallStatus.MISSED, callID) }
                    override fun onOutgoingCallAccepted(callID: String, callee: ZegoCallUser) { heartbeat(callID) }
                    override fun onOutgoingCallRejectedCauseBusy(callID: String, callee: ZegoCallUser) { completeCall(CallStatus.BUSY, callID) }
                    override fun onOutgoingCallDeclined(callID: String, callee: ZegoCallUser) { completeCall(CallStatus.REJECTED, callID) }
                    override fun onOutgoingCallTimeout(callID: String, callees: MutableList<ZegoCallUser>) { completeCall(CallStatus.MISSED, callID) }
                },
            )
            tokenExpiresAt = token.expireAt
            lastError = null
            initialized = true
            currentUserId = safeId
            logger.i(TAG, "ZEGO Call Kit initialised for user $safeId")
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            _connection.value = ZimConnection.DISCONNECTED
            lastError = "Calling could not authenticate. Check the calling server configuration and your connection."
            logger.e(TAG, "ZEGO Call Kit init failed", t)
        }
    }

    /** Tears the Call Kit down (logout). Safe to call when not initialised. */
    fun uninit() {
        if (!initialized) return
        completeCall(CallStatus.ENDED)
        runCatching { ZegoUIKitPrebuiltCallService.unInit() }
            .onFailure { logger.w(TAG, "ZEGO unInit failed", it) }
        initialized = false
        currentUserId = null
        _connection.value = ZimConnection.UNKNOWN
    }

    /**
     * Starts a 1:1 call with [peerId] and shows the Call Kit's outgoing-call UI.
     * Returns true if the invitation was dispatched (a foreground Activity was
     * available and the peer id was valid).
     */
    suspend fun startCall(peerId: String, peerName: String, isVideo: Boolean, callId: String): Boolean {
        if (!initialized) {
            lastError = lastError ?: "Calling is still connecting. Please try again."
            return false
        }
        // The signaling channel must be CONNECTED before an invitation can be
        // delivered. Wait briefly for it to come up (fresh login / reconnect)
        // rather than firing an invitation the SDK will reject with a raw code.
        if (!awaitConnection()) {
            lastError = "Calling is still connecting. Check your connection and try again."
            return false
        }
        _durationSeconds.value = 0L
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
        trackCall(callId)
        return try {
            withTimeoutOrNull(20_000L) {
                suspendCancellableCoroutine { continuation ->
                    ZegoUIKitPrebuiltCallService.sendInvitationWithUIChange(
                        activity, listOf(invitee), type, "", "call_$callId", null,
                        PluginCallbackListener { result ->
                            val code = (result["code"] as? Number)?.toInt()
                            val failedPeers = result["errorInvitees"] as? Collection<*>
                            val success = code == 0 && failedPeers.isNullOrEmpty()
                            lastError = if (success) null else describeInviteFailure(code, null)
                            if (!success) completeCall(CallStatus.FAILED)
                            if (continuation.isActive) continuation.resume(success)
                        },
                    )
                }
            } ?: run {
                lastError = "The call invitation timed out. Please try again."
                completeCall(CallStatus.FAILED)
                endCall()
                false
            }
        } catch (t: Throwable) {
            if (t is CancellationException) throw t
            lastError = "Could not send the call invitation. Please try again."
            logger.e(TAG, "startCall failed", t)
            completeCall(CallStatus.FAILED)
            false
        }
    }

    /** Hangs up the active call (used by the app's own end-call affordances). */
    fun endCall(status: CallStatus = CallStatus.ENDED) {
        completeCall(status)
        runCatching { ZegoUIKitPrebuiltCallService.endCall() }
            .onFailure { logger.w(TAG, "endCall failed", it) }
    }

    /** True when the Call Kit has been initialised for a user. */
    fun isInitialized(): Boolean = initialized

    /** True when the signaling channel is connected and calls can be placed. */
    fun isReady(): Boolean = initialized && _connection.value == ZimConnection.CONNECTED

    /**
     * Suspends until the ZIM signaling channel reports CONNECTED, or [timeoutMs]
     * elapses. Returns true when invitations can be delivered.
     */
    suspend fun awaitConnection(timeoutMs: Long = 8_000L): Boolean {
        if (_connection.value == ZimConnection.CONNECTED) return true
        return withTimeoutOrNull(timeoutMs) {
            connection.first { it == ZimConnection.CONNECTED }
            true
        } ?: false
    }

    /** Turns a raw ZIM invitation error into an actionable, human message. */
    private fun describeInviteFailure(code: Int?, message: String?): String = when (code) {
        // 6000011: the callee's ZIM user id has never signed in — ZIM registers a
        // user only on first login, so the invitation cannot be delivered.
        6000011 -> "This contact can't receive calls yet. Ask them to open GaGa Chat once, then try again."
        else -> message?.takeIf { it.isNotBlank() }
            ?.let { "Could not reach this contact ($it)." }
            ?: "Could not reach this contact (error ${code ?: -1}). Please try again."
    }

    /**
     * ZEGO user ids may only contain letters, digits and underscores. Supabase
     * UUIDs contain dashes, so they are stripped before being used as a ZEGO id.
     */
    fun sanitizeUserId(raw: String): String =
        raw.filter { it.isLetterOrDigit() || it == '_' }.take(64)

    private fun defaultCallConfig(data: ZegoCallInvitationData): ZegoUIKitPrebuiltCallConfig =
        ZegoUIKitPrebuiltCallInvitationConfig.generateDefaultConfig(data).apply {
            durationConfig = com.zegocloud.uikit.prebuilt.call.config.ZegoCallDurationConfig().apply {
                durationUpdateListener = com.zegocloud.uikit.prebuilt.call.config.DurationUpdateListener { seconds ->
                    _durationSeconds.value = seconds
                    if (seconds > 0 && seconds % 30L == 1L) heartbeat()
                }
            }
        }

    companion object {
        private const val TAG = "ZegoCallManager"

        /** Public ZEGO AppID. Authentication is server-token based. */
        const val APP_ID = 372536818L

        /** Matches NotificationChannels.CALLS so calls use the ringing channel. */
        const val CALL_CHANNEL_ID = "gaga_calls"
    }
}

