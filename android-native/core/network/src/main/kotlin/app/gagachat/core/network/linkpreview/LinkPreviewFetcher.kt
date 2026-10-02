package app.gagachat.core.network.linkpreview

import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.util.AppLogger
import app.gagachat.core.model.LinkPreview
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.InetAddress
import java.net.URI
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Fetches OpenGraph/Twitter-card metadata for a URL so the chat can render a
 * rich preview card (spec area 13).
 *
 * Security: this class is deliberately paranoid because it fetches
 * attacker-controlled URLs on behalf of the user. It implements a Server-Side
 * Request Forgery (SSRF) guard:
 *
 *  * Only `http`/`https` schemes are allowed.
 *  * The host is resolved and **every** resolved address is rejected if it is
 *    loopback, private, link-local, CGNAT, multicast, reserved or an IPv6 ULA —
 *    so a message cannot make the device probe `127.0.0.1`, `10.0.0.0/8`,
 *    `169.254.169.254` (cloud metadata) or an internal service.
 *  * Redirects are followed manually (max [MAX_REDIRECTS]) and re-validated at
 *    every hop, so a public URL cannot 302 into the internal network.
 *  * The response body is read with a hard byte cap ([MAX_BYTES]) and strict
 *    connect/read timeouts, so a hostile server cannot exhaust memory or hang
 *    the request.
 *  * Only `text/html` responses are parsed.
 *
 * The fetcher never throws; failures return `null` so the UI simply shows no
 * card.
 */
