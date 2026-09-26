package app.gagachat.feature.profile.presentation

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.User
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaLoading
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaSettingsRow
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaGreenContainer
import app.gagachat.core.ui.util.TimeFormat

@Composable
fun ProfileRoute(
    onNavigateBack: () -> Unit,
    onOpenConversation: (conversationId: String) -> Unit,
    onStartCall: (conversationId: String, isVideo: Boolean) -> Unit,
    onEditProfile: () -> Unit = {},
    onOpenPrivacy: () -> Unit = {},
    onShare: (String) -> Unit = {},
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
                friendsCount = state.friendsCount,
                followersCount = state.followersCount,
                followingCount = state.followingCount,
            )

            Spacer(Modifier.height(GagaDimens.space16))

            // Action buttons -------------------------------------------------
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16),
                horizontalArrangement = Arrangement.spacedBy(GagaDimens.space12),
            ) {
                if (state.isSelf) {
                    GagaPrimaryButton(
                        text = "Edit Profile",
                        onClick = onEditProfile,
                        leadingIcon = Icons.Filled.Edit,
                        modifier = Modifier.weight(1f),
                    )
                    GagaSecondaryButton(
                        text = "Privacy",
                        onClick = onOpenPrivacy,
                        leadingIcon = Icons.Filled.Lock,
                        modifier = Modifier.weight(1f),
                    )
                } else {
                    GagaPrimaryButton(
                        text = "Message",
                        onClick = { viewModel.openChat(onOpenConversation) },
                        leadingIcon = Icons.Filled.Chat,
                        modifier = Modifier.weight(1f),
                    )
                    GagaSecondaryButton(
                        text = "Call",
                        onClick = { viewModel.startCall(false, onStartCall) },
                        leadingIcon = Icons.Filled.Call,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            Spacer(Modifier.height(GagaDimens.space8))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16),
                horizontalArrangement = Arrangement.spacedBy(GagaDimens.space12),
            ) {
                if (state.isSelf) {
                    GagaSecondaryButton(
                        text = "Share",
                        onClick = { onShare("https://oumagachat.web.app/u/${user?.username ?: user?.id.orEmpty()}") },
                        leadingIcon = Icons.Filled.Share,
                        modifier = Modifier.weight(1f),
                    )
                } else {
                    GagaSecondaryButton(
                        text = "Video call",
                        onClick = { viewModel.startCall(true, onStartCall) },
                        leadingIcon = Icons.Filled.Videocam,
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            // Profile completeness (self only) -------------------------------
            if (state.isSelf) {
                Spacer(Modifier.height(GagaDimens.space20))
                CompletenessCard(percent = state.completeness)
            }

            // Contact info ---------------------------------------------------
            Spacer(Modifier.height(GagaDimens.space16))
            GagaDivider()
            GagaSectionHeader("Contact Info")
            GagaSettingsRow(title = "Email", subtitle = user?.email ?: "Not added")
            GagaDivider()
            GagaSettingsRow(title = "Phone", subtitle = user?.phone ?: "Not added")
            user?.lastSeen?.let {
                GagaDivider()
                GagaSettingsRow(title = "Last seen", subtitle = TimeFormat.lastSeen(it))
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
    friendsCount: Int,
    followersCount: Int,
    followingCount: Int,
) {
    Box(modifier = Modifier.fillMaxWidth()) {
        // Mint cover banner
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
                CoverChip("Photo")
                CoverChip("Video")
            }
        }

        // Overlapping avatar
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .offset(y = 48.dp),
        ) {
            GagaAvatar(
                imageUrl = user?.avatar,
                name = user?.displayLabel,
                size = GagaDimens.avatarXLarge,
                status = user?.status,
                showStatus = false,
            )
            if (isSelf) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(GagaGreen),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Filled.CameraAlt,
                        contentDescription = "Change photo",
                        tint = Color.White,
                        modifier = Modifier.size(GagaDimens.iconSmall),
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
        user?.bio?.let {
            Spacer(Modifier.height(GagaDimens.space8))
            Text(
                text = it,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(Modifier.height(GagaDimens.space16))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            StatColumn(friendsCount, "Friends")
            StatColumn(followersCount, "Followers")
            StatColumn(followingCount, "Following")
        }
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

@Composable
private fun CoverChip(label: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(Color.White)
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
            .background(Color(0xFFF5A623))
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
        Text(
            text = "Profile completeness",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
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
        Spacer(Modifier.height(GagaDimens.space4))
        Text(
            text = "$percent% complete",
            style = MaterialTheme.typography.labelMedium,
            color = GagaGreen,
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
