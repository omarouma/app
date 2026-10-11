package app.gagachat.core.data.preferences

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import app.gagachat.core.network.rest.SupabaseRestApi
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.favoritePeopleStore by preferencesDataStore(name = "gaga_favorite_people")

/**
 * Favorites are ACCOUNT-owned. DataStore is the offline display cache and the
 * authenticated favorite_friends RLS table is authoritative.
 *
 * Do not silently retain a local-only "success" when the server rejects writes:
 * another signed-in device would never observe it.
 */
@Singleton
class FavoritePeoplePreferences @Inject constructor(
    @ApplicationContext private val context: Context,
    private val restApi: SupabaseRestApi,
) {
    fun observe(owner: String): Flow<Set<String>> = context.favoritePeopleStore.data.map {
        if (owner.isBlank()) emptySet() else it[stringSetPreferencesKey("people_$owner")] ?: emptySet()
    }

    suspend fun refreshFromServer(owner: String) {
        require(owner.isNotBlank())
        val synced = restApi.getFavoriteFriendIds(owner)
        context.favoritePeopleStore.edit { it[stringSetPreferencesKey("people_$owner")] = synced }
    }

    suspend fun setFavorite(owner: String, user: String, favorite: Boolean) {
        require(owner.isNotBlank() && user.isNotBlank() && owner != user)
        // Server write happens first. On conflict/403/network failure the
        // observable cached state stays intact, and People shows a retry notice.
        restApi.setFavoriteFriend(owner, user, favorite)
        val key = stringSetPreferencesKey("people_$owner")
        context.favoritePeopleStore.edit { prefs ->
            val current = prefs[key] ?: emptySet()
            prefs[key] = if (favorite) current + user else current - user
        }
    }
}
