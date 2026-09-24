plugins {
    id("gaga.android.library")
    id("gaga.android.room")
    id("gaga.android.hilt")
}

android {
    namespace = "app.gagachat.core.database"
}

dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:common"))
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.datetime)
}
