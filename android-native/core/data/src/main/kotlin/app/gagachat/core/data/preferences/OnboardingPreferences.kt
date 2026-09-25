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
 * Persists first-run onboarding completion (Master Spec §C — onboarding gate).
 *
 * Stored in a dedicated DataStore so the flag survives process death and is read
 * asynchronously without blocking the first frame. It is intentionally separate
 * from the encrypted session store because it is not sensitive.
 */
@Singleton
class OnboardingPreferences @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val completedKey = booleanPreferencesKey("onboarding_completed")

    /** Emits whether onboarding has been completed for this install. */
    val completed: Flow<Boolean> = context.onboardingDataStore.data.map { prefs ->
        prefs[completedKey] ?: false
    }

    suspend fun markCompleted() {
        context.onboardingDataStore.edit { prefs -> prefs[completedKey] = true }
    }

    suspend fun reset() {
        context.onboardingDataStore.edit { prefs -> prefs[completedKey] = false }
    }
}
