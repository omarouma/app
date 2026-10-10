package app.gagachat.feature.profile.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.User
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaSettingsRow
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaGreenContainer
import app.gagachat.core.ui.util.TimeFormat
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.widget.MediaController
import android.widget.VideoView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.compose.SubcomposeAsyncImage
import android.content.Context
import android.graphics.Matrix
import android.graphics.SurfaceTexture
import android.media.MediaPlayer
import android.view.Surface
import android.view.TextureView
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.key
import androidx.compose.ui.graphics.painter.ColorPainter
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Warm gold used for the avatar ring + PRO badge (reference 173846). */
private val ProfileGold = Color(0xFFF5A623)

/** A cover tapped for full-screen viewing, tagged with whether it is a video. */
private data class CoverViewer(val url: String, val isVideo: Boolean)

// Coloured leading icons for the Personal Hub / Account rows (reference 173846).
private val HubPurple = Color(0xFF7E57C2)
private val HubTeal = Color(0xFF26A69A)
private val HubAmber = Color(0xFFF2B705)
private val HubBlue = Color(0xFF2F80ED)
private val HubGreen = Color(0xFF00A651)
private val HubRed = Color(0xFFEB5757)

@Composable
fun ProfileRoute(
    onNavigateBack: () -> Unit,
    onOpenConversation: (conversationId: String) -> Unit,
    onStartCall: (conversationId: String, isVideo: Boolean) -> Unit,
    onEditProfile: () -> Unit = {},
    onOpenPrivacy: () -> Unit = {},
    onShare: (String) -> Unit = {},
    // Personal Hub (self profile only).
    onOpenMyQr: () -> Unit = {},
    onOpenSavedMessages: () -> Unit = {},
    onOpenWallet: () -> Unit = {},
    onOpenSettings: () -> Unit = {},
    onOpenBlocked: () -> Unit = {},
    onOpenLanguage: () -> Unit = {},
    onOpenStorage: () -> Unit = {},
    onOpenHelp: () -> Unit = {},
    onOpenAbout: () -> Unit = {},
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeError()
        }
    }

    LaunchedEffect(state.coverUploadError) {
        state.coverUploadError?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeCoverError()
        }
    }

    // Real cover pickers: the photo chip opens the image-only system picker and
    // the video chip the video-only one. Both hand the Uri to the ViewModel, which
    // uploads to Storage and persists `users.cover_image`.
    val coverPhotoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri -> uri?.let(viewModel::onCoverPhotoPicked) }
    val coverVideoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri -> uri?.let(viewModel::onCoverVideoPicked) }
    // Full-screen media viewers: the cover (photo or looping video) and the avatar.
    var coverViewer by remember { mutableStateOf<CoverViewer?>(null) }
    var avatarViewerUrl by remember { mutableStateOf<String?>(null) }

    GagaScaffold(
        title = if (state.isSelf) "Me" else "Profile",
        onBack = onNavigateBack,
        snackbarHostState = snackbarHostState,
        actions = {
            // The Me tab IS the account hub now (the old "More" menu was removed),
            // so a single Settings shortcut is all that belongs here.
            if (state.isSelf) {
                IconButton(onClick = onOpenSettings) {
                    Icon(Icons.Filled.Settings, contentDescription = "Settings")
                }
            }
        },
    ) { padding ->
        val user = state.user
        if (state.isLoading && user == null) {
            GagaLoading(modifier = Modifier.padding(padding))
            return@GagaScaffold
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            ProfileHeader(
                user = user,
                isSelf = state.isSelf,
                isUploadingCover = state.isUploadingCover,
                coverUploadProgress = state.coverUploadProgress,
                onPickCoverPhoto = {
                    coverPhotoPicker.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
                onPickCoverVideo = {
                    coverVideoPicker.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly),
                    )
                },
                onOpenCover = { url, isVideo -> coverViewer = CoverViewer(url, isVideo) },
                onOpenAvatar = { url -> avatarViewerUrl = url },
                onEditPhoto = onEditProfile,
            )

            Spacer(Modifier.height(GagaDimens.space16))

            // Action buttons -------------------------------------------------
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16),
                horizontalArrangement = Arrangement.spacedBy(GagaDimens.space8),
            ) {
                if (state.isSelf) {
                    ProfileActionButton(
                        icon = Icons.Filled.Edit,
                        label = "Edit Profile",
                        primary = true,
                        onClick = onEditProfile,
                        modifier = Modifier.weight(1f),
                    )
                    ProfileActionButton(
                        icon = Icons.Filled.Lock,
                        label = "Privacy",
                        onClick = onOpenPrivacy,
                        modifier = Modifier.weight(1f),
                    )
                    ProfileActionButton(
                        icon = Icons.Filled.Share,
                        label = "Share",
                        onClick = {
                            onShare("https://gagachat.app/u/${user?.username ?: user?.id.orEmpty()}")
                        },
                        modifier = Modifier.weight(1f),
                    )
                } else {
                    ProfileActionButton(
                        icon = Icons.Filled.Chat,
                        label = "Message",
                        primary = true,
                        onClick = { viewModel.openChat(onOpenConversation) },
                        modifier = Modifier.weight(1f),
                    )
                    ProfileActionButton(
                        icon = Icons.Filled.Call,
                        label = "Call",
                        onClick = { viewModel.startCall(false, onStartCall) },
                        modifier = Modifier.weight(1f),
                    )
                    ProfileActionButton(
                        icon = Icons.Filled.Videocam,
                        label = "Video",
                        onClick = { viewModel.startCall(true, onStartCall) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            // Stats card (Friends / Followers / Following) -------------------
            Spacer(Modifier.height(GagaDimens.space16))
            ProfileStatsCard(
                friendsCount = state.friendsCount,
                followersCount = state.followersCount,
                followingCount = state.followingCount,
            )

            // Profile completeness (self only) -------------------------------
            if (state.isSelf) {
                Spacer(Modifier.height(GagaDimens.space20))
                CompletenessCard(percent = state.completeness, privacy = state.privacy, onPrivacy = onOpenSettings)
            }

            // Contact info ---------------------------------------------------
            // Email/phone are the signed-in user's own PII and must never be
            // rendered on someone else's profile. For other users we show only
            // public, non-sensitive identity facts.
            Spacer(Modifier.height(GagaDimens.space16))
            GagaDivider()
            GagaSectionHeader("Contact info")
            if (state.isSelf) {
                GagaSettingsRow(title = "Email", subtitle = user?.email ?: "Not added")
                GagaDivider()
                GagaSettingsRow(title = "Phone", subtitle = user?.phone ?: "Not added")
            } else {
                GagaSettingsRow(
                    title = "Username",
                    subtitle = user?.username?.takeIf { it.isNotBlank() }?.let { "@$it" } ?: "Not set",
                )
            }
            user?.lastSeen?.let {
                GagaDivider()
                GagaSettingsRow(title = "Last seen", subtitle = TimeFormat.lastSeen(it))
            }

            // "Me" hub (self only). Per the agreed navigation (Chats · People ·
            // Calls · Me), the old standalone "More" screen is gone and the Me
            // tab is the single account hub. Settings owns the full preference
            // tree, so Me only surfaces the essentials — QR, Saved Messages,
            // Settings and Support — instead of duplicating every settings row.
            // All non-destructive leading icons share the one GaGa brand green.
            if (state.isSelf) {
                Spacer(Modifier.height(GagaDimens.space8))
                GagaDivider()
                GagaSectionHeader("MY ACCOUNT")
                GagaSettingsRow(
                    title = "My QR Code",
                    subtitle = "Let others add you instantly",
                    leadingIcon = Icons.Filled.QrCode2,
                    leadingIconTint = GagaGreen,
                    trailing = { ChevronRight() },
                    onClick = onOpenMyQr,
                )
                GagaDivider()
                GagaSettingsRow(
                    title = "GaGa Wallet",
                    subtitle = "Coins and activity • top-up availability varies",
                    leadingIcon = Icons.Filled.AccountBalanceWallet,
                    leadingIconTint = GagaGreen,
                    trailing = { ChevronRight() },
                    onClick = onOpenWallet,
                )
                GagaDivider()
                GagaSettingsRow(
                    title = "Saved Messages",
                    subtitle = "Your private notes and bookmarks",
                    leadingIcon = Icons.Filled.Bookmark,
                    leadingIconTint = GagaGreen,
                    trailing = { ChevronRight() },
                    onClick = onOpenSavedMessages,
                )
                GagaDivider()
                GagaSettingsRow(
                    title = "Settings",
                    subtitle = "Privacy, security, notifications, data & more",
                    leadingIcon = Icons.Filled.Settings,
                    leadingIconTint = GagaGreen,
                    trailing = { ChevronRight() },
                    onClick = onOpenSettings,
                )
                GagaDivider()

                GagaSectionHeader("SUPPORT")
                GagaSettingsRow(
                    title = "Help & Support",
                    subtitle = "FAQs, guides and contact",
                    leadingIcon = Icons.Filled.HelpOutline,
                    leadingIconTint = GagaGreen,
                    trailing = { ChevronRight() },
                    onClick = onOpenHelp,
                )
                GagaDivider()
                GagaSettingsRow(
                    title = "About GaGa",
                    leadingIcon = Icons.Filled.Info,
                    leadingIconTint = GagaGreen,
                    trailing = { ChevronRight() },
                    onClick = onOpenAbout,
                )
                GagaDivider()
            }
            Spacer(Modifier.height(GagaDimens.space48))
        }

        // Full-screen media viewers (opened by tapping the cover or the avatar).
        coverViewer?.let { viewer ->
            if (viewer.isVideo) {
                CoverVideoDialog(url = viewer.url, onDismiss = { coverViewer = null })
            } else {
                FullScreenPhotoDialog(url = viewer.url, onDismiss = { coverViewer = null })
            }
        }
        avatarViewerUrl?.let { url ->
            FullScreenPhotoDialog(url = url, onDismiss = { avatarViewerUrl = null })
        }
    }
}

/** Cover banner + overlapping avatar + name/handle + stats row. */
@Composable
private fun ProfileHeader(
    user: User?,
    isSelf: Boolean,
    isUploadingCover: Boolean,
    coverUploadProgress: Int,
    onPickCoverPhoto: () -> Unit,
    onPickCoverVideo: () -> Unit,
    onOpenCover: (url: String, isVideo: Boolean) -> Unit,
    onOpenAvatar: (String) -> Unit,
    onEditPhoto: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxWidth()) {
        // Cover banner: renders the user's cover media (photo or video) when set,
        // otherwise the brand mint fallback.
        CoverBanner(
            coverImage = user?.coverImage,
            coverVideo = user?.coverVideo,
            onOpen = onOpenCover,
        )

        if (isUploadingCover) {
            // Upload progress overlay so a slow cover upload is never ambiguous.
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(150.dp)
                    .background(Color.Black.copy(alpha = 0.45f)),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(
                        color = Color.White,
                        progress = { coverUploadProgress / 100f },
                    )
                    Spacer(Modifier.height(GagaDimens.space8))
                    Text(
                        text = "Uploading $coverUploadProgress%",
                        style = MaterialTheme.typography.labelMedium,
                        color = Color.White,
                    )
                }
            }
        }

        if (isSelf && !isUploadingCover) {
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(GagaDimens.space12),
                horizontalArrangement = Arrangement.spacedBy(GagaDimens.space8),
            ) {
                // Reference 173846 shows two upload chips on the cover.
                CoverChip("Photo", onClick = onPickCoverPhoto)
                CoverChip("Video", onClick = onPickCoverVideo)
            }
        }

        // Overlapping avatar with a gold ring + verified check.
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .offset(y = 48.dp),
        ) {
            val avatarUrl = user?.avatar?.takeIf { it.isNotBlank() }
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(3.dp)
                    .clip(CircleShape)
                    .border(width = 3.dp, color = ProfileGold, shape = CircleShape)
                    .padding(2.dp)
                    .then(
                        if (avatarUrl != null) {
                            Modifier.clickable { onOpenAvatar(avatarUrl) }
                        } else {
                            Modifier
                        },
                    ),
            ) {
                GagaAvatar(
                    imageUrl = user?.avatar,
                    name = user?.displayLabel,
                    size = GagaDimens.avatarXLarge,
                    status = user?.status,
                    showStatus = false,
                )
            }
            if (isSelf) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(30.dp)
                        .clip(CircleShape)
                        .background(GagaGreen)
                        .border(width = 2.dp, color = MaterialTheme.colorScheme.surface, shape = CircleShape)
                        .clickable(onClick = onEditPhoto),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Filled.CameraAlt,
                        contentDescription = "Change photo",
                        tint = Color.White,
                        modifier = Modifier.size(GagaDimens.iconSmall),
                    )
                }
            } else if (user?.isVerified == true) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(GagaGreen)
                        .border(width = 2.dp, color = MaterialTheme.colorScheme.surface, shape = CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Filled.Check,
                        contentDescription = "Verified",
                        tint = Color.White,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        }
    }

    Spacer(Modifier.height(56.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space24),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = user?.displayLabel ?: "GaGa User",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            if (user?.isVerified == true) {
                Spacer(Modifier.width(GagaDimens.space4))
                Icon(
                    Icons.Filled.Verified,
                    contentDescription = "Verified",
                    tint = GagaGreen,
                    modifier = Modifier.size(GagaDimens.iconMedium),
                )
            }
            if (user?.isPremium == true) {
                Spacer(Modifier.width(GagaDimens.space6))
                ProBadge()
            }
        }
        user?.username?.let {
            Spacer(Modifier.height(GagaDimens.space2))
            Text(
                text = "@$it",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        // Presence / status line (e.g. "GaGa Appears"), then the bio.
        val presence = user?.statusMessage?.takeIf { it.isNotBlank() }
            ?: user?.bio?.takeIf { it.isNotBlank() }
        presence?.let {
            Spacer(Modifier.height(GagaDimens.space8))
            Text(
                text = it,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }
        user?.website?.takeIf { it.isNotBlank() }?.let { site ->
            Spacer(Modifier.height(GagaDimens.space4))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.Link,
                    contentDescription = null,
                    tint = GagaGreen,
                    modifier = Modifier.size(GagaDimens.iconSmall),
                )
                Spacer(Modifier.width(GagaDimens.space4))
                Text(
                    text = site.removePrefix("https://").removePrefix("http://").trimEnd('/'),
                    style = MaterialTheme.typography.bodyMedium,
                    color = GagaGreen,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

/**
 * Distinct white rounded card holding the Friends / Followers / Following
 * counters (reference 173846). Sits below the action-button row.
 */
@Composable
private fun ProfileStatsCard(
    friendsCount: Int,
    followersCount: Int,
    followingCount: Int,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space16)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp))
            .padding(vertical = GagaDimens.space16),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StatColumn(friendsCount, "Friends")
        StatColumn(followersCount, "Followers")
        StatColumn(followingCount, "Following")
    }
}

