plugins {
    id("gaga.android.feature")
}

android {
    namespace = "app.gagachat.feature.chat"
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.process)

    // Keep all Media3 artifacts on the same compatible release.
    implementation("androidx.media3:media3-transformer:1.8.0")
    implementation("androidx.media3:media3-effect:1.8.0")

    testImplementation(libs.junit)
}
