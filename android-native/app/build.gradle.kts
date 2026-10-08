plugins {
    id("gaga.android.application")
    id("gaga.android.hilt")
    alias(libs.plugins.kotlin.serialization)
}

// Apply Google Services only when the Firebase Android config is present.
// This keeps source control secret-free while ensuring production builds do not
// silently ship an FCM dependency that was never initialized.
if (file("google-services.json").exists()) {
    pluginManager.apply("com.google.gms.google-services")
    // The Crashlytics Gradle plugin MUST be applied whenever the Crashlytics
    // SDK (firebase-crashlytics-ktx) is on the runtime classpath. Without it
    // the SDK throws at startup inside FirebaseInitProvider:
    //   "The Crashlytics build ID is missing..."
    // which crashes the whole process before any UI is shown.
    pluginManager.apply("com.google.firebase.crashlytics")
} else {
    logger.warn("[gaga] google-services.json is missing: FCM push/incoming-call notifications will be unavailable in this build.")
}

android {
    namespace = "app.gagachat"

    defaultConfig {
        applicationId = "gagachat.app"
        versionCode = 39
        versionName = "2.2.0"

        // LiveKit ships its WebRTC native libraries for the two ABIs every real
        // Android phone uses (64-bit and 32-bit ARM). Restricting the set keeps
        // the APK small and avoids shipping x86 emulator binaries.
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
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
            // Sign with all schemes for maximum device/installer compatibility.
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            isMinifyEnabled = false
        }
        release {
            // R8 minification + resource shrinking are DISABLED for this build.
            //
            // The app was reported to crash on launch ("GaGa has stopped") even
            // though the start-up path is defensively coded and every native
            // library/resource is present. The remaining plausible cause is an
            // R8 optimisation/stripping side effect, so we ship an un-minified
            // release to rule that out, together with the CrashReporter that
            // captures any residual failure to a retrievable file.
            isMinifyEnabled = false
            isShrinkResources = false
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
            "META-INF/versions/9/OSGI-INF/MANIFEST.MF",
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
    // Firebase Hybrid transport (auth bridge + Firestore/RTDB mirror).
    implementation(project(":core:firebase"))

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
    implementation(project(":feature:dailylife"))
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

    // WorkManager + Hilt integration. The AndroidX Hilt compiler (which generates
    // the @HiltWorker assisted factories) is provided by the `gaga.android.hilt`
    // convention plugin, so it is not declared again here.
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.hilt.work)

    // Firebase push (PDF §8). Requires google-services.json to initialize.
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.firebase.analytics)
    implementation(libs.firebase.crashlytics)

    // Serialization for deep-link payloads
    implementation(libs.kotlinx.serialization.json)

    // Coil image loading (app-level ImageLoader registers the video-frame
    // decoder so video message thumbnails render real frames).
    implementation(libs.coil.compose)
    implementation(libs.coil.video)
    // OkHttp is used to customise Coil's HTTP client (identifying User-Agent for
    // third-party basemap tiles + shared connection pool).
    implementation(libs.okhttp)

    // LiveKit Android SDK — WebRTC media transport for 1:1 audio/video calls.
    implementation(libs.livekit.android)

    // Testing
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.espresso)
}
