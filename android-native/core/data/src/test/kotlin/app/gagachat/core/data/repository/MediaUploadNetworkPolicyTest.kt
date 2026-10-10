package app.gagachat.core.data.repository

import android.content.Context
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.network.NetworkMonitor
import app.gagachat.core.common.util.IdGenerator
import app.gagachat.core.common.util.TimeProvider
import app.gagachat.core.data.preferences.SettingsCenterPreferences
import app.gagachat.core.database.dao.MessageDao
import app.gagachat.core.database.dao.UploadDao
import app.gagachat.core.network.storage.SupabaseStorageApi
import app.gagachat.sync.outbox.OutboxScheduler
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Test

/**
 * Data & Storage policy consumer (Master Spec §8 — "Upload media on Wi-Fi only"
 * and "Data saver"). When the user opted to avoid metered data and the active
 * network is metered, the durable upload queue must be left untouched; otherwise
 * the queue drains normally.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MediaUploadNetworkPolicyTest {

    private fun dispatchers(d: CoroutineDispatcher) = object : DispatcherProvider {
        override val main = d
        override val io = d
        override val default = d
        override val computation = d
    }

    private fun repo(
        settingsCenter: SettingsCenterPreferences,
        networkMonitor: NetworkMonitor,
        uploadDao: UploadDao,
        scope: CoroutineScope,
        d: CoroutineDispatcher,
    ) = DefaultMediaRepository(
        context = mockk<Context>(relaxed = true),
        messageDao = mockk<MessageDao>(relaxed = true),
        uploadDao = uploadDao,
        storageApi = mockk<SupabaseStorageApi>(relaxed = true),
        messageRepository = mockk<MessageRepository>(relaxed = true),
        idGenerator = mockk<IdGenerator>(relaxed = true),
        timeProvider = mockk<TimeProvider>(relaxed = true),
        dispatchers = dispatchers(d),
        outboxScheduler = mockk<OutboxScheduler>(relaxed = true),
        settingsCenter = settingsCenter,
        networkMonitor = networkMonitor,
        applicationScope = scope,
    )

    @Test
    fun `metered network with wifi-only policy leaves the queue untouched`() = runTest {
        val d = UnconfinedTestDispatcher(testScheduler)
        val settingsCenter = mockk<SettingsCenterPreferences>()
        coEvery { settingsCenter.shouldDeferMediaUpload(any()) } returns true
        val networkMonitor = mockk<NetworkMonitor>()
        every { networkMonitor.isCurrentlyMetered() } returns true
        val uploadDao = mockk<UploadDao>(relaxed = true)

        repo(settingsCenter, networkMonitor, uploadDao, this, d).processQueue()

        coVerify(exactly = 0) { uploadDao.getQueued() }
    }

    @Test
    fun `unmetered network drains the queue`() = runTest {
        val d = UnconfinedTestDispatcher(testScheduler)
        val settingsCenter = mockk<SettingsCenterPreferences>()
        coEvery { settingsCenter.shouldDeferMediaUpload(any()) } returns false
        val networkMonitor = mockk<NetworkMonitor>()
        every { networkMonitor.isCurrentlyMetered() } returns false
        val uploadDao = mockk<UploadDao>(relaxed = true)
        coEvery { uploadDao.getQueued() } returns emptyList()

        repo(settingsCenter, networkMonitor, uploadDao, this, d).processQueue()

        // drainQueue() reads the queue at least once (start-of-drain + the
        // end-of-drain "pending retry" guard). The important contract is that
        // the queue IS consulted (i.e. not short-circuited by the policy).
        coVerify(atLeast = 1) { uploadDao.getQueued() }
    }
}
