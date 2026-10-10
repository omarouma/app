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

private val Context.introDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "gaga_intro",
)

/**
 * Persists **install-wide** first-run marketing state (Master Spec §C — startup
 * journey).
 *
 * Unlike [OnboardingPreferences] (which is keyed per account because profile
 * setup must run once per *account*), the Welcome and Introduction screens are a
 * property of the *installation*: they introduce the product to someone who has
 * never opened GaGa before. They must therefore:
 *  - show on the very first launch, before any account exists, and
 *  - never show again once the user has passed them (even if they later sign
 *    out or create another account).
 *
 * Two independent flags are stored so the flow can be resumed at the right
 * point: a user who saw the Welcome screen but killed the app before the tour
 * lands back on the Introduction, not the Welcome.
 *
 * Stored in a dedicated, non-sensitive DataStore so it survives process death
 * and is read asynchronously without blocking the first frame.
 */
@Singleton
class AppIntroPreferences @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val welcomeSeenKey = booleanPreferencesKey("welcome_seen")
    private val tourSeenKey = booleanPreferencesKey("tour_seen")

    /** Emits whether the Welcome (marketing) screen has already been shown. */
    val welcomeSeen: Flow<Boolean> = context.introDataStore.data.map { prefs ->
        prefs[welcomeSeenKey] ?: false
    }

    /** Emits whether the Introduction (feature tour) has already been shown. */
    val tourSeen: Flow<Boolean> = context.introDataStore.data.map { prefs ->
        prefs[tourSeenKey] ?: false
    }

    /** Records that the Welcome screen was shown, so it never reappears. */
    suspend fun markWelcomeSeen() {
        context.introDataStore.edit { prefs -> prefs[welcomeSeenKey] = true }
    }

    /** Records that the Introduction tour was shown, so it never reappears. */
    suspend fun markTourSeen() {
        context.introDataStore.edit { prefs -> prefs[tourSeenKey] = true }
    }

    /**
     * Records that the whole pre-auth intro was passed in one shot. Used by the
     * "Skip" affordances so a single tap clears both flags.
     */
    suspend fun markIntroComplete() {
        context.introDataStore.edit { prefs ->
            prefs[welcomeSeenKey] = true
            prefs[tourSeenKey] = true
        }
    }

    /** Forgets the intro state (used by a full "reset onboarding" debug action). */
    suspend fun clear() {
        context.introDataStore.edit { prefs ->
            prefs.remove(welcomeSeenKey)
            prefs.remove(tourSeenKey)
        }
    }
}
