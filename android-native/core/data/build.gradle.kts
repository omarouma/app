plugins {
    id("gaga.android.library")
    id("gaga.android.hilt")
}

android {
    namespace = "app.gagachat.core.data"
}

dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:common"))
    implementation(project(":core:database"))
    implementation(project(":core:network"))
    // Firebase Hybrid transport (best-effort Firestore mirror of sends/typing).
    implementation(project(":core:firebase"))

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.room.runtime)

    testImplementation(libs.junit)
    testImplementation(libs.turbine)
    testImplementation(libs.mockk)
    testImplementation(libs.truth)
    testImplementation(libs.kotlinx.coroutines.test)
    // Test-only: lets the friend-request lifecycle tests build a real Ktor
    // ResponseException to exercise the "RPC not deployed yet" fallback branch.
    testImplementation(libs.ktor.client.core)
}
