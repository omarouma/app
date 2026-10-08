plugins { id("gaga.android.feature") }
android { namespace = "app.gagachat.feature.dailylife" }
dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.hilt.work)
}