@Composable
private fun StatColumn(value: Int, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value.toString(),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Compact pill action used in the profile's three-button row (reference 173846). */
@Composable
private fun ProfileActionButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
) {
    val container = if (primary) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
    val content = if (primary) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        modifier = modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(container)
            .clickable(onClick = onClick)
            .padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space12),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = content, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(GagaDimens.space6))
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = content,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
    }
}

@Composable
private fun CoverChip(label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(Color.White)
            .clickable(onClick = onClick)
            .padding(horizontal = GagaDimens.space12, vertical = GagaDimens.space4),
    ) {
        Text(text = label, style = MaterialTheme.typography.labelMedium, color = GagaGreen)
    }
}

/** True when a cover URL points at a video object (by file extension). */
private fun looksLikeVideo(url: String): Boolean {
    val path = url.substringBefore('?').lowercase()
    return path.endsWith(".mp4") || path.endsWith(".mov") || path.endsWith(".m4v") ||
        path.endsWith(".webm") || path.endsWith(".3gp") || path.endsWith(".mkv")
}

/**
 * Renders the profile cover: a continuously-looping, muted video (with an
 * instant poster frame), a photo via Coil, or the brand mint fallback when
 * nothing is set. Tapping either opens it full-screen.
 */
@Composable
private fun CoverBanner(
    coverImage: String?,
    coverVideo: String?,
    onOpen: (url: String, isVideo: Boolean) -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(150.dp)
            .background(GagaGreenContainer),
    ) {
        // A dedicated cover *video* always wins; otherwise fall back to the photo.
        // We also tolerate legacy rows where a video URL was previously written
        // into `cover_image` (before the columns were split).
        val video = coverVideo?.takeIf { it.isNotBlank() }
            ?: coverImage?.takeIf { it.isNotBlank() && looksLikeVideo(it) }
        val photo = coverImage?.takeIf { it.isNotBlank() && !looksLikeVideo(it) }
        when {
            video != null -> key(video) {
                CoverVideoPlayer(url = video, onClick = { onOpen(video, true) })
            }
            photo != null -> Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clickable { onOpen(photo, false) },
            ) {
                AsyncImage(
                    model = photo,
                    contentDescription = "Profile cover",
                    contentScale = ContentScale.Crop,
                    placeholder = ColorPainter(GagaGreenContainer),
                    error = ColorPainter(GagaGreenContainer),
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}

/**
 * Inline cover video: a muted, continuously-looping player that starts as soon
 * as its surface is ready and pauses with the host lifecycle so it never keeps
 * decoding in the background. The first frame is shown immediately as a poster
 * so the banner is never blank while the player prepares.
 */
@Composable
private fun CoverVideoPlayer(url: String, onClick: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val poster by produceState<Bitmap?>(initialValue = null, url) {
        value = withContext(Dispatchers.IO) { extractVideoFrame(context, url) }
    }
    val holder = remember { CoverVideoHolder() }
    DisposableEffect(lifecycleOwner, url) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> holder.resume()
                Lifecycle.Event.ON_STOP -> holder.pause()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        // The host is usually already STARTED by the time this composes, so the
        // observer would never receive ON_START — kick playback off right away.
        if (lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
            holder.resume()
        }
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            holder.release()
        }
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        poster?.let {
            Image(
                bitmap = it.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx -> TextureView(ctx).apply { holder.attach(ctx, this, url) } },
        )
        // The looping cover is silent by design; make that explicit and hint that
        // tapping opens it with sound + controls.
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(GagaDimens.space8)
                .size(28.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.45f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.VolumeOff,
                contentDescription = "Cover video is muted. Tap to open with sound.",
                tint = Color.White,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

/** Extracts the first frame of a local or remote video for use as a poster. */
private fun extractVideoFrame(context: Context, url: String): Bitmap? = runCatching {
    val retriever = MediaMetadataRetriever()
    try {
        if (url.startsWith("http")) {
            retriever.setDataSource(url, HashMap())
        } else {
            retriever.setDataSource(context, Uri.parse(url))
        }
        retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
    } finally {
        retriever.release()
    }
}.getOrNull()

/** Full-screen cover-video player (platform VideoView with media controls). */
@Composable
private fun CoverVideoDialog(url: String, onDismiss: () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black),
            contentAlignment = Alignment.Center,
        ) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    VideoView(context).apply {
                        setMediaController(MediaController(context).also { it.setAnchorView(this) })
                        if (url.startsWith("content://") || url.startsWith("http")) {
                            setVideoURI(Uri.parse(url))
                        } else {
                            setVideoPath(url)
                        }
                        setOnPreparedListener { it.isLooping = true }
                        setOnErrorListener { _, _, _ -> true }
                        start()
                    }
                },
            )
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(GagaDimens.space12),
            ) {
                Icon(Icons.Filled.Close, contentDescription = "Close", tint = Color.White)
            }
        }
    }
}

