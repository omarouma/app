package app.gagachat.feature.profile.presentation

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.common.di.DispatcherProvider
import app.gagachat.core.common.result.AppResult
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.data.repository.ConversationRepository
import app.gagachat.core.data.repository.FriendsRepository
import app.gagachat.core.data.repository.UserRepository
import app.gagachat.core.model.User
import app.gagachat.core.network.dto.UserRow
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.core.network.session.SessionStore
import app.gagachat.core.network.storage.SupabaseStorageApi
import app.gagachat.core.ui.util.toUserMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import javax.inject.Inject

data class ProfileUiState(
    val privacy: app.gagachat.core.model.AccountPrivacy = app.gagachat.core.model.AccountPrivacy(),
    val userId: String = "",
    val user: User? = null,
    val isSelf: Boolean = false,
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
    val friendsCount: Int = 0,
    val followersCount: Int = 0,
    val followingCount: Int = 0,
    /** True while a cover photo/video is uploading to Storage. */
    val isUploadingCover: Boolean = false,
    /** 0..100 upload progress for the cover media. */
    val coverUploadProgress: Int = 0,
    /** One-shot error surfaced when a cover upload fails. */
    val coverUploadError: String? = null,
) {
    /**
     * Profile completeness (0..100). Derived from which optional profile fields
     * the user has filled in: avatar, bio, username and a contact channel. This
     * mirrors the "Profile completeness" progress card in the reference design.
     */
    val completeness: Int
        get() {
            val u = user ?: return 0
            var score = 0
            if (!u.avatar.isNullOrBlank()) score += 25
            if (!u.bio.isNullOrBlank()) score += 25
            if (!u.username.isNullOrBlank()) score += 25
            if (!u.phone.isNullOrBlank() || !u.email.isNullOrBlank()) score += 25
            return score
        }
}

