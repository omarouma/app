package gagachat.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** High-importance channel for incoming-call rings (heads-up + sound). */
    public static final String CHANNEL_CALLS = "gaga_calls";
    /** Default-importance channel for chat messages. */
    public static final String CHANNEL_MESSAGES = "gaga_messages";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();
        registerNativeBridge();
    }

    /**
     * Exposes a tiny native bridge to the web layer as `window.GaGaNative`.
     * Currently used to open the OS app-settings screen so the user can grant a
     * permission that was permanently denied (the WebView cannot re-prompt once
     * "Don't ask again" has been chosen).
     */
    private void registerNativeBridge() {
        try {
            WebView webView = this.bridge.getWebView();
            if (webView != null) {
                webView.addJavascriptInterface(new GaGaNative(), "GaGaNative");
            }
        } catch (Exception ignored) {
            // Non-fatal: the web layer falls back to a toast if the bridge is absent.
        }
    }

    /** Native methods callable from JavaScript via window.GaGaNative.* */
    public class GaGaNative {
        @JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    intent.setData(Uri.fromParts("package", getPackageName(), null));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception ignored) {
                    // Nothing else we can do; the user can open Settings manually.
                }
            });
        }
    }

    /**
     * Creates the app's notification channels. FCM messages reference these by
     * id (see the `send-push` Edge Function) so incoming calls can ring with
     * high priority while messages stay quiet.
     */
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        // ── Calls: high importance, ringtone, vibration ──
        if (manager.getNotificationChannel(CHANNEL_CALLS) == null) {
            NotificationChannel calls = new NotificationChannel(
                    CHANNEL_CALLS,
                    "Incoming calls",
                    NotificationManager.IMPORTANCE_HIGH);
            calls.setDescription("Incoming voice and video call alerts");
            calls.enableVibration(true);
            calls.setVibrationPattern(new long[]{800, 400, 800, 400, 800});
            Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            calls.setSound(ringtone, attrs);
            calls.setBypassDnd(true);
            calls.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(calls);
        }

        // ── Messages: default importance, notification sound ──
        if (manager.getNotificationChannel(CHANNEL_MESSAGES) == null) {
            NotificationChannel messages = new NotificationChannel(
                    CHANNEL_MESSAGES,
                    "Messages",
                    NotificationManager.IMPORTANCE_DEFAULT);
            messages.setDescription("New chat message alerts");
            messages.enableVibration(true);
            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            messages.setSound(sound, null);
            manager.createNotificationChannel(messages);
        }
    }
}
