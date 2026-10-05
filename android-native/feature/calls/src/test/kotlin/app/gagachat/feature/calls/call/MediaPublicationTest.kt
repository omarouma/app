package app.gagachat.feature.calls.call

import android.content.Context
import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.network.rest.SupabaseRestApi
import io.livekit.android.room.Room
import io.livekit.android.room.participant.LocalParticipant
import io.mockk.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MediaPublicationTest {
    @Test fun failedMicrophonePublicationCannotBecomeConnectedAudio() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val local = mockk<LocalParticipant>()
            val room = mockk<Room>()
            every { room.localParticipant } returns local
            coEvery { local.setMicrophoneEnabled(true) } returns false
            val manager = LiveKitCallManager(mockk<Context>(), mockk<AppLogger>(relaxed = true), mockk<SupabaseRestApi>())
            assertFalse(manager.publishInitialTracks(room, true))
            assertFalse(manager.isMicrophoneEnabled.value)
            assertNotNull(manager.lastError)
            coVerify(exactly = 0) { local.setCameraEnabled(any()) }
        } finally { Dispatchers.resetMain() }
    }
    @Test fun failedCameraKeepsWorkingAudioAndReportsFallback() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val local = mockk<LocalParticipant>()
            val room = mockk<Room>()
            every { room.localParticipant } returns local
            coEvery { local.setMicrophoneEnabled(true) } returns true
            coEvery { local.setCameraEnabled(true) } returns false
            val manager = LiveKitCallManager(mockk<Context>(), mockk<AppLogger>(relaxed = true), mockk<SupabaseRestApi>())
            assertTrue(manager.publishInitialTracks(room, true))
            assertTrue(manager.isMicrophoneEnabled.value)
            assertFalse(manager.isCameraEnabled.value)
            assertTrue(manager.lastError!!.contains("audio only"))
        } finally { Dispatchers.resetMain() }
    }
}
