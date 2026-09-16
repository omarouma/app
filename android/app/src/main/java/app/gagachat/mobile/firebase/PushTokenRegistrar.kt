package app.gagachat.mobile.firebase

import app.gagachat.mobile.GaGaApp
import app.gagachat.mobile.prefs.SessionStore

object PushTokenRegistrar {
    fun refreshAndRegister() {
        if (!SessionStore.isLoggedIn()) return
        PushRegistrationWorker.schedule(GaGaApp.ctx())
    }

    fun register(token: String) {
        if (token.isBlank() || !SessionStore.isLoggedIn()) return
        PushRegistrationWorker.schedule(GaGaApp.ctx())
    }
}
