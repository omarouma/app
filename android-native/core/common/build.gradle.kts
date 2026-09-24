plugins {
    id("gaga.android.library")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "app.gagachat.core.common"
}

dependencies {
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.datetime)
    implementation(libs.androidx.core.ktx)
}
