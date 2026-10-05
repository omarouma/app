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

    // `CallViewModel` builds the JSON invite payload (`buildJsonObject`) that the
    // Supabase Realtime signalling channel carries, so this module needs the
    // serialization runtime on its own classpath (core:data exposes it only as an
    // `implementation` dependency).
    implementation(libs.kotlinx.serialization.json)

    // LiveKit Android SDK — WebRTC media transport for 1:1 audio/video calls.
    // Call invitations/signaling travel over our own Supabase Realtime channel
    // and access tokens are minted server-side by the `livekit-token` Edge
    // Function, so no LiveKit credentials are ever bundled in the APK.
    //
    // `api` (not `implementation`): `LiveKitCallManager` is injected by the
    // `:app` module, so the SDK types that appear in its public surface must be
    // resolvable from `:app`'s compile classpath too.
    api(libs.livekit.android)

    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.kotlinx.coroutines.test)
}
