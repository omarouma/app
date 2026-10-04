package app.gagachat.core.common.system

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings

/**
 * Helper for the "ignore battery optimizations" exemption (Master Spec §8 —
 * real calling).
 *
 * A calling app must be allowed to wake the device and post a full-screen
 * incoming-call notification even when the screen is off or the app has been
 * idle for a while. Without the exemption, Doze / App Standby defers the FCM
 * push that carries the ZEGO call invite, so the phone only rings once the user
 * next opens the app — which is exactly the "call never connects" symptom.
 *
 * The exemption is a *settings* grant, not a runtime permission, so it is
 * requested through an [Intent] rather than `requestPermissions`.
 */
object BatteryOptimization {

    /**
     * True when the app is already exempt from battery optimizations. Defaults to
     * `true` when [PowerManager] is unavailable so we never nag on devices that
     * do not implement the check.
     */
    fun isIgnoring(context: Context): Boolean {
        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return true
        return power.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * Opens the system dialog asking the user to exempt the app from battery
     * optimizations. Falls back to the battery-optimization settings list on
     * devices/OEMs that do not support the direct request.
     */
    @SuppressLint("BatteryLife")
    fun request(context: Context) {
        val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            .setData(Uri.fromParts("package", context.packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(direct) }
            .onFailure { runCatching { context.startActivity(fallback) } }
    }
}
