package app.gagachat.core.common.util

/**
 * Single source of truth for mapping between MIME types and the file
 * extensions used in storage object paths.
 *
 * Why this exists: the upload pipeline used to derive the extension with
 * `mime.substringAfterLast('/')`. That works for `image/png` but produces
 * garbage for anything else:
 *
 *  - `image/jpeg`      -> `jpeg`      (should be `jpg`)
 *  - `video/quicktime` -> `quicktime` (should be `mov`)
 *  - `audio/mpeg`      -> `mpeg`      (should be `mp3`)
 *  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
 *                      -> a 60 character "extension"
 *
 * The last case is the dangerous one: it builds an object path such as
 * `uid/upload.openxmlformats-officedocument.wordprocessingml.document`,
 * which breaks downloads (no sane extension to hand to the OS) and makes
 * the stored object impossible to reason about.
 */
object MediaFileTypes {

    /** Longest extension we are willing to emit. `.tar.gz` style is not supported. */
    private const val MAX_EXTENSION_LENGTH = 8

    /** Fallback when nothing usable can be derived. */
    const val FALLBACK_EXTENSION = "bin"

    /** Fallback MIME when nothing usable can be derived. */
    const val FALLBACK_MIME = "application/octet-stream"

    /**
     * Explicit table. Anything that cannot be derived mechanically lives
     * here, and every entry is a value we have actually seen come out of
     * Android's content providers.
     */
    private val MIME_TO_EXTENSION: Map<String, String> = mapOf(
        // Images
        "image/jpeg" to "jpg",
        "image/jpg" to "jpg",
        "image/pjpeg" to "jpg",
        "image/png" to "png",
        "image/gif" to "gif",
        "image/webp" to "webp",
        "image/bmp" to "bmp",
        "image/x-ms-bmp" to "bmp",
        "image/heic" to "heic",
        "image/heif" to "heif",
        "image/heic-sequence" to "heic",
        "image/avif" to "avif",
        "image/svg+xml" to "svg",

        // Video
        "video/mp4" to "mp4",
        "video/x-m4v" to "m4v",
        "video/quicktime" to "mov",
        "video/3gpp" to "3gp",
        "video/3gpp2" to "3g2",
        "video/webm" to "webm",
        "video/x-matroska" to "mkv",
        "video/mpeg" to "mpeg",
        "video/x-msvideo" to "avi",
        "video/x-flv" to "flv",

        // Audio
        "audio/mpeg" to "mp3",
        "audio/mp3" to "mp3",
        "audio/mp4" to "m4a",
        "audio/x-m4a" to "m4a",
        "audio/aac" to "aac",
        "audio/wav" to "wav",
        "audio/x-wav" to "wav",
        "audio/ogg" to "ogg",
        "audio/opus" to "opus",
        "audio/webm" to "weba",
        "audio/amr" to "amr",
        "audio/3gpp" to "3gp",
        "audio/flac" to "flac",
        "audio/x-flac" to "flac",

        // Documents
        "application/pdf" to "pdf",
        "text/plain" to "txt",
        "text/csv" to "csv",
        "text/html" to "html",
        "text/rtf" to "rtf",
        "application/rtf" to "rtf",
        "application/json" to "json",
        "application/xml" to "xml",
        "text/xml" to "xml",
        "application/msword" to "doc",
        "application/vnd.ms-word" to "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" to "docx",
        "application/vnd.ms-excel" to "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" to "xlsx",
        "application/vnd.ms-powerpoint" to "ppt",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" to "pptx",
        "application/vnd.oasis.opendocument.text" to "odt",
        "application/vnd.oasis.opendocument.spreadsheet" to "ods",
        "application/epub+zip" to "epub",

        // Archives / binaries
        "application/zip" to "zip",
        "application/x-zip-compressed" to "zip",
        "application/x-rar-compressed" to "rar",
        "application/vnd.rar" to "rar",
        "application/x-7z-compressed" to "7z",
        "application/gzip" to "gz",
        "application/x-tar" to "tar",
        "application/octet-stream" to FALLBACK_EXTENSION,
        "binary/octet-stream" to FALLBACK_EXTENSION,
    )

