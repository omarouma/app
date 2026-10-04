plugins {
    id("gaga.android.library")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("gaga.android.hilt")
}

// ---------------------------------------------------------------------------
// Firebase Hybrid transport flag.
//
// The Hybrid (FREE-plan) design keeps Supabase as the source of truth for
// messages/typing/presence/read-receipts/call-signaling and mirrors them into
// Firebase (Firestore + RTDB). Media (photo/video) continues to use Supabase
// Storage. The mirror is strictly best-effort and never blocks a send.
//
// The flag defaults to OFF so the proven Supabase-only path is unaffected; it is
// turned ON for the Hybrid build with -PFIREBASE_TRANSPORT_ENABLED=true.
// ---------------------------------------------------------------------------
val firebaseTransportEnabled =
    (project.findProperty("FIREBASE_TRANSPORT_ENABLED") as String?)?.toBooleanStrictOrNull() ?: false

android {
    namespace = "app.gagachat.core.firebase"

    defaultConfig {
        buildConfigField("boolean", "FIREBASE_TRANSPORT_ENABLED", firebaseTransportEnabled.toString())
        buildConfigField("String", "FIREBASE_TOKEN_FUNCTION", "\"firebase-token\"")
    }
}

dependencies {
    implementation(project(":core:common"))
    implementation(project(":core:network"))

    // Firebase (versions come from the shared BoM).
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.database)

    // Ktor is `implementation` in :core:network, so the shared HttpClient type is
    // not on this module's compile classpath transitively. Declare it explicitly.
    implementation(libs.ktor.client.core)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
}
