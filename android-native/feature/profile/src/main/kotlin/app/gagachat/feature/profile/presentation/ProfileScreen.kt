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

/** Warm gold used for the avatar ring + PRO badge (reference 173846). */
private val ProfileGold = Color(0xFFF5A623)

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
    onOpenMore: () -> Unit = {},
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

    GagaScaffold(
        title = if (state.isSelf) "My Profile" else "Profile",
        onBack = onNavigateBack,
        snackbarHostState = snackbarHostState,
        actions = {
            // The More menu lives here (inside the profile), not on the chat tab.
            IconButton(onClick = onOpenMore) {
                Icon(Icons.Filled.MoreVert, contentDescription = "More")
            }
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
                CompletenessCard(percent = state.completeness)
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

            // Personal Hub (self only). This is the "Profile = My Profile +
            // Personal Hub" architecture: the separate "Me" screen is gone and
            // all personal/account destinations live here.
            if (state.isSelf) {
                Spacer(Modifier.height(GagaDimens.space8))
                GagaDivider()
                GagaSectionHeader("PERSONAL")
                GagaSettingsRow(
                    title = "My QR",
                    subtitle = "Share and scan",
                    leadingIcon = Icons.Filled.QrCode2,
                    leadingIconTint = HubPurple,
                    trailing = { ChevronRight() },
                    onClick = onOpenMyQr,
                )
                GagaDivider()
                GagaSettingsRow(
                    title = "Saved Messages",
                    subtitle = "Your private notes and bookmarks",
                    leadingIcon = Icons.Filled.Bookmark,
                    leadingIconTint = HubTeal,
                    trailing = { ChevronRight() },
                    onClick = onOpenSavedMessages,
                )
                GagaDivider()
                GagaSettingsRow(
                    title = "GaGa Wallet",
                    subtitle = "GaGa Coin and payments",
                    leadingIcon = Icons.Filled.AccountBalanceWallet,
                    leadingIconTint = HubAmber,
                    trailing = { ChevronRight() },
                    onClick = onOpenWallet,
                )
                GagaDivider()

                GagaSectionHeader("ACCOUNT & APP")
                GagaSettingsRow(
                    title = "Settings",
                    subtitle = "Theme, language, privacy, data & more",
                    leadingIcon = Icons.Filled.Settings,
                    leadingIconTint = HubBlue,
                    trailing = { ChevronRight() },
                    onClick = onOpenSettings,
                )
                GagaDivider()
                GagaSettingsRow(
                    title = "Privacy & Security",
                    leadingIcon = Icons.Filled.Security,
                    leadingIconTint = HubGreen,
                    trailing = { ChevronRight() },
                    onClick = onOpenPrivacy,
                )
                GagaDivider()
                GagaSettingsRow(
                    title = "Blocked Users",
                    leadingIcon = Icons.Filled.Block,
                    leadingIconTint = HubRed,
                    trailing = { ChevronRight() },
                    onClick = onOpenBlocked,
                )
                GagaDivider()
                GagaSettingsRow(
                    title = "Language",
                    leadingIcon = Icons.Filled.Language,
                    trailing = { ChevronRight() },
                    onClick = onOpenLanguage,
                )
                GagaDivider()
                GagaSettingsRow(
                    title = "Storage & Data",
                    leadingIcon = Icons.Filled.Storage,
                    trailing = { ChevronRight() },
                    onClick = onOpenStorage,
                )
                GagaDivider()

                GagaSectionHeader("SUPPORT")
                GagaSettingsRow(
                    title = "Help & Support",
                    leadingIcon = Icons.Filled.HelpOutline,
                    trailing = { ChevronRight() },
                    onClick = onOpenHelp,
                )
                GagaDivider()
                GagaSettingsRow(
                    title = "About GaGa",
                    leadingIcon = Icons.Filled.Info,
                    trailing = { ChevronRight() },
                    onClick = onOpenAbout,
                )
                GagaDivider()
            }
            Spacer(Modifier.height(GagaDimens.space48))
        }
    }
}

/** Cover banner + overlapping avatar + name/handle + stats row. */
@Composable
private fun ProfileHeader(
    user: User?,
    isSelf: Boolean,
    onEditPhoto: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxWidth()) {
        // Mint cover banner (falls back to the brand mint; a custom cover image
        // is layered on top when the user has set one).
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(150.dp)
                .background(GagaGreenContainer),
        )
        if (isSelf) {
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(GagaDimens.space12),
                horizontalArrangement = Arrangement.spacedBy(GagaDimens.space8),
            ) {
                // Reference 173846 shows two upload chips on the cover.
                CoverChip("Photo", onClick = onEditPhoto)
                CoverChip("Video", onClick = onEditPhoto)
            }
        }

        // Overlapping avatar with a gold ring + verified check.
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .offset(y = 48.dp),
        ) {
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(3.dp)
                    .clip(CircleShape)
                    .border(width = 3.dp, color = ProfileGold, shape = CircleShape)
                    .padding(2.dp),
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
    val container = if (primary) GagaGreen else MaterialTheme.colorScheme.surfaceVariant
    val content = if (primary) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        modifier = modifier
            .height(46.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(container)
            .clickable(onClick = onClick)
            .padding(horizontal = GagaDimens.space8),
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
            maxLines = 1,
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
private fun CompletenessCard(percent: Int) {
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
            StatusTag("Online status visible")
            StatusTag("Friend list visible")
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

/** Small "Coming Soon" pill used for not-yet-available features. */
@Composable
private fun ComingSoonBadge() {
    Text(
        text = "Coming Soon",
        style = MaterialTheme.typography.labelSmall,
        color = GagaGreen,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(GagaGreenContainer)
            .padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space2),
    )
}
