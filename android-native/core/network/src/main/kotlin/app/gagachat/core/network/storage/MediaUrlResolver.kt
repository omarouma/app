package app.gagachat.core.network.storage

import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * F18: resolves a stored media URL into something a client can actually fetch.
 *
 * Chat media is uploaded to PRIVATE buckets, but the durable URL persisted on the
 * message row is a `/object/public/...` URL (the upload path is bucket-agnostic
 * and shared with public buckets such as avatars). For a private bucket that URL
 * is dead, so every render path must exchange it for a short-lived signed URL.
 *
 * Public buckets (avatars/media/posts/stories/reels) are returned untouched so we
 * never pay an extra round-trip for them. Signed URLs are memoised until shortly
 * before they expire, so scrolling a conversation does not mint a token per frame.
 */
@Singleton
class MediaUrlResolver @Inject constructor(
    private val storageApi: SupabaseStorageApi,
) {

    private data class Cached(val url: String, val expiresAtMillis: Long)

    private val cache = ConcurrentHashMap<String, Cached>()

    /** True when [url] points at a private bucket and therefore needs signing. */
    fun isPrivateStorageUrl(url: String?): Boolean {
        val bucket = parse(url)?.first ?: return false
        return bucket in PRIVATE_BUCKETS
    }

    /**
     * Returns a fetchable URL for [url]. Public URLs, local file paths and
     * `content://` URIs are returned unchanged; private storage URLs are
     * exchanged for a signed URL. If signing fails, private media fails closed:
     * returning its known-invalid /object/public URL would both generate noisy
     * HTTP 400s and make renderers retry an address that can never be authorized.
     */
    suspend fun resolve(url: String?): String? {
        if (url.isNullOrBlank()) return url
        if (!isPrivateStorageUrl(url)) return url

        val (bucket, objectPath) = parse(url) ?: return url
        val now = System.currentTimeMillis()
        cache[url]?.let { cached ->
            if (cached.expiresAtMillis - SIGNED_URL_REFRESH_SKEW_MS > now) return cached.url
        }

        return try {
            val signed = storageApi.createSignedUrl(bucket, objectPath)
            cache[url] = Cached(
                url = signed,
                expiresAtMillis = now + TTL_SECONDS * 1000L,
            )
            signed
        } catch (t: Throwable) {
            if (t is kotlinx.coroutines.CancellationException) throw t
            null
        }
    }

    /** Splits a storage URL into `(bucket, objectPath)`. */
    private fun parse(url: String?): Pair<String, String>? {
        if (url.isNullOrBlank()) return null
        val marker = "/object/public/"
        val start = url.indexOf(marker)
        if (start < 0) return null
        val rest = url.substring(start + marker.length)
        val slash = rest.indexOf('/')
        if (slash <= 0 || slash == rest.length - 1) return null
        val bucket = rest.substring(0, slash)
        val objectPath = rest.substring(slash + 1)
        return bucket to objectPath
    }

    private companion object {
        /** Buckets whose objects are not world-readable. */
        val PRIVATE_BUCKETS = setOf("chat-media", "voice-messages")

        /** Minted URL lifetime; keep in sync with [SupabaseStorageApi.createSignedUrl]. */
        const val TTL_SECONDS = 60 * 60

        /** Re-mint this long before expiry so an in-flight load never 400s. */
        const val SIGNED_URL_REFRESH_SKEW_MS = 2 * 60 * 1000L
    }
}
