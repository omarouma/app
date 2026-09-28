package app.gagachat.core.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.onboardingDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "gaga_onboarding",
)

/**
 * Persists **per-account** profile-setup completion (Master Spec §C — onboarding
 * gate).
 *
 * This used to be a single install-wide flag, which caused the profile-setup
 * screen to appear on *every* login (and for returning users on a fresh
 * install). Profile setup must run **only once, for a newly created account**,
 * so the completion state is now keyed by the signed-in user id.
 *
 * The stored value is tri-state:
 *  - `true`  → this account has finished profile setup; never show it again.
 *  - `false` → this account is a brand-new sign-up that still needs setup.
 *  - `null`  → unknown (e.g. a session restored on a fresh install). The app
 *              resolves this by checking whether the account already has a
 *              profile on the backend (see [app.gagachat.navigation.AppViewModel]).
 *
 * Stored in a dedicated DataStore so it survives process death and is read
 * asynchronously without blocking the first frame. It is intentionally separate
 * from the encrypted session store because it is not sensitive.
 */
@Singleton
class OnboardingPreferences @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private fun keyFor(userId: String) = booleanPreferencesKey("onboarding_completed_$userId")

    /** Emits the tri-state completion status for [userId] (null = unknown). */
    fun status(userId: String): Flow<Boolean?> = context.onboardingDataStore.data.map { prefs ->
        prefs[keyFor(userId)]
    }

    /** Marks profile setup as done for [userId] so it never shows again. */
    suspend fun markCompleted(userId: String) {
        if (userId.isBlank()) return
        context.onboardingDataStore.edit { prefs -> prefs[keyFor(userId)] = true }
    }

    /**
     * Marks [userId] as a freshly-created account that still needs profile setup.
     * Called on sign-up / OTP verification so the gate shows setup exactly once.
     */
    suspend fun markPending(userId: String) {
        if (userId.isBlank()) return
        context.onboardingDataStore.edit { prefs -> prefs[keyFor(userId)] = false }
    }

    /** Forgets any stored status for [userId] (used when an account is deleted). */
    suspend fun clear(userId: String) {
        if (userId.isBlank()) return
        context.onboardingDataStore.edit { prefs -> prefs.remove(keyFor(userId)) }
    }
}
