package app.gagachat.core.ui.state

/**
 * Canonical, exhaustive screen-state model (Master Spec §E).
 *
 * Every screen in the app models its UI as exactly one of these states so that
 * loading, empty, offline, partial, error, permission and session-expiry cases
 * are always handled explicitly rather than implicitly. This is the single
 * source of truth for "what can a screen show".
 *
 * @param T the content payload rendered in the CONTENT state.
 */
sealed interface ScreenState<out T> {

    /** Nothing requested yet (first frame before a load is kicked off). */
    data object Initial : ScreenState<Nothing>

    /** Blocking first load with no cached content to show. */
    data object Loading : ScreenState<Nothing>

    /** Content is available. [isRefreshing] = background refresh; [isPartial] = stale/partial cache. */
    data class Content<T>(
        val data: T,
        val isRefreshing: Boolean = false,
        val isPartial: Boolean = false,
    ) : ScreenState<T>

    /** Load completed successfully but there is nothing to show. */
    data object Empty : ScreenState<Nothing>

    /** Device is offline and no cached content is available. */
    data object Offline : ScreenState<Nothing>

    /** A recoverable failure. [retryable] controls whether a Retry affordance is shown. */
    data class Error(
        val message: String,
        val retryable: Boolean = true,
    ) : ScreenState<Nothing>

    /** A required runtime permission was denied. */
    data class PermissionDenied(
        val permission: String,
        val permanentlyDenied: Boolean = false,
    ) : ScreenState<Nothing>

    /** The auth session expired/revoked; the app must return to the auth graph. */
    data object SessionExpired : ScreenState<Nothing>
}

/** True when the state carries renderable content. */
val ScreenState<*>.hasContent: Boolean get() = this is ScreenState.Content

/** The content payload, or null when the state is not CONTENT. */
fun <T> ScreenState<T>.dataOrNull(): T? = (this as? ScreenState.Content)?.data

/** Map the CONTENT payload while preserving every non-content state. */
inline fun <T, R> ScreenState<T>.mapContent(transform: (T) -> R): ScreenState<R> = when (this) {
    is ScreenState.Content -> ScreenState.Content(transform(data), isRefreshing, isPartial)
    ScreenState.Initial -> ScreenState.Initial
    ScreenState.Loading -> ScreenState.Loading
    ScreenState.Empty -> ScreenState.Empty
    ScreenState.Offline -> ScreenState.Offline
    is ScreenState.Error -> this
    is ScreenState.PermissionDenied -> this
    ScreenState.SessionExpired -> ScreenState.SessionExpired
}

/** Convenience: build a CONTENT state, or EMPTY when the list is empty. */
fun <T> contentOrEmpty(items: List<T>, isRefreshing: Boolean = false, isPartial: Boolean = false): ScreenState<List<T>> =
    if (items.isEmpty()) ScreenState.Empty else ScreenState.Content(items, isRefreshing, isPartial)
