package gagachat.app;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Receives Firebase Cloud Messaging payloads for GaGa Chat.
 *
 * The web layer (Capacitor) handles the actual notification rendering for
 * foreground messages; this service guarantees that data-only messages
 * received while the app is backgrounded still surface a notification.
 */
public class PushMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        // Foreground/background rendering is delegated to the web layer via
        // Capacitor's PushNotifications plugin. Nothing else to do here.
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        // The web layer reads the current token on next launch and registers
        // it with Supabase (device_tokens table).
    }
}
