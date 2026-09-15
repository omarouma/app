package app.gagachat.mobile.realtime

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import app.gagachat.mobile.prefs.AppPrefs

/** m-05: reconnect after boot if a session exists */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED && AppPrefs.hasSession(ctx)) {
            // Target API 35+ forbids dataSync foreground-service starts at boot.
            app.gagachat.mobile.firebase.PushTokenRegistrar.refreshAndRegister()
        }
    }
}