/**
 * Owns the platform [MediaPlayer] + [TextureView] used by the inline cover
 * video. The player loops forever, is muted, and scales its output to
 * CENTER_CROP so the banner is always filled regardless of the clip's aspect
 * ratio. Every call is safe to make from the main thread.
 */
private class CoverVideoHolder {
    private var player: MediaPlayer? = null
    private var surface: Surface? = null
    private var prepared = false
    private var shouldPlay = false
    private var videoWidth = 0
    private var videoHeight = 0

    fun attach(context: Context, view: TextureView, url: String) {
        view.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
            override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
                val s = Surface(st)
                surface = s
                val mp = MediaPlayer()
                mp.setSurface(s)
                mp.setVolume(0f, 0f)
                mp.isLooping = true
                mp.setOnVideoSizeChangedListener { _, w, h ->
                    videoWidth = w
                    videoHeight = h
                    applyCenterCrop(view, w, h)
                }
                mp.setOnPreparedListener {
                    prepared = true
                    applyCenterCrop(view, videoWidth, videoHeight)
                    if (shouldPlay) runCatching { it.start() }
                }
                mp.setOnErrorListener { _, _, _ -> true }
                player = mp
                runCatching {
                    if (url.startsWith("http") || url.startsWith("content://")) {
                        mp.setDataSource(context, Uri.parse(url))
                    } else {
                        mp.setDataSource(url)
                    }
                    mp.prepareAsync()
                }.onFailure { release() }
            }

