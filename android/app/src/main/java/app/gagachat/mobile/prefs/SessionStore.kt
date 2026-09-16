package app.gagachat.mobile.prefs

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import app.gagachat.mobile.GaGaApp
import org.json.JSONArray
import org.json.JSONObject

/**
 * C-06: session storage in EncryptedSharedPreferences only.
 * Plain SharedPreferences/Memory never hold tokens.
 */
object SessionStore {

    private const val FILE = "gaga_session"

    @Volatile private var cached: SharedPreferences? = null

    private fun prefs(ctx: Context): SharedPreferences {
        cached?.let { return it }
        synchronized(this) {
            cached?.let { return it }
            val masterKey = MasterKey.Builder(ctx)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            val p = EncryptedSharedPreferences.create(
                ctx, FILE, masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
            cached = p
            return p
        }
    }

    // ---------- token pair ----------
    var token: String?
        get() = prefs(GaGaApp.ctx()).getString("token", null)
        private set(v) { prefs(GaGaApp.ctx()).edit().putString("token", v).apply() }

    var refreshToken: String?
        get() = prefs(GaGaApp.ctx()).getString("refresh_token", null)
        private set(v) { prefs(GaGaApp.ctx()).edit().putString("refresh_token", v).apply() }

    var me: String?   // JSON of the user object
        get() = prefs(GaGaApp.ctx()).getString("me", null)
        private set(v) { prefs(GaGaApp.ctx()).edit().putString("me", v).apply() }

    @Synchronized fun save(ctx: Context, token: String?, refreshToken: String?, meJson: String?) {
        check(prefs(ctx).edit()
            .putString("token", token)
            .putString("refresh_token", refreshToken)
            .putString("me", meJson)
            .commit()) { "Could not persist session" }
        cached = prefs(ctx)
    }

    @Synchronized fun clear() {
        prefs(GaGaApp.ctx()).edit().clear().commit()
    }

    fun isLoggedIn(): Boolean = !token.isNullOrBlank()

    /** Encrypted, crash-safe text outbox. Server-side client_message_id makes retries idempotent. */
    @Synchronized fun enqueueText(chatId:String, text:String, clientId:String) {
        val all=runCatching { JSONArray(prefs(GaGaApp.ctx()).getString("message_outbox","[]")) }.getOrDefault(JSONArray())
        if((0 until all.length()).any { all.optJSONObject(it)?.optString("client_id")==clientId }) return
        all.put(JSONObject().put("chat_id",chatId).put("text",text).put("client_id",clientId).put("created_at",System.currentTimeMillis()))
        check(prefs(GaGaApp.ctx()).edit().putString("message_outbox",all.toString()).commit()) {
            "Could not queue message for retry"
        }
    }

    @Synchronized fun pendingTexts():List<JSONObject> {
        val all=runCatching { JSONArray(prefs(GaGaApp.ctx()).getString("message_outbox","[]")) }.getOrDefault(JSONArray())
        return (0 until all.length()).mapNotNull { all.optJSONObject(it) }
    }

    @Synchronized fun pendingTexts(chatId:String):List<JSONObject> {
        val all=runCatching { JSONArray(prefs(GaGaApp.ctx()).getString("message_outbox","[]")) }.getOrDefault(JSONArray())
        return (0 until all.length()).mapNotNull { all.optJSONObject(it) }.filter { it.optString("chat_id")==chatId }
    }

    @Synchronized fun removePendingText(clientId:String) {
        val all=runCatching { JSONArray(prefs(GaGaApp.ctx()).getString("message_outbox","[]")) }.getOrDefault(JSONArray())
        val kept=JSONArray(); for(i in 0 until all.length()) all.optJSONObject(i)?.let { if(it.optString("client_id")!=clientId) kept.put(it) }
        check(prefs(GaGaApp.ctx()).edit().putString("message_outbox",kept.toString()).commit()) {
            "Could not confirm message delivery in outbox"
        }
    }
}
