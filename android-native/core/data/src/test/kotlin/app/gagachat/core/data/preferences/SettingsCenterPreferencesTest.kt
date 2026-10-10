package app.gagachat.core.data.preferences

import app.gagachat.core.model.AccountPrivacy
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Settings Center functional contract (Master Spec §8 —
 * `Preference → Storage → Functional Consumer → Backend Enforcement → Test`).
 *
 * Proves that (a) every typed accessor has the same default the UI declares,
 * (b) the privacy/discovery controls are written to the *server-enforced*
 * account policy as well as the local store, and (c) the media-upload data
 * policy defers only when it should.
 */
class SettingsCenterPreferencesTest {

    private class FakeToggleStore : SettingsToggleStore {
        private val t = MutableStateFlow<Map<String, Boolean>>(emptyMap())
        private val c = MutableStateFlow<Map<String, String>>(emptyMap())
        override val toggles: Flow<Map<String, Boolean>> = t
        override val choices: Flow<Map<String, String>> = c
        override suspend fun setToggle(key: String, value: Boolean) { t.update { it + (key to value) } }
        override suspend fun setChoice(key: String, value: String) { c.update { it + (key to value) } }
        override suspend fun resetAll() { t.value = emptyMap(); c.value = emptyMap() }
    }

    private class FakePrivacy(
        initial: AccountPrivacy = AccountPrivacy(),
        private val failWrites: Boolean = false,
    ) : AccountPrivacyController {
        val state = MutableStateFlow(initial)
        val patches = mutableListOf<JsonObject>()
        var refreshes = 0
        override val accountPrivacy: Flow<AccountPrivacy> = state
        override suspend fun refreshAccountPrivacy() { refreshes++ }
        override suspend fun savePrivacy(patch: JsonObject) {
            if (failWrites) error("network down")
            patches += patch
        }
    }

    private fun facade(store: SettingsToggleStore, privacy: AccountPrivacyController) =
        SettingsCenterPreferences(store, privacy)

    @Test
    fun `defaults match the Settings Center declarations`() = runTest {
        val f = facade(FakeToggleStore(), FakePrivacy())
        assertTrue(f.searchableUsername.first())
        assertFalse(f.searchablePhone.first())
        assertFalse(f.searchableEmail.first())
        assertTrue(f.typingIndicator.first())
        assertFalse(f.priorityRecommendations.first())
        assertTrue(f.enterToSend.first())
        assertTrue(f.linkPreviews.first())
        assertFalse(f.saveToGallery.first())
        assertTrue(f.wifiOnlyUploads.first())
        assertFalse(f.dataSaver.first())
    }

    @Test
    fun `discovery toggles write the local store and the server field`() = runTest {
        val store = FakeToggleStore()
        val privacy = FakePrivacy()
        val f = facade(store, privacy)

        f.setSearchableUsername(false)
        f.setSearchablePhone(true)
        f.setSearchableEmail(true)

        assertFalse(f.searchableUsername.first())
        assertTrue(f.searchablePhone.first())
        assertTrue(f.searchableEmail.first())

        assertEquals(3, privacy.patches.size)
        assertFalse(privacy.patches[0]["discover_id"]!!.jsonPrimitive.boolean)
        assertTrue(privacy.patches[1]["discover_phone"]!!.jsonPrimitive.boolean)
        assertTrue(privacy.patches[2]["discover_email"]!!.jsonPrimitive.boolean)
    }

    @Test
    fun `typing and recommendation toggles enforce on the server`() = runTest {
        val privacy = FakePrivacy()
        val f = facade(FakeToggleStore(), privacy)

        f.setTypingIndicator(false)
        f.setPriorityRecommendations(true)

        assertFalse(f.typingIndicator.first())
        assertTrue(f.priorityRecommendations.first())
        assertFalse(privacy.patches[0]["typing_indicator"]!!.jsonPrimitive.boolean)
        assertTrue(privacy.patches[1]["recommendations"]!!.jsonPrimitive.boolean)
    }

    @Test
    fun `seed mirrors the authoritative server policy into the local store`() = runTest {
        val privacy = FakePrivacy(
            AccountPrivacy(
                discoverId = false,
                discoverPhone = true,
                discoverEmail = true,
                typingIndicator = false,
                recommendations = true,
            ),
        )
        val f = facade(FakeToggleStore(), privacy)

        f.seedDiscoveryFromServer()

        assertFalse(f.searchableUsername.first())
        assertTrue(f.searchablePhone.first())
        assertTrue(f.searchableEmail.first())
        assertFalse(f.typingIndicator.first())
        assertTrue(f.priorityRecommendations.first())
        assertEquals(1, privacy.refreshes)
    }

    @Test
    fun `server write failure is non-fatal and keeps the local value`() = runTest {
        val f = facade(FakeToggleStore(), FakePrivacy(failWrites = true))
        f.setSearchablePhone(true)
        assertTrue(f.searchablePhone.first())
    }

    @Test
    fun `media upload defers only when metered and a data policy is on`() = runTest {
        val f = facade(FakeToggleStore(), FakePrivacy())

        // `network.wifiOnlyUploads` defaults ON (matches the UI declaration), so a
        // metered connection defers immediately; an unmetered one never does.
        assertTrue(f.shouldDeferMediaUpload(isMetered = true))
        assertFalse(f.shouldDeferMediaUpload(isMetered = false))

        // Turning both data policies off lets uploads proceed on any connection.
        f.setWifiOnlyUploads(false)
        assertFalse(f.shouldDeferMediaUpload(isMetered = true))
        assertFalse(f.shouldDeferMediaUpload(isMetered = false))

        // Data saver alone re-enables deferral on metered networks.
        f.setDataSaver(true)
        assertTrue(f.shouldDeferMediaUpload(isMetered = true))
        assertFalse(f.shouldDeferMediaUpload(isMetered = false))
    }
}
