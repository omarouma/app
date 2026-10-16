package app.gagachat.core.data.repository

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.database.dao.SavedPlaceDao
import app.gagachat.core.database.entity.SavedPlaceEntity
import app.gagachat.core.network.session.AuthSession
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SavedPlacesRepositoryTest {
    private val dao = mockk<SavedPlaceDao>(relaxed = true)
    private val auth = mockk<AuthRepository>()
    private val dispatchers = object : DispatcherProvider {
        override val main = Dispatchers.Unconfined
        override val io = Dispatchers.Unconfined
        override val default = Dispatchers.Unconfined
        override val computation = Dispatchers.Unconfined
    }

    private fun repository(session: AuthSession?): DefaultSavedPlacesRepository {
        every { auth.sessionFlow } returns MutableStateFlow(session)
        return DefaultSavedPlacesRepository(dao, auth, dispatchers)
    }

    private val signedIn = AuthSession("owner-1", "token", "refresh", Long.MAX_VALUE)

    @Test fun observeReturnsEmptyWhenSignedOut() = runTest {
        val repo = repository(null)
        assertTrue(repo.observeSavedPlaces().first().isEmpty())
    }

    @Test fun observeMapsRowsFromDaoForTheCurrentOwner() = runTest {
        every { dao.observeByOwner("owner-1") } returns flowOf(
            listOf(SavedPlaceEntity("owner-1", "id-1", "Cafe", "Main St", 1.5, 2.5, 100L)),
        )
        val places = repository(signedIn).observeSavedPlaces().first()
        assertEquals(1, places.size)
        assertEquals("Cafe", places.first().label)
        assertEquals(1.5, places.first().latitude, 0.0)
    }

    @Test fun saveIsScopedToOwnerAndTrimsInput() = runTest {
        val captured = slot<SavedPlaceEntity>()
        coEvery { dao.upsert(capture(captured)) } returns Unit
        val saved = repository(signedIn).save("  Home  ", "  My street  ", 10.0, 20.0)
        assertEquals("owner-1", captured.captured.ownerId)
        assertEquals("Home", captured.captured.label)
        assertEquals("My street", captured.captured.detail)
        assertEquals(10.0, saved!!.latitude, 0.0)
        assertTrue(saved.id.isNotBlank())
    }

    @Test fun saveFallsBackToDefaultLabelAndIsNullWhenSignedOut() = runTest {
        coEvery { dao.upsert(any()) } returns Unit
        val blank = repository(signedIn).save("   ", "", 0.0, 0.0)
        assertEquals("Saved place", blank!!.label)
        assertNull(repository(null).save("Home", "", 0.0, 0.0))
    }

    @Test fun deleteIsScopedToOwnerAndNoOpWhenSignedOut() = runTest {
        repository(signedIn).delete("id-9")
        coVerify { dao.delete("owner-1", "id-9") }
        repository(null).delete("id-9")
        coVerify(exactly = 1) { dao.delete(any(), any()) }
    }
}
