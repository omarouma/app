package app.gagachat.feature.chat.presentation.components

/** One matrix is used by preview and export, so filters cannot be preview-only. */
internal enum class PhotoFilter(val label: String) {
    ORIGINAL("Original"), MONO("Mono"), WARM("Warm"), COOL("Cool");

    fun matrix(): FloatArray = when (this) {
        ORIGINAL -> floatArrayOf(1f,0f,0f,0f,0f, 0f,1f,0f,0f,0f, 0f,0f,1f,0f,0f, 0f,0f,0f,1f,0f)
        MONO -> floatArrayOf(.213f,.715f,.072f,0f,0f, .213f,.715f,.072f,0f,0f, .213f,.715f,.072f,0f,0f, 0f,0f,0f,1f,0f)
        WARM -> floatArrayOf(1.06f,0f,0f,0f,3f, 0f,1.01f,0f,0f,0f, 0f,0f,.93f,0f,0f, 0f,0f,0f,1f,0f)
        COOL -> floatArrayOf(.94f,0f,0f,0f,0f, 0f,1.01f,0f,0f,0f, 0f,0f,1.06f,0f,3f, 0f,0f,0f,1f,0f)
    }
}
