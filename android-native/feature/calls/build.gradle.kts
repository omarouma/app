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

    // ZEGOCLOUD Call Kit — real 1:1 audio/video calling with call invitations.
    implementation(libs.zego.callkit)
}