@HiltViewModel
class ProfileViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    savedStateHandle: SavedStateHandle,
    private val userRepository: UserRepository,
    private val conversationRepository: ConversationRepository,
    private val friendsRepository: FriendsRepository,
    private val authRepository: AuthRepository,
    private val restApi: SupabaseRestApi,
    private val storageApi: SupabaseStorageApi,
    private val sessionStore: SessionStore,
    private val settingsPreferences: app.gagachat.core.data.preferences.SettingsPreferences,
    private val dispatchers: DispatcherProvider,
) : ViewModel() {

    private val requestedId: String = savedStateHandle.get<String>("userId").orEmpty()
    private val currentUserId: String = authRepository.sessionFlow.value?.userId.orEmpty()
    private val userId: String = requestedId.ifBlank { currentUserId }

    private val _state = MutableStateFlow(ProfileUiState(userId = userId, isSelf = userId == currentUserId))
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch { settingsPreferences.accountPrivacy.collect { value -> _state.update { it.copy(privacy = value) } } }
        viewModelScope.launch {
            userRepository.observeUser(userId).collect { user ->
                _state.update {
                    it.copy(
                        user = user,
                        isLoading = false,
                        // Real social-graph sizes cached on the user row.
                        followersCount = user?.followersCount ?: it.followersCount,
                        followingCount = user?.followingCount ?: it.followingCount,
                    )
                }
            }
        }
        viewModelScope.launch {
            when (val result = userRepository.refreshUser(userId)) {
                is AppResult.Failure -> _state.update { it.copy(errorMessage = result.error.toUserMessage(), isLoading = false) }
                else -> Unit
            }
        }
        // Friends count powers the stats row on the profile header. Followers /
        // following come from the cached user row (see observeUser above).
        viewModelScope.launch {
            friendsRepository.friends.collect { list ->
                if (_state.value.isSelf) _state.update { it.copy(friendsCount = list.size) }
            }
        }
    }

    fun consumeError() = _state.update { it.copy(errorMessage = null) }

    fun consumeCoverError() = _state.update { it.copy(coverUploadError = null) }

    /**
     * Reads the picked image, uploads it to the public `media` bucket under the
     * caller's own folder and persists the resulting URL to `users.cover_image`.
     * Keeps the previous cover if the upload fails, surfacing a friendly error.
     */
    fun onCoverPhotoPicked(uri: Uri) {
        val uid = sessionStore.userId()
        if (uid.isNullOrBlank()) {
            _state.update { it.copy(coverUploadError = "Your session has expired. Please sign in again.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isUploadingCover = true, coverUploadProgress = 0, coverUploadError = null) }
            val url = withContext(dispatchers.io) {
                runCatching {
                    // Downscale + re-encode so a multi-megapixel photo never
                    // becomes a slow upload or a heavy banner image.
                    val (bytes, mime) = compressCoverImage(uri)
                        ?: error("Could not read the selected image")
                    val extension = when {
                        mime.contains("png") -> "png"
                        mime.contains("webp") -> "webp"
                        else -> "jpg"
                    }
                    storageApi.uploadToBucket(
                        bucket = COVER_BUCKET,
                        objectPath = storageApi.coverObjectPath(uid, "photo", extension),
                        bytes = bytes,
                        mime = mime,
                        onProgress = { p -> _state.update { it.copy(coverUploadProgress = p) } },
                    )
                }.getOrNull()
            }
            if (url == null) {
                _state.update {
                    it.copy(
                        isUploadingCover = false,
                        coverUploadError = "Couldn't upload the cover photo. Please try again.",
                    )
                }
                return@launch
            }
            persistCover(uid, url, isVideo = false)
        }
    }

    /**
     * Copies the picked video into cache, validates size/duration, streams it to
     * the public `media` bucket and persists `users.cover_video`. Cover videos are
     * bounded (100 MB / 60 s) so the profile header stays fast to load.
     */
    fun onCoverVideoPicked(uri: Uri) {
        val uid = sessionStore.userId()
        if (uid.isNullOrBlank()) {
            _state.update { it.copy(coverUploadError = "Your session has expired. Please sign in again.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isUploadingCover = true, coverUploadProgress = 0, coverUploadError = null) }
            val local = withContext(dispatchers.io) { copyToCache(uri) }
            if (local == null) {
                _state.update { it.copy(isUploadingCover = false, coverUploadError = "Couldn't read the selected video.") }
                return@launch
            }
            val (path, mime, size) = local
            if (size > MAX_COVER_VIDEO_BYTES) {
                _state.update {
                    it.copy(isUploadingCover = false, coverUploadError = "This video is too large. Choose one under 100 MB.")
                }
                return@launch
            }
            val duration = withContext(dispatchers.io) { videoDuration(path) } ?: 0L
            if (duration > MAX_COVER_VIDEO_MS) {
                _state.update {
                    it.copy(isUploadingCover = false, coverUploadError = "This video is too long. Choose one under 60 seconds.")
                }
                return@launch
            }
            val url = withContext(dispatchers.io) {
                runCatching {
                    val extension = mime.substringAfterLast('/', "mp4")
                    storageApi.uploadFileToBucket(
                        bucket = COVER_BUCKET,
                        objectPath = storageApi.coverObjectPath(uid, "video", extension),
                        file = File(path),
                        mime = mime,
                        onProgress = { p -> _state.update { it.copy(coverUploadProgress = p) } },
                    )
                }.getOrNull()
            }
            if (url == null) {
                _state.update {
                    it.copy(
                        isUploadingCover = false,
                        coverUploadError = "Couldn't upload the cover video. Please try again.",
                    )
                }
                return@launch
            }
            persistCover(uid, url, isVideo = true)
        }
    }

    /**
     * Writes the uploaded cover URL to the correct backend column \u2014
     * `users.cover_video` for a video, `users.cover_image` for a photo \u2014 and
     * refreshes the cache. Previously both were written to `cover_image`, so a
     * cover video never rendered (and clobbered the photo). Because the Ktor JSON
     * config uses `explicitNulls = false`, the untouched column is not serialised
     * and therefore never nulled out.
     */
    private suspend fun persistCover(uid: String, url: String, isVideo: Boolean) {
        val row = if (isVideo) UserRow(id = uid, coverVideo = url) else UserRow(id = uid, coverImage = url)
        val ok = withContext(dispatchers.io) {
            runCatching { restApi.upsertUser(row) }.isSuccess
        }
        if (ok) {
            withContext(dispatchers.io) { runCatching { userRepository.refreshUser(uid) } }
            _state.update { it.copy(isUploadingCover = false, coverUploadProgress = 100) }
        } else {
            _state.update {
                it.copy(isUploadingCover = false, coverUploadError = "Couldn't save your cover. Please try again.")
            }
        }
    }

    /** Copies a picked `content://` video into app cache and returns (path, mime, size). */
    private fun copyToCache(uri: Uri): Triple<String, String, Long>? = runCatching {
        val mime = context.contentResolver.getType(uri) ?: "video/mp4"
        val ext = mime.substringAfterLast('/', "mp4")
        val target = File(context.cacheDir, "cover_${System.currentTimeMillis()}.$ext")
        context.contentResolver.openInputStream(uri)?.use { input ->
            target.outputStream().use { output -> input.copyTo(output) }
        } ?: return null
        Triple(target.absolutePath, mime, target.length())
    }.getOrNull()

    private fun videoDuration(path: String): Long? = runCatching {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(path)
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
        } finally {
            retriever.release()
        }
    }.getOrNull()

    /**
     * Decodes the picked cover image, downscales it so its longest edge is at
     * most [MAX_COVER_EDGE] px, and re-encodes it. PNG stays PNG (so any
     * transparency survives); everything else becomes a quality-88 JPEG. Returns
     * the encoded bytes plus the mime to upload, or null if it can't be read.
     */
    private fun compressCoverImage(uri: Uri): Pair<ByteArray, String>? = runCatching {
        val resolver = context.contentResolver
        val sourceMime = resolver.getType(uri) ?: "image/jpeg"
        // First pass: read only the dimensions so we can pick a sample size.
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        val longest = maxOf(bounds.outWidth, bounds.outHeight)
        var sample = 1
        while (longest > 0 && longest / sample > MAX_COVER_EDGE * 2) sample *= 2
        val decoded = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: return null
        val scaled = scaleDown(decoded, MAX_COVER_EDGE)
        val isPng = sourceMime.contains("png")
        val format = if (isPng) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
        val mime = if (isPng) "image/png" else "image/jpeg"
        val out = ByteArrayOutputStream()
        scaled.compress(format, 88, out)
        if (scaled !== decoded) decoded.recycle()
        scaled.recycle()
        out.toByteArray() to mime
    }.getOrNull()

    /** Scales a bitmap down so its longest edge is at most [maxEdge] px. */
    private fun scaleDown(src: Bitmap, maxEdge: Int): Bitmap {
        val longest = maxOf(src.width, src.height)
        if (longest <= maxEdge) return src
        val ratio = maxEdge.toFloat() / longest
        val w = (src.width * ratio).toInt().coerceAtLeast(1)
        val h = (src.height * ratio).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(src, w, h, true)
    }

    /**
     * Opens (or creates) the DIRECT conversation with this profile's user and
     * hands the resolved conversation id back to the caller. Previously the
     * "Message" button navigated to the profile again, so it never reached a chat.
     */
    fun openChat(onReady: (conversationId: String) -> Unit) {
        val me = authRepository.sessionFlow.value?.userId
        if (me.isNullOrBlank() || userId.isBlank()) return
        viewModelScope.launch {
            when (val result = conversationRepository.openDirectConversation(me, userId)) {
                is AppResult.Success -> onReady(result.data)
                is AppResult.Failure -> _state.update { it.copy(errorMessage = result.error.toUserMessage()) }
                AppResult.Loading -> Unit
            }
        }
    }

    /**
     * Resolves the DIRECT conversation with this profile's user, then starts a
     * voice/video call on it. Previously the raw userId was passed where a
     * conversationId was expected, so the call screen opened on a bogus id.
     */
    fun startCall(isVideo: Boolean, onReady: (conversationId: String, isVideo: Boolean) -> Unit) {
        val me = authRepository.sessionFlow.value?.userId
        if (me.isNullOrBlank() || userId.isBlank()) return
        viewModelScope.launch {
            when (val result = conversationRepository.openDirectConversation(me, userId)) {
                is AppResult.Success -> onReady(result.data, isVideo)
                is AppResult.Failure -> _state.update { it.copy(errorMessage = result.error.toUserMessage()) }
                AppResult.Loading -> Unit
            }
        }
    }

    private companion object {
        /** Public bucket that holds profile covers (photos and videos). */
        const val COVER_BUCKET = "media"
        const val MAX_COVER_VIDEO_BYTES = 100L * 1024 * 1024
        const val MAX_COVER_VIDEO_MS = 60L * 1000
        /** Longest edge (px) a cover photo is downscaled to before upload. */
        const val MAX_COVER_EDGE = 1600
    }
}