            override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) {
                if (videoWidth > 0 && videoHeight > 0) applyCenterCrop(view, videoWidth, videoHeight)
            }

            override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
                release()
                return true
            }

            override fun onSurfaceTextureUpdated(st: SurfaceTexture) = Unit
        }
    }

    fun resume() {
        shouldPlay = true
        player?.takeIf { prepared }?.let { if (!it.isPlaying) runCatching { it.start() } }
    }

    fun pause() {
        shouldPlay = false
        player?.takeIf { prepared }?.let { if (it.isPlaying) runCatching { it.pause() } }
    }

    fun release() {
        prepared = false
        player?.let { mp ->
            runCatching { if (mp.isPlaying) mp.stop() }
            runCatching { mp.reset() }
            runCatching { mp.release() }
        }
        player = null
        surface?.release()
        surface = null
    }

    /** Scales the video to fill the view (CENTER_CROP) via a TextureView matrix. */
    private fun applyCenterCrop(view: TextureView, vw: Int, vh: Int) {
        val viewW = view.width.toFloat()
        val viewH = view.height.toFloat()
        if (viewW <= 0f || viewH <= 0f || vw <= 0 || vh <= 0) return
        val scale = maxOf(viewW / vw, viewH / vh)
        val dx = (viewW - vw * scale) / 2f
        val dy = (viewH - vh * scale) / 2f
        view.setTransform(Matrix().apply {
            setScale(scale, scale)
            postTranslate(dx, dy)
        })
    }
}

