package gagachat.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;

/**
 * GaGa Chat application entry point.
 *
 * Creates the notification channels used by Firebase Cloud Messaging and the
 * in-app call/message notifications. Channels are created once at startup so
 * that notifications posted from a background service always have a valid
 * target channel.
 */
public class GaGaApplication extends android.app.Application {

    public static final String CHANNEL_MESSAGES = "gaga_messages";
    public static final String CHANNEL_CALLS = "gaga_calls";
    public static final String CHANNEL_DEFAULT = "gaga_default";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel messages = new NotificationChannel(
                CHANNEL_MESSAGES,
                getString(R.string.channel_messages),
                NotificationManager.IMPORTANCE_HIGH);
        messages.setDescription(getString(R.string.channel_messages_desc));
        messages.enableVibration(true);
        manager.createNotificationChannel(messages);

        NotificationChannel calls = new NotificationChannel(
                CHANNEL_CALLS,
                getString(R.string.channel_calls),
                NotificationManager.IMPORTANCE_HIGH);
        calls.setDescription(getString(R.string.channel_calls_desc));
        calls.enableVibration(true);
        calls.setBypassDnd(true);
        manager.createNotificationChannel(calls);

        NotificationChannel def = new NotificationChannel(
                CHANNEL_DEFAULT,
                getString(R.string.channel_default),
                NotificationManager.IMPORTANCE_DEFAULT);
        def.setDescription(getString(R.string.channel_default_desc));
        manager.createNotificationChannel(def);
    }
}
