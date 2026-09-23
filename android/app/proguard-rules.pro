# ─────────────────────────────────────────────────────────────────────────────
# GaGa — R8 / ProGuard keep rules
#
# The release build enables R8 (minifyEnabled + shrinkResources). Capacitor,
# Cordova plugins, the WebView JavaScript bridge and Firebase are all reached
# *reflectively* (by class name / annotation), so R8 must be told to keep them
# or the app will crash at runtime with ClassNotFoundException / missing plugin.
# ─────────────────────────────────────────────────────────────────────────────

# Keep line numbers for readable crash reports, but hide the original source
# file name so the shipped APK does not disclose internal file paths.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep annotations + generic signatures (needed by reflection-based frameworks).
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# ── Capacitor core + all plugins ─────────────────────────────────────────────
# Plugins are instantiated reflectively from their class name and annotated
# with @CapacitorPlugin; PluginMethod methods are invoked reflectively too.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    public *;
}

# ── Cordova plugins (bridged through Capacitor) ──────────────────────────────
-keep class org.apache.cordova.** { *; }
-keep public class * extends org.apache.cordova.CordovaPlugin

# ── WebView JavaScript bridge ────────────────────────────────────────────────
# Any method annotated @JavascriptInterface is called from JS by name.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
# GaGa's own native bridge (window.GaGaNative).
-keep class gagachat.app.** { *; }
-keepclassmembers class gagachat.app.MainActivity$GaGaNative {
    public *;
}

# ── Firebase / Google Play services (FCM push) ───────────────────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ── AndroidX WebKit / core ───────────────────────────────────────────────────
-keep class androidx.webkit.** { *; }

# ── General safety ───────────────────────────────────────────────────────────
# Keep native method names (JNI lookups by name).
-keepclasseswithmembernames class * {
    native <methods>;
}
# Keep enum values()/valueOf() (used reflectively by some libs).
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
# Keep Parcelable CREATOR fields.
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}
# Keep Serializable members.
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Do not fail the build on optional/absent dependencies pulled in transitively.
-dontwarn **
