plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
}

val signingStoreFile = providers.environmentVariable("GAGA_SIGNING_STORE_FILE").orNull
val signingStorePassword = providers.environmentVariable("GAGA_SIGNING_STORE_PASSWORD").orNull
val signingKeyAlias = providers.environmentVariable("GAGA_SIGNING_KEY_ALIAS").orNull
val signingKeyPassword = providers.environmentVariable("GAGA_SIGNING_KEY_PASSWORD").orNull
val hasReleaseSigning = listOf(
    signingStoreFile,
    signingStorePassword,
    signingKeyAlias,
    signingKeyPassword
).all { !it.isNullOrBlank() }
val requireReleaseSigning = providers.environmentVariable("GAGA_REQUIRE_RELEASE_SIGNING")
    .orNull?.equals("true", ignoreCase = true) == true

if (requireReleaseSigning && !hasReleaseSigning) {
    throw GradleException("Release signing is required, but GAGA_SIGNING_* environment variables are incomplete")
}

android {
    namespace = "app.gagachat.mobile"
    compileSdk = 36

    lint {
        // Newly added English messages fall back to the default locale until translated.
        disable += "MissingTranslation"
    }

    defaultConfig {
        // Must match the Android client registered in google-services.json.
        applicationId = "gagachat.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 30117
        versionName = "3.1.17"
        resValue("string", "app_version", "3.1.17")

        // Production endpoint — final build bakes the Alibaba Cloud URL here.
        // AppPrefs.apiBase() allows a runtime override (Settings → Server).
        buildConfigField("String", "API_BASE", "\"https://api.gagachat.app/api\"")
        buildConfigField("boolean", "ALLOW_SERVER_OVERRIDE", "false")
        buildConfigField("boolean", "WALLET_ENABLED", "false")
        buildConfigField("boolean", "OTP_ENABLED", "false")
        buildConfigField("boolean", "SELF_REGISTRATION_ENABLED", "true")

        // ABI selection handled by splits{} below (ndk.abiFilters would conflict)
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(signingStoreFile!!)
                storePassword = signingStorePassword
                keyAlias = signingKeyAlias
                keyPassword = signingKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        debug {
            buildConfigField("String", "API_BASE", "\"https://api.gagachat.app/api\"")
            buildConfigField("boolean", "ALLOW_SERVER_OVERRIDE", "true")
            buildConfigField("boolean", "SELF_REGISTRATION_ENABLED", "true")
        }
        create("qa") {
            initWith(getByName("debug"))
            versionNameSuffix = "-qa"
            isDebuggable = false
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("debug")
            buildConfigField("String", "API_BASE", "\"https://api.gagachat.app/api\"")
            buildConfigField("boolean", "ALLOW_SERVER_OVERRIDE", "false")
            buildConfigField("boolean", "WALLET_ENABLED", "false")
            buildConfigField("boolean", "OTP_ENABLED", "false")
            buildConfigField("boolean", "SELF_REGISTRATION_ENABLED", "true")
        }
    }

    splits {
        abi {
            // Standalone APK builds use ABI splits. AAB builds must not: Play
            // generates device APKs, and multiple split variants break the
            // Android Gradle Plugin's release bundle preparation.
            val isBundleTask = gradle.startParameter.taskNames.any {
                it.contains("bundle", ignoreCase = true)
            }
            isEnable = !isBundleTask
            if (!isBundleTask) {
                reset()
                include("arm64-v8a", "armeabi-v7a")
                isUniversalApk = true
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
        viewBinding = false
    }
    packaging {
        resources.excludes += "META-INF/{AL2.0,LGPL2.1}"
        jniLibs.useLegacyPackaging = false
    }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-process:2.8.4")
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.fragment:fragment-ktx:1.8.2")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.exifinterface:exifinterface:1.3.7")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("io.coil-kt:coil:2.6.0")

    // WebRTC (stream — maintained prebuilt)
    // 1.3.10 includes 16 KB-compatible native WebRTC binaries.
    implementation("io.getstream:stream-webrtc-android:1.3.10")

    // QR scanning
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    implementation("com.google.zxing:core:3.5.3")
}
