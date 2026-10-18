# GaGa 2.8.14 audit and improvements

Shared light/dark surface containers, tint and semantic error colors now use the GaGa palette. Normal text and input outline contrast have emulator regression checks. Adaptive launcher/monochrome assets and the single-color notification icon were present and retained.

Login/registration suppress duplicate submissions, disable fields during requests, support keyboard Next/Done, and preserve coroutine cancellation. Existing email/password and passwordless flows remain the available providers. Public live signup, password login, refresh-token exchange, wallet initialization and logout passed against an isolated temporary .invalid account; no real user was contacted.

Message, general/security, incoming-call and missed-call notifications use a redacted public preview. Existing channel IDs and user choices remain intact. Foreground message sounds skip silent/vibrate and DND modes and suppress bursts within 800 ms. Notification permission and channel-block gates already existed. Real FCM delivery, OEM background behavior, call audio, lock-screen settings and battery-management behavior still require physical-device checks.

Update checks ignore overlapping refreshes and clear stale offers while checking/failing. Direct-APK guidance explains browser download, Android confirmation and preserving local data by updating without uninstalling. Play remains system-managed. Existing approved signing identity is required for the new candidate; hardware upgrade preservation is not claimed as tested.

No authentication-provider settings, user balances or notification-channel sound preferences were changed on the backend. Password-reset email delivery and verification require a real mailbox and are not certified by the .invalid test.
