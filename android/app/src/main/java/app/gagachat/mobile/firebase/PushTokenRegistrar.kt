package app.gagachat.mobile.firebase

import android.os.Build
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.prefs.SessionStore
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject

object PushTokenRegistrar {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun refreshAndRegister() {
        if (!SessionStore.isLoggedIn()) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token -> register(token) }
    }

    fun register(token: String) {
        if (token.isBlank() || !SessionStore.isLoggedIn()) return
        scope.launch {
            runCatching {
                Api.post("/devices", JSONObject()
                    .put("platform", "android")
                    .put("push_token", token)
                    .put("device_name", "${Build.MANUFACTURER} ${Build.MODEL}".trim()))
            }
        }
    }
}
