package app.gagachat.mobile

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.prefs.AppPrefs
import app.gagachat.mobile.realtime.GaGaService
import app.gagachat.mobile.firebase.PushTokenRegistrar
import com.google.firebase.FirebaseApp
import coil.ImageLoader
import coil.ImageLoaderFactory

class GaGaApp : Application(), ImageLoaderFactory {

    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .okHttpClient(Api.mediaClient())
        .diskCache(null) // private media must not survive account changes in a shared cache
        .memoryCache(null)
        .build()

    override fun onCreate() {
        super.onCreate()
        instance = this
        FirebaseApp.initializeApp(this)
        createChannels()
        applyTheme()
        applyLocale()
        AppPrefs.beginForegroundTracking()
        // C-01: apply any saved server override before anything talks to the API
        Api.baseUrl = AppPrefs.apiBase(this)
        // C-02: start persistent connection service if a session exists
        if (AppPrefs.hasSession(this)) {
            PushTokenRegistrar.refreshAndRegister()
            app.gagachat.mobile.realtime.MessageOutboxWorker.schedule(this)
        }
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(GaGaService.CHANNEL_MESSAGES, getString(R.string.channel_messages), NotificationManager.IMPORTANCE_HIGH)
                .apply { description = getString(R.string.channel_messages) }
        )
        nm.createNotificationChannel(
            NotificationChannel(GaGaService.CHANNEL_CALLS, getString(R.string.channel_calls), NotificationManager.IMPORTANCE_HIGH)
                .apply {
                    description = getString(R.string.channel_calls)
                    setSound(null, null) // IncomingCallActivity plays its own ringtone
                }
        )
        nm.createNotificationChannel(
            NotificationChannel(GaGaService.CHANNEL_SERVICE, getString(R.string.channel_service), NotificationManager.IMPORTANCE_MIN)
                .apply { description = getString(R.string.channel_service) }
        )
    }

    private fun applyTheme() {
        AppCompatDelegate.setDefaultNightMode(
            when (AppPrefs.theme(this)) {
                AppPrefs.THEME_LIGHT -> AppCompatDelegate.MODE_NIGHT_NO
                AppPrefs.THEME_DARK -> AppCompatDelegate.MODE_NIGHT_YES
                else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
            }
        )
    }

    private fun applyLocale() {
        val saved = AppPrefs.locale(this)
        if (saved != null) {
            try {
                AppCompatDelegate.setApplicationLocales(
                    LocaleListCompat.forLanguageTags(saved)
                )
            } catch (_: Exception) { }
        }
    }

    companion object {
        lateinit var instance: GaGaApp
            private set
        fun ctx(): Context = instance
    }
}
