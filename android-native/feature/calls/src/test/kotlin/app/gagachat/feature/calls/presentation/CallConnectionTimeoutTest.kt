package app.gagachat.feature.calls.presentation

import androidx.lifecycle.ViewModelStore
import app.gagachat.core.data.call.CallSignalingCoordinator
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.CallRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.model.CallStatus
import app.gagachat.core.network.session.AuthSession
import app.gagachat.feature.calls.call.AudioDeviceInfo
import app.gagachat.feature.calls.call.CallConnection
import app.gagachat.feature.calls.call.CallDiagnostics
import app.gagachat.feature.calls.call.CallEndedInfo
import app.gagachat.feature.calls.call.CallPeer
import app.gagachat.feature.calls.call.CallSoundPlayer
import app.gagachat.feature.calls.call.LiveKitCallManager
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallConnectionTimeoutTest {
    @Test fun acceptedCallEndsWhenPeerNeverJoins() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val store = ViewModelStore()
        try {
            val calls = mockk<CallRepository>(relaxed = true)
            val auth = mockk<AuthRepository>()
            val conversations = mockk<ConversationRepository>()
            val manager = mockk<LiveKitCallManager>(relaxed = true)
            val signaling = mockk<CallSignalingCoordinator>(relaxed = true)
            val sound = mockk<CallSoundPlayer>(relaxed = true)
            every { calls.observeHistory() } returns flowOf(emptyList())
            every { auth.sessionFlow } returns MutableStateFlow(AuthSession("self", "token", "refresh", Long.MAX_VALUE))
            every { conversations.observeConversation(any()) } returns MutableStateFlow(null)
            every { manager.durationSeconds } returns MutableStateFlow(0L)
            every { manager.connection } returns MutableStateFlow(CallConnection.CONNECTED)
            every { manager.peers } returns MutableStateFlow(emptyList<CallPeer>())
            every { manager.isMicrophoneEnabled } returns MutableStateFlow(true)
            every { manager.isCameraEnabled } returns MutableStateFlow(false)
            every { manager.isSpeakerOn } returns MutableStateFlow(false)
            every { manager.callEnded } returns MutableSharedFlow<CallEndedInfo>()
            every { manager.audioDevices } returns MutableStateFlow(emptyList<AudioDeviceInfo>())
            every { manager.currentAudioDevice } returns MutableStateFlow<AudioDeviceInfo?>(null)
            every { manager.diagnostics } returns MutableStateFlow(CallDiagnostics())
            every { signaling.signals } returns MutableSharedFlow()
            coEvery { manager.connect(any(), any(), any(), any()) } returns true
            val vm = CallViewModel(calls, auth, conversations, manager, signaling, sound)
            store.put("call", vm)
            vm.prepareIncomingCall("chat", "call", false)
            runCurrent()
            vm.acceptCall()
            runCurrent()
            assertEquals(CallPhase.CONNECTING, vm.state.value.phase)
            advanceTimeBy(44_999L)
            runCurrent()
            assertEquals(CallPhase.CONNECTING, vm.state.value.phase)
            advanceTimeBy(1L)
            runCurrent()
            assertEquals(CallPhase.ENDED, vm.state.value.phase)
            verify { manager.disconnect() }
            coVerify { calls.endCall("call", CallStatus.FAILED, 0L) }
        } finally {
            store.clear()
            Dispatchers.resetMain()
        }
    }

    @Test fun failedMediaControlsKeepActualTrackState() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val store = ViewModelStore()
        try {
            val calls = mockk<CallRepository>(relaxed = true)
            val auth = mockk<AuthRepository>()
            val conversations = mockk<ConversationRepository>()
            val manager = mockk<LiveKitCallManager>(relaxed = true)
            val signaling = mockk<CallSignalingCoordinator>(relaxed = true)
            val sound = mockk<CallSoundPlayer>(relaxed = true)
            every { calls.observeHistory() } returns flowOf(emptyList())
            every { auth.sessionFlow } returns MutableStateFlow(AuthSession("self", "token", "refresh", Long.MAX_VALUE))
            every { conversations.observeConversation(any()) } returns MutableStateFlow(null)
            every { manager.durationSeconds } returns MutableStateFlow(0L)
            every { manager.connection } returns MutableStateFlow(CallConnection.CONNECTED)
            every { manager.peers } returns MutableStateFlow(emptyList<CallPeer>())
            every { manager.isMicrophoneEnabled } returns MutableStateFlow(true)
            every { manager.isCameraEnabled } returns MutableStateFlow(false)
            every { manager.isSpeakerOn } returns MutableStateFlow(false)
            every { manager.callEnded } returns MutableSharedFlow<CallEndedInfo>()
            every { manager.audioDevices } returns MutableStateFlow(emptyList<AudioDeviceInfo>())
            every { manager.currentAudioDevice } returns MutableStateFlow<AudioDeviceInfo?>(null)
            every { manager.diagnostics } returns MutableStateFlow(CallDiagnostics())
            every { signaling.signals } returns MutableSharedFlow()
            coEvery { manager.setMicrophoneEnabled(false) } returns false
            coEvery { manager.setCameraEnabled(true) } returns false
            every { manager.setSpeakerOn(true) } returns false
            val vm = CallViewModel(calls, auth, conversations, manager, signaling, sound)
            store.put("call", vm)
            vm.prepareIncomingCall("chat", "call", false)
            runCurrent()
            vm.toggleMute()
            runCurrent()
            assertEquals(false, vm.state.value.isMuted)
            org.junit.Assert.assertNotNull(vm.state.value.mediaNotice)
            vm.toggleVideo()
            runCurrent()
            assertEquals(false, vm.state.value.isVideoEnabled)
            org.junit.Assert.assertNotNull(vm.state.value.mediaNotice)
            vm.toggleSpeaker()
            assertEquals(false, vm.state.value.isSpeakerOn)
            org.junit.Assert.assertNotNull(vm.state.value.mediaNotice)
            coVerify(exactly = 1) { manager.setMicrophoneEnabled(false) }
            coVerify(exactly = 1) { manager.setCameraEnabled(true) }
            verify(exactly = 1) { manager.setSpeakerOn(true) }
        } finally {
            store.clear()
            Dispatchers.resetMain()
        }
    }
}
