# GaGaChat v3.0 R8 rules

# WebRTC (stream prebuilt)
-dontwarn org.webrtc.**
-keep class org.webrtc.** { *; }
-keep class io.getstream.webrtc.** { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-keepattributes Signature, InnerClasses, EnclosingMethod, *Annotation*

# Kotlin coroutines
-dontwarn kotlinx.coroutines.**

# Coil
-dontwarn coil.**

# zxing
-keep class com.google.zxing.** { *; }
-keep class com.journeyapps.barcodescanner.** { *; }
-dontwarn com.google.zxing.**

# security-crypto
-dontwarn androidx.security.**

# Our JSON models use reflection-free opt* access; keep data class members
-keepclassmembers class app.gagachat.mobile.model.** { *; }

# Source file + line numbers for readable crash traces
-keepattributes SourceFile,LineNumberTable
