# ─────────────────────────────────────────────────────────────────────────────
# GaGa Chat — R8 / ProGuard rules
#
# The release build enables minification + resource shrinking. Without explicit
# keep rules, R8 strips classes that are only referenced reflectively (Capacitor
# plugins, Firebase, WebView JS bridges) which causes an immediate crash on
# launch. These rules keep everything the native shell needs at runtime.
# ─────────────────────────────────────────────────────────────────────────────

# Keep line numbers for readable crash reports (upload mapping to Play Console).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-keepattributes *Annotation*, InnerClasses, Signature, EnclosingMethod

# ── Capacitor core + plugins ────────────────────────────────────────────────
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep public class * extends com.getcapacitor.BridgeActivity { *; }
-keep public class * extends com.getcapacitor.Bridge { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keep @com.getcapacitor.PluginMethod public class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.Permission <methods>;
}
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-dontwarn com.getcapacitor.**

# ── Cordova compatibility layer ─────────────────────────────────────────────
-keep public class * extends org.apache.cordova.* { *; }
-keep class org.apache.cordova.** { *; }
-dontwarn org.apache.cordova.**

# ── App entry points ────────────────────────────────────────────────────────
-keep class gagachat.app.** { *; }
-keep class * extends android.app.Application { *; }
-keep class * extends android.app.Activity { *; }
-keep class * extends android.app.Service { *; }
-keep class * extends android.content.BroadcastReceiver { *; }
-keep class * extends android.content.ContentProvider { *; }

# ── Firebase / FCM ──────────────────────────────────────────────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
-keep class * extends com.google.firebase.messaging.FirebaseMessagingService { *; }

# ── AndroidX WebKit / WebView JS bridge ─────────────────────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class androidx.webkit.** { *; }
-dontwarn androidx.webkit.**

# ── Kotlin metadata (plugins are written in Kotlin) ─────────────────────────
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-keepclassmembers class **$WhenMappings { <fields>; }

# ── Keep native methods ─────────────────────────────────────────────────────
-keepclasseswithmembernames class * {
    native <methods>;
}

# ── Keep Parcelable / Serializable ──────────────────────────────────────────
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# ── Keep enums used via reflection ──────────────────────────────────────────
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ── Suppress warnings for optional/reflective deps ──────────────────────────
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn javax.annotation.**
-dontwarn java.lang.invoke.**
