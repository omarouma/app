package app.gagachat.core.data.preferences

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.callHistoryStore by preferencesDataStore(name = "gaga_hidden_calls")

/** Local removal survives sync without deleting the other participant's history. */
@Singleton
class CallHistoryPreferences @Inject constructor(@ApplicationContext private val context: Context) {
    fun observe(owner: String): Flow<Set<String>> = context.callHistoryStore.data.map {
        if (owner.isBlank()) emptySet() else it[stringSetPreferencesKey("hidden_$owner")] ?: emptySet()
    }
    suspend fun hidden(owner: String): Set<String> = observe(owner).first()
    suspend fun hide(owner: String, ids: Set<String>) {
        require(owner.isNotBlank())
        val key = stringSetPreferencesKey("hidden_$owner")
        context.callHistoryStore.edit { it[key] = (it[key] ?: emptySet()) + ids }
    }
}
