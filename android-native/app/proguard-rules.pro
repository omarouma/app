# GaGa Chat release rules (PDF §11 — release optimization).

# Keep Kotlin serialization metadata for DTOs.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *; }
-keep,includedescriptorclasses class app.gagachat.**$$serializer { *; }
-keepclassmembers class app.gagachat.** {
    *** Companion;
}
-keepclasseswithmembers class app.gagachat.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Ktor / OkHttp
-dontwarn org.slf4j.**
-dontwarn io.ktor.**
-keep class io.ktor.** { *; }

# Firebase
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Room
-keep class * extends androidx.room.RoomDatabase { <init>(); }

# Hilt / Dagger generated code is kept automatically.

# Strip verbose logging in release (PDF §10 — no sensitive data in logs).
-assumenosideeffects class android.util.Log {
    public static *** v(...);
    public static *** d(...);
}
