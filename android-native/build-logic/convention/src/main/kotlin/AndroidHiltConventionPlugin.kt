import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.getByType

class AndroidHiltConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            val libs = extensions.getByType<VersionCatalogsExtension>().named("libs")

            pluginManager.apply("com.google.devtools.ksp")
            pluginManager.apply("com.google.dagger.hilt.android")

            dependencies {
                add("implementation", libs.findLibrary("hilt-android").get())
                // Dagger's Hilt compiler: processes @HiltAndroidApp, @AndroidEntryPoint,
                // @Module, @Inject, and (since Hilt 2.5x) @HiltViewModel.
                add("ksp", libs.findLibrary("hilt-compiler").get())
                // AndroidX Hilt compiler: REQUIRED to process @HiltWorker and generate the
                // `<Worker>_AssistedFactory` classes that HiltWorkerFactory resolves at
                // runtime. Without it, every WorkManager worker (MediaUploadWorker,
                // MessageSendWorker, ConversationSyncWorker, ...) fails to instantiate, so
                // media uploads never run and messages stay stuck at "Preparing…".
                add("ksp", libs.findLibrary("androidx-hilt-compiler").get())
            }
        }
    }
}