/**
 * Full-screen, zoomable photo viewer for the cover photo and the avatar.
 * Pinch to zoom, drag to pan, double-tap to toggle zoom, and tap the close
 * button to dismiss. Shows a spinner while loading and a friendly message on
 * error so a broken URL never leaves a blank black screen.
 */
@Composable
private fun FullScreenPhotoDialog(url: String, onDismiss: () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        var scale by remember { mutableFloatStateOf(1f) }
        var offsetX by remember { mutableFloatStateOf(0f) }
        var offsetY by remember { mutableFloatStateOf(0f) }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
                .pointerInput(url) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        scale = (scale * zoom).coerceIn(1f, 5f)
                        if (scale > 1f) {
                            offsetX += pan.x
                            offsetY += pan.y
                        } else {
                            offsetX = 0f
                            offsetY = 0f
                        }
                    }
                }
                .pointerInput(url) {
                    detectTapGestures(
                        onDoubleTap = {
                            if (scale > 1f) {
                                scale = 1f
                                offsetX = 0f
                                offsetY = 0f
                            } else {
                                scale = 2.5f
                            }
                        },
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            SubcomposeAsyncImage(
                model = url,
                contentDescription = "Photo",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer(
                        scaleX = scale,
                        scaleY = scale,
                        translationX = offsetX,
                        translationY = offsetY,
                    ),
                loading = {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Color.White)
                    }
                },
                error = {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = "Couldn't load photo",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White,
                        )
                    }
                },
            )
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(GagaDimens.space12),
            ) {
                Icon(Icons.Filled.Close, contentDescription = "Close", tint = Color.White)
            }
        }
    }
}

