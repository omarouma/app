package gagachat.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

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