    /** Reverse table, used when a provider gives us a name but no MIME type. */
    private val EXTENSION_TO_MIME: Map<String, String> =
        buildMap {
            MIME_TO_EXTENSION.forEach { (mime, ext) ->
                if (ext != FALLBACK_EXTENSION) putIfAbsent(ext, mime)
            }
            // Prefer the canonical container for the aliases above.
            put("jpg", "image/jpeg")
            put("mp3", "audio/mpeg")
            put("mov", "video/quicktime")
            put("m4a", "audio/mp4")
            put("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            put("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            put("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation")
        }

    /**
     * Resolves a storage-safe extension for [mime], falling back to the
     * extension of [fileName] and finally to [FALLBACK_EXTENSION].
     *
     * The result is always lowercase alphanumeric and at most
     * [MAX_EXTENSION_LENGTH] characters, so it can never corrupt an object
     * path.
     */
    fun extensionForMime(mime: String?, fileName: String? = null): String {
        val normalized = normalizeMime(mime)
        if (normalized.isNotEmpty()) {
            MIME_TO_EXTENSION[normalized]?.let { return it }
        }
        // The provider-supplied name is a better hint than a guessed subtype:
        // `application/x-made-up` must not become `.madeup`, and a real
        // `notes.md` should stay markdown. Only when the name has no usable
        // suffix do we fall back to deriving one from the MIME subtype.
        sanitizeExtension(fileName?.substringAfterLast('.', ""))?.let { return it }
        if (normalized.isNotEmpty()) {
            sanitizeSubtype(normalized.substringAfter('/', ""))?.let { return it }
        }
        return FALLBACK_EXTENSION
    }

    /**
     * Resolves a MIME type for a file name, or [FALLBACK_MIME]. Used when a
     * content provider hands back a name but an empty/null type.
     */
    fun mimeForFileName(fileName: String?): String {
        val ext = sanitizeExtension(fileName?.substringAfterLast('.', "")) ?: return FALLBACK_MIME
        return EXTENSION_TO_MIME[ext] ?: FALLBACK_MIME
    }

    /** True when [mime] is a still image we can compress or preview locally. */
    fun isImage(mime: String?): Boolean = normalizeMime(mime).startsWith("image/")

    /** True when [mime] is a video container. */
    fun isVideo(mime: String?): Boolean = normalizeMime(mime).startsWith("video/")

    /** True when [mime] is audio. */
    fun isAudio(mime: String?): Boolean = normalizeMime(mime).startsWith("audio/")

    private fun normalizeMime(mime: String?): String =
        mime?.substringBefore(';')?.trim()?.lowercase().orEmpty()

    /**
     * Derives an extension from a MIME subtype when the table has no entry.
     * `image/x-icon` -> `icon`, `text/x-vcard` -> `vcard`. Returns null for
     * vendor subtypes that are too long to be a real extension.
     */
    private fun sanitizeSubtype(subtype: String): String? {
        if (subtype.isEmpty()) return null
        var candidate = subtype.substringBefore('+')
        if (candidate.startsWith("x-")) candidate = candidate.removePrefix("x-")
        // `vnd.ms-excel` -> `excel`; `vnd.rar` -> `rar`.
        if (candidate.startsWith("vnd.")) candidate = candidate.substringAfterLast('.')
        candidate = candidate.filter { it.isLetterOrDigit() }
        return candidate.takeIf { it.isNotEmpty() && it.length <= MAX_EXTENSION_LENGTH }
    }

    private fun sanitizeExtension(raw: String?): String? {
        val candidate = raw?.trim()?.lowercase()?.filter { it.isLetterOrDigit() }.orEmpty()
        return candidate.takeIf { it.isNotEmpty() && it.length <= MAX_EXTENSION_LENGTH }
    }
}
