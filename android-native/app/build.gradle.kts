plugins {
    id("gaga.android.application")
    id("gaga.android.hilt")
    alias(libs.plugins.kotlin.serialization)
    // NOTE: The Google Services plugin is intentionally NOT applied here so the
    // project builds without committing secrets. When you add a real
    // google-services.json (PDF §10 — no secrets in the APK), uncomment:
    // alias(libs.plugins.google.services)
}

android {
    namespace = "app.gagachat"

    defaultConfig {
        applicationId = "gagachat.app"
        versionCode = 3
        versionName = "2.0.0"
    }

    // Release signing (PDF §11 — signing key kept in a secure CI/release
    // process, never committed). Values are read from local.properties or the
    // environment so the repo stays secret-free. If they are absent the release
    // build is left unsigned (useful for CI dry runs).
    signingConfigs {
        create("release") {
            val storePath = providers.gradleProperty("GAGA_RELEASE_STORE_FILE")
                .orElse(providers.environmentVariable("GAGA_RELEASE_STORE_FILE"))
                .orNull
            if (storePath != null) {
                storeFile = file(storePath)
                storePassword = providers.gradleProperty("GAGA_RELEASE_STORE_PASSWORD")
                    .orElse(providers.environmentVariable("GAGA_RELEASE_STORE_PASSWORD"))
                    .orNull
                keyAlias = providers.gradleProperty("GAGA_RELEASE_KEY_ALIAS")
                    .orElse(providers.environmentVariable("GAGA_RELEASE_KEY_ALIAS"))
                    .orNull
                keyPassword = providers.gradleProperty("GAGA_RELEASE_KEY_PASSWORD")
                    .orElse(providers.environmentVariable("GAGA_RELEASE_KEY_PASSWORD"))
                    .orNull
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Attach the release signing config only when a keystore is present.
            signingConfig = signingConfigs.findByName("release")
                ?.takeIf { it.storeFile != null }
            // Baseline profile is consumed from the :baselineprofile module.
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += setOf(
            "/META-INF/{AL2.0,LGPL2.1}",
            "META-INF/DEPENDENCIES",
            "META-INF/LICENSE*",
        )
    }
}

dependencies {
    // Core
    implementation(project(":core:common"))
    implementation(project(":core:model"))
    implementation(project(":core:database"))
    implementation(project(":core:network"))
    implementation(project(":core:data"))
    implementation(project(":core:ui"))

    // Features
    implementation(project(":feature:onboarding"))
    implementation(project(":feature:auth"))
    implementation(project(":feature:home"))
    implementation(project(":feature:chat"))
    implementation(project(":feature:contacts"))
    implementation(project(":feature:people"))
    implementation(project(":feature:groups"))
    implementation(project(":feature:qr"))
    implementation(project(":feature:wallet"))
    implementation(project(":feature:calls"))
    implementation(project(":feature:profile"))
    implementation(project(":feature:settings"))

    // Sync / background
    implementation(project(":sync:outbox"))
    implementation(project(":sync:workers"))

    // AndroidX
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.profileinstaller)

    // Compose (the app module hosts the Compose UI directly)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.runtime)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // Hilt navigation (hiltViewModel() in the root composable)
    implementation(libs.hilt.navigation.compose)

    // WorkManager + Hilt integration
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)

    // Firebase push (PDF §8). Requires google-services.json to initialize.
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.firebase.analytics)
    implementation(libs.firebase.crashlytics)

    // Serialization for deep-link payloads
    implementation(libs.kotlinx.serialization.json)

    // Testing
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.espresso)
}
