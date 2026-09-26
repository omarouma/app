import java.util.Properties

plugins {
    id("gaga.android.library")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("gaga.android.hilt")
}

// ---------------------------------------------------------------------------
// Backend configuration resolution.
//
// IMPORTANT: Gradle does NOT read `local.properties` automatically (AGP only
// uses it for `sdk.dir`), so `project.findProperty("SUPABASE_URL")` returns null
// unless the value is passed with -P or defined in gradle.properties. That bug
// shipped an APK with an EMPTY SUPABASE_URL, which made every request fail at the
// transport layer and surface as "No internet connection" on the login screen.
//
// Resolution order (first non-blank wins):
//   1. -P<NAME>=... (gradle property / command line)
//   2. <NAME> environment variable
//   3. local.properties (developer machine / CI secret file)
//   4. provided default
// ---------------------------------------------------------------------------
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

fun backendValue(name: String, default: String = ""): String {
    val fromGradle = (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() }
    val fromEnv = System.getenv(name)?.takeIf { it.isNotBlank() }
    val fromLocal = localProps.getProperty(name)?.takeIf { it.isNotBlank() }
    return fromGradle ?: fromEnv ?: fromLocal ?: default
}

val supabaseUrl = backendValue("SUPABASE_URL")
val supabaseAnonKey = backendValue("SUPABASE_ANON_KEY")
val supabaseBucket = backendValue("SUPABASE_STORAGE_BUCKET", "chat-media")

if (supabaseUrl.isBlank() || supabaseAnonKey.isBlank()) {
    logger.warn(
        "[gaga] WARNING: SUPABASE_URL / SUPABASE_ANON_KEY are empty. The built app " +
            "will fail every network call (\"No internet connection\"). Provide them via " +
            "local.properties, -PSUPABASE_URL=... / -PSUPABASE_ANON_KEY=..., or env vars.",
    )
}

android {
    namespace = "app.gagachat.core.network"

    defaultConfig {
        // Security baseline (PDF §11): secrets are NOT hard-coded. Values are
        // injected from local.properties / CI env at build time. The anon key is
        // a public client key; privileged service keys never ship in the APK.
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
        buildConfigField("String", "SUPABASE_STORAGE_BUCKET", "\"$supabaseBucket\"")
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
