pluginManagement {
    includeBuild("build-logic")
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "GaGaChat"

// Application shell
include(":app")

// Core modules (PDF §2.1)
include(":core:common")
include(":core:model")
include(":core:database")
include(":core:network")
include(":core:data")
include(":core:ui")

// Feature modules (PDF §2.1)
include(":feature:auth")
include(":feature:home")
include(":feature:chat")
include(":feature:contacts")
include(":feature:calls")
include(":feature:profile")
include(":feature:settings")

// Sync / background (PDF §13)
include(":sync:outbox")
include(":sync:workers")

// Performance (PDF §9)
include(":benchmark")
include(":baselineprofile")