@Singleton
class LinkPreviewFetcher @Inject constructor(
    private val dispatchers: DispatcherProvider,
    private val logger: AppLogger,
) {
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .callTimeout(CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        // Redirects are handled manually so each hop can be SSRF-checked.
        .followRedirects(false)
        .followSslRedirects(false)
        .retryOnConnectionFailure(false)
        .build()

    /**
     * Resolves [rawUrl] to a [LinkPreview], or `null` when the URL is unsafe,
     * unreachable, non-HTML, or carries no usable metadata.
     */
    suspend fun fetch(rawUrl: String): LinkPreview? = withContext(dispatchers.io) {
        val start = normalize(rawUrl) ?: return@withContext null
        if (!isSafe(start)) {
            logger.w("LinkPreview", "Blocked unsafe preview target (host=${start.host})")
            return@withContext null
        }
        runCatching { fetchFollowingRedirects(start) }
            .onFailure { logger.d("LinkPreview", "Preview fetch failed: ${it.javaClass.simpleName}") }
            .getOrNull()
    }

    private fun fetchFollowingRedirects(start: HttpUrlLite): LinkPreview? {
        var current = start
        var hops = 0
        while (hops <= MAX_REDIRECTS) {
            val request = Request.Builder()
                .url(current.value)
                .header(
                    "User-Agent",
                    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 " +
                        "(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 GagaChat/1.0",
                )
                .header("Accept", "text/html,application/xhtml+xml")
                .header("Accept-Language", "en")
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isRedirect) {
                    val location = response.header("Location")
                    val next = location?.let { resolveRedirect(current, it) }
                    if (next == null || !isSafe(next)) {
                        logger.w("LinkPreview", "Blocked/redirect target invalid at hop $hops")
                        return null
                    }
                    current = next
                    hops++
                    return@use
                }
                if (!response.isSuccessful) return null
                val contentType = response.header("Content-Type").orEmpty().lowercase()
                if (!contentType.contains("text/html") && !contentType.contains("application/xhtml")) {
                    return null
                }
                val body = response.body ?: return null
                val html = body.source().let { source ->
                    source.request(MAX_BYTES.toLong())
                    val buffered = source.buffer.snapshot()
                    if (buffered.size > MAX_BYTES) {
                        buffered.substring(0, MAX_BYTES).utf8()
                    } else {
                        buffered.utf8()
                    }
                }
                return parse(html, current.value)
            }
        }
        return null
    }

    // ---- SSRF guard -------------------------------------------------------

    private fun isSafe(url: HttpUrlLite): Boolean {
        if (url.scheme != "http" && url.scheme != "https") return false
        val host = url.host
        if (host.isBlank()) return false
        // Reject obvious internal names before DNS.
        val lower = host.lowercase()
        if (lower == "localhost" || lower.endsWith(".localhost") ||
            lower.endsWith(".local") || lower.endsWith(".internal") ||
            lower.endsWith(".home.arpa")
        ) {
            return false
        }
        val addresses = runCatching { InetAddress.getAllByName(host) }.getOrNull()
            ?: return false
        if (addresses.isEmpty()) return false
        // Every resolved address must be public (defends against DNS rebinding
        // where one A record points inward).
        return addresses.all { isPublicAddress(it) }
    }

    private fun isPublicAddress(address: InetAddress): Boolean {
        if (address.isLoopbackAddress ||
            address.isAnyLocalAddress ||
            address.isLinkLocalAddress ||
            address.isSiteLocalAddress ||
            address.isMulticastAddress
        ) {
            return false
        }
        val bytes = address.address
        if (bytes.size == 4) {
            val b0 = bytes[0].toInt() and 0xFF
            val b1 = bytes[1].toInt() and 0xFF
            // 0.0.0.0/8
            if (b0 == 0) return false
            // 100.64.0.0/10 (CGNAT)
            if (b0 == 100 && b1 in 64..127) return false
            // 192.0.0.0/24 (IETF protocol assignments)
            if (b0 == 192 && b1 == 0 && (bytes[2].toInt() and 0xFF) == 0) return false
            // 198.18.0.0/15 (benchmarking)
            if (b0 == 198 && (b1 == 18 || b1 == 19)) return false
            // 240.0.0.0/4 (reserved) and 255.255.255.255
            if (b0 >= 240) return false
        } else if (bytes.size == 16) {
            // IPv6 unique-local fc00::/7
            if ((bytes[0].toInt() and 0xFE) == 0xFC) return false
        }
        return true
    }

    // ---- URL helpers ------------------------------------------------------

    private fun normalize(raw: String): HttpUrlLite? {
        val trimmed = raw.trim().trimEnd('.', ',', ')', ']', '}', '\u201d', '\u2019')
        return runCatching {
            val uri = URI(trimmed)
            val scheme = uri.scheme?.lowercase() ?: return null
            if (scheme != "http" && scheme != "https") return null
            val host = uri.host ?: return null
            val port = if (uri.port != -1) uri.port else if (scheme == "https") 443 else 80
            val path = uri.rawPath?.ifBlank { "/" } ?: "/"
            val query = uri.rawQuery?.let { "?$it" } ?: ""
            HttpUrlLite("$scheme://$host:$port$path$query", scheme, host, port)
        }.getOrNull()
    }

    private fun resolveRedirect(base: HttpUrlLite, location: String): HttpUrlLite? {
        val trimmed = location.trim()
        if (trimmed.isEmpty()) return null
        return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            normalize(trimmed)
        } else {
            runCatching {
                val resolved = URI(base.value).resolve(trimmed)
                normalize(resolved.toString())
            }.getOrNull()
        }
    }

    // ---- HTML parsing -----------------------------------------------------

    private fun parse(html: String, finalUrl: String): LinkPreview? {
        val meta = mutableMapOf<String, String>()
        META_TAG.findAll(html).forEach { match ->
            val attrs = parseAttributes(match.value)
            val key = (attrs["property"] ?: attrs["name"] ?: attrs["itemprop"])?.lowercase() ?: return@forEach
            val content = attrs["content"] ?: return@forEach
            if (content.isNotBlank() && !meta.containsKey(key)) meta[key] = content.trim()
        }
        val title = firstNonBlank(
            meta["og:title"],
            meta["twitter:title"],
            TITLE_TAG.find(html)?.groupValues?.getOrNull(1)?.let(::decodeEntities),
        )
        val description = firstNonBlank(
            meta["og:description"],
            meta["twitter:description"],
            meta["description"],
        )
        val image = firstNonBlank(
            meta["og:image:secure_url"],
            meta["og:image"],
            meta["twitter:image"],
            meta["twitter:image:src"],
            LINK_IMAGE_SRC.find(html)?.groupValues?.getOrNull(1),
        )?.let { absolutize(finalUrl, it) }
        val siteName = firstNonBlank(meta["og:site_name"], meta["application-name"])

        val preview = LinkPreview(
            url = finalUrl,
            title = title?.let(::decodeEntities)?.take(MAX_TEXT),
            description = description?.let(::decodeEntities)?.take(MAX_TEXT),
            imageUrl = image,
            siteName = siteName?.let(::decodeEntities)?.take(MAX_TITLE),
        )
        return preview.takeIf { it.hasContent }
    }

    private fun parseAttributes(tag: String): Map<String, String> {
        val result = mutableMapOf<String, String>()
        ATTR_TAG.findAll(tag).forEach { m ->
            val name = m.groupValues[1].lowercase()
            val value = m.groupValues[2].ifBlank { m.groupValues[3] }.ifBlank { m.groupValues[4] }
            if (name.isNotBlank() && value.isNotBlank()) result.putIfAbsent(name, value)
        }
        return result
    }

    private fun absolutize(base: String, ref: String): String? = runCatching {
        val resolved = URI(base).resolve(ref.trim())
        val scheme = resolved.scheme?.lowercase()
        if (scheme == "http" || scheme == "https") resolved.toString() else null
    }.getOrNull()

    private fun decodeEntities(input: String): String = input
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
        .replace(WHITESPACE, " ")
        .trim()

    private fun firstNonBlank(vararg values: String?): String? =
        values.firstOrNull { !it.isNullOrBlank() }

    /** Minimal, dependency-free URL holder (avoids leaking OkHttp types upward). */
    private data class HttpUrlLite(
        val value: String,
        val scheme: String,
        val host: String,
        val port: Int,
    )

    private companion object {
        const val CONNECT_TIMEOUT_SECONDS = 6L
        const val READ_TIMEOUT_SECONDS = 8L
        const val CALL_TIMEOUT_SECONDS = 12L
        const val MAX_REDIRECTS = 5
        const val MAX_BYTES = 512 * 1024
        const val MAX_TITLE = 160
        const val MAX_TEXT = 320

        val META_TAG = Regex("""<meta\b[^>]*>""", RegexOption.IGNORE_CASE)
        val TITLE_TAG = Regex("""<title[^>]*>([^<]*)</title>""", RegexOption.IGNORE_CASE)
        val LINK_IMAGE_SRC = Regex(
            """<link\b[^>]*rel\s*=\s*["']?image_src["']?[^>]*>""",
            RegexOption.IGNORE_CASE,
        )
        val ATTR_TAG = Regex(
            """([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""",
        )
        val WHITESPACE = Regex("""\s+""")
    }
}
