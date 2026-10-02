package app.gagachat.core.data.repository

import app.gagachat.core.model.LinkPreview
import app.gagachat.core.network.linkpreview.LinkPreviewFetcher
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Caches rich link previews so a URL is fetched at most once per process
 * (spec area 13). A bounded LRU keeps memory flat even in long sessions.
 */
interface LinkPreviewRepository {
    /**
     * Returns the preview for [url], fetching it on first request. Returns
     * `null` when the URL is unsafe, unreachable or carries no metadata. The
     * negative result is cached too, so a broken link is not retried on every
     * recomposition.
     */
    suspend fun preview(url: String): LinkPreview?
}

@Singleton
class DefaultLinkPreviewRepository @Inject constructor(
    private val fetcher: LinkPreviewFetcher,
) : LinkPreviewRepository {

    private val mutex = Mutex()
    private val cache = object : LinkedHashMap<String, LinkPreview?>(CACHE_CAPACITY, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, LinkPreview?>?): Boolean =
            size > CACHE_CAPACITY
    }

    override suspend fun preview(url: String): LinkPreview? {
        mutex.withLock {
            if (cache.containsKey(url)) return cache[url]
        }
        val fetched = fetcher.fetch(url)
        mutex.withLock { cache[url] = fetched }
        return fetched
    }

    private companion object {
        const val CACHE_CAPACITY = 64
    }
}
