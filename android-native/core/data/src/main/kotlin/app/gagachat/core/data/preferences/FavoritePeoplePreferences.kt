package app.gagachat.core.data.preferences

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.favoritePeopleStore by preferencesDataStore(name = "gaga_favorite_people")

/** Favorites are device preferences, separated by the signed-in account. */
@Singleton
class FavoritePeoplePreferences @Inject constructor(@ApplicationContext private val context: Context) {
    fun observe(owner: String): Flow<Set<String>> = context.favoritePeopleStore.data.map {
        if (owner.isBlank()) emptySet() else it[stringSetPreferencesKey("people_$owner")] ?: emptySet()
    }

    suspend fun setFavorite(owner: String, user: String, favorite: Boolean) {
        require(owner.isNotBlank() && user.isNotBlank())
        val key = stringSetPreferencesKey("people_$owner")
        context.favoritePeopleStore.edit { prefs ->
            val current = prefs[key] ?: emptySet()
            prefs[key] = if (favorite) current + user else current - user
        }
    }
}
