plugins {
    id("gaga.android.feature")
}

android {
    namespace = "app.gagachat.feature.qr"
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.lifecycle.runtime.compose)

    // In-app QR scanning (CameraX preview + ZXing decode)
    implementation(libs.zxing.core)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    // CameraX's ProcessCameraProvider returns a Guava ListenableFuture. Firebase
    // (transitively, via :core:data -> :core:firebase) pins the standalone
    // com.google.guava:listenablefuture artifact to an EMPTY version, so the
    // ListenableFuture interface must be supplied by guava itself.
    implementation(libs.guava)
}
