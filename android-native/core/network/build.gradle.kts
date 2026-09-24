plugins {
    id("gaga.android.library")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("gaga.android.hilt")
}

android {
    namespace = "app.gagachat.core.network"

    defaultConfig {
        // Security baseline (PDF §11): secrets are NOT hard-coded. Values are
        // injected from local.properties / CI env at build time. The anon key is
        // a public client key; privileged service keys never ship in the APK.
        buildConfigField(
            "String",
            "SUPABASE_URL",
            "\"${project.findProperty("SUPABASE_URL") ?: ""}\"",
        )
        buildConfigField(
            "String",
            "SUPABASE_ANON_KEY",
            "\"${project.findProperty("SUPABASE_ANON_KEY") ?: ""}\"",
        )
        buildConfigField(
            "String",
            "SUPABASE_STORAGE_BUCKET",
            "\"${project.findProperty("SUPABASE_STORAGE_BUCKET") ?: "media"}\"",
        )
    }
}

dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:common"))

    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.ktor.client.logging)
    implementation(libs.ktor.client.websockets)
    implementation(libs.ktor.client.auth)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)

    testImplementation(libs.ktor.client.mock)
}
