package app.gagachat.core.network.storage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class ScopedMediaCacheTest {
    @Test fun cachedSignedUrlCannotBeReusedByAnotherAccount() {
        val url = "https://example.supabase.co/storage/v1/object/public/chat-media/a/photo.jpg"
        val owner = scopedMediaCacheKey("user-a", url)
        val foreign = scopedMediaCacheKey("user-b", url)
        assertNotEquals(owner, foreign)
        assertEquals(owner, scopedMediaCacheKey("user-a", url))
    }
}