@Composable
private fun ProBadge() {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(ProfileGold)
            .padding(horizontal = GagaDimens.space6, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Filled.WorkspacePremium,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(14.dp),
        )
        Spacer(Modifier.width(2.dp))
        Text(
            text = "PRO",
            style = MaterialTheme.typography.labelSmall,
            color = Color.White,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun CompletenessCard(percent: Int, privacy: app.gagachat.core.model.AccountPrivacy, onPrivacy: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space16)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(GagaDimens.space16),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "Profile completeness",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "$percent%",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = GagaGreen,
            )
        }
        Spacer(Modifier.height(GagaDimens.space4))
        Text(
            text = "Add a bio, photo, and links to make your profile feel complete.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(GagaDimens.space12))
        LinearProgressIndicator(
            progress = { percent / 100f },
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(50)),
            color = GagaGreen,
            trackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f),
        )
        Spacer(Modifier.height(GagaDimens.space12))
        Row(horizontalArrangement = Arrangement.spacedBy(GagaDimens.space8)) {
            Box(Modifier.clickable(onClick = onPrivacy)) { StatusTag("Online: " + (if (privacy.onlineStatus == app.gagachat.core.model.PrivacyAudience.SAME_AS_LAST_SEEN) privacy.lastSeen.label else privacy.onlineStatus.label)) }
            Box(Modifier.clickable(onClick = onPrivacy)) { StatusTag("Friends: " + privacy.friendList.label) }
        }
    }
}

@Composable
private fun StatusTag(label: String) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(GagaGreenContainer)
            .padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = GagaGreen,
            modifier = Modifier.size(14.dp),
        )
        Spacer(Modifier.width(GagaDimens.space4))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

/** Trailing chevron used by the Personal Hub rows. */
@Composable
private fun ChevronRight() {
    Icon(
        Icons.AutoMirrored.Filled.KeyboardArrowRight,
        contentDescription = null,
        tint = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.size(GagaDimens.iconMedium),
    )
}
