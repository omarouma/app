package app.gagachat.mobile.net

import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody
import okio.BufferedSink
import java.io.File

/**
 * M-07: streams file bytes with progress reporting (0..100).
 */
class ProgressRequestBody(
    private val file: File,
    private val mime: String,
    private val onProgress: (Int) -> Unit = {}
) : RequestBody() {

    private val mediaType: MediaType = mime.toMediaType()

    override fun contentType(): MediaType = mediaType

    override fun contentLength(): Long = file.length()

    override fun writeTo(sink: BufferedSink) {
        val total = file.length().coerceAtLeast(1)
        var sent = 0L
        file.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n == -1) break
                sink.write(buf, 0, n)
                sent += n
                val pct = ((sent * 100) / total).toInt().coerceIn(0, 100)
                onProgress(pct)
            }
        }
    }
}
