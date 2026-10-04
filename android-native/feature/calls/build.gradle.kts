plugins {
    id("gaga.android.feature")
}

android {
    namespace = "app.gagachat.feature.calls"
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.process)

    // LiveKit Android SDK — WebRTC media transport for 1:1 audio/video calls.
    // Call invitations/signaling travel over our own Supabase Realtime channel
    // and access tokens are minted server-side by the `livekit-token` Edge
    // Function, so no LiveKit credentials are ever bundled in the APK.
    //
    // `api` (not `implementation`): `LiveKitCallManager` is injected by the
    // `:app` module, so the SDK types that appear in its public surface must be
    // resolvable from `:app`'s compile classpath too.
    api(libs.livekit.android)
}
