package app.gagachat.feature.home.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaSettingsRow
import app.gagachat.core.ui.theme.GagaDimens

/** App version shown in the More footer. Kept in sync with SettingsScreen. */
private const val APP_VERSION = "2.0.0"

/**
 * The "More" menu reached from the Chat tab's overflow (reference screenshots
 * 174121 / 174131 / 174138). It groups the app's secondary surfaces into
 * COMMUNICATION, DISCOVER, WALLET & REWARDS, ACCOUNT, SETTINGS and ABOUT
 * sections. Every row is a navigation callback so the menu owns no business
 * logic of its own beyond sign-out.
 */
@Composable
fun MoreRoute(
    onOpenProfile: () -> Unit,
    onOpenConversations: () -> Unit,
    onOpenCalls: () -> Unit,
    onOpenContacts: () -> Unit,
    onOpenAddFriends: () -> Unit,
    onOpenPeople: () -> Unit,
    onOpenWallet: () -> Unit,
    onOpenMyQr: () -> Unit,
    onOpenBlocked: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenHelp: () -> Unit,
    viewModel: MoreViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    GagaScaffold(title = "More") { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            ProfileCard(
                name = state.displayName.ifBlank { "Your profile" },
                username = state.username,
                avatarUrl = state.avatarUrl,
                onClick = onOpenProfile,
            )
            GagaDivider()

            GagaSectionHeader("COMMUNICATION")
            MenuRow("Chats", "Your conversations", Icons.AutoMirrored.Filled.Chat, onOpenConversations)
            MenuRow("Calls", "Voice & video call history", Icons.Filled.Call, onOpenCalls)
            MenuRow("Contacts", "People you can message", Icons.Filled.People, onOpenContacts)
            MenuRow("Add Friends", "Find and invite people", Icons.Filled.PersonAdd, onOpenAddFriends)
            MenuRow("Broadcast Lists", "Send messages to multiple contacts", Icons.Filled.Campaign, onOpenContacts)
            MenuRow("GaGa AI", "Your AI assistant for chats & ideas", Icons.Filled.AutoAwesome, onOpenConversations)

            GagaSectionHeader("DISCOVER")
            MenuRow("Search", "Find people, groups, and messages", Icons.Filled.Search, onOpenSearch)
            MenuRow("Sent Requests", "Pending friend requests", Icons.Filled.Send, onOpenPeople)
            MenuRow("Blocked Users", "Manage blocked accounts", Icons.Filled.Block, onOpenBlocked)

            GagaSectionHeader("WALLET & REWARDS")
            MenuRow("My Wallet", "Coins, top-up and activity", Icons.Filled.AccountBalanceWallet, onOpenWallet)
            MenuRow("Gaga Rewards", "Earn free Gaga Coins", Icons.Filled.CardGiftcard, onOpenWallet)
            MenuRow("Staking", "Earn interest in your wallet", Icons.Filled.TrendingUp, onOpenWallet)
            MenuRow("Premium", "Manage your subscription", Icons.Filled.WorkspacePremium, onOpenWallet)

            GagaSectionHeader("ACCOUNT")
            MenuRow("Profile", "Edit your profile", Icons.Filled.Person, onOpenProfile)
            MenuRow("My QR Code", "Share and scan", Icons.Filled.QrCode2, onOpenMyQr)
            MenuRow("Notifications", "Notification preferences", Icons.Filled.Notifications, onOpenNotifications)
            MenuRow("Security", "Privacy, login, and app lock", Icons.Filled.Security, onOpenPrivacy)
            MenuRow("Saved Messages", "Your bookmarked chats", Icons.Filled.Bookmark, onOpenConversations)

            GagaSectionHeader("SETTINGS")
            MenuRow("All Settings", "Theme, language, privacy, data & more", Icons.Filled.Settings, onOpenSettings)

            GagaSectionHeader("ABOUT")
            MenuRow("About GaGa", "Version $APP_VERSION", Icons.Filled.Info, onOpenHelp)
            MenuRow("Help Center", "FAQs and support", Icons.Filled.Info, onOpenHelp)
            MenuRow("Privacy Policy", "How we protect your data", Icons.Filled.Info, onOpenHelp)
            MenuRow("Terms of Service", "User agreement", Icons.Filled.Info, onOpenHelp)

            Spacer(Modifier.height(GagaDimens.space16))
            GagaPrimaryButton(
                text = "Log Out",
                onClick = viewModel::signOut,
                leadingIcon = Icons.AutoMirrored.Filled.Logout,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16),
            )
            Spacer(Modifier.height(GagaDimens.space12))
            Text(
                text = "GaGa v$APP_VERSION \u2022 Built with care",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(GagaDimens.space48))
        }
    }
}

@Composable
private fun ProfileCard(
    name: String,
    username: String?,
    avatarUrl: String?,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space16),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GagaAvatar(imageUrl = avatarUrl, name = name, size = GagaDimens.avatarLarge)
        Spacer(Modifier.width(GagaDimens.space16))
        Column(modifier = Modifier.weight(1f)) {
            Text(text = name, style = MaterialTheme.typography.titleMedium)
            Text(
                text = username?.let { "@$it" } ?: "Tap to view profile",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun MenuRow(
    title: String,
    subtitle: String,
    icon: ImageVector,
    onClick: () -> Unit,
) {
    GagaSettingsRow(
        title = title,
        subtitle = subtitle,
        leadingIcon = icon,
        onClick = onClick,
        trailing = {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
    )
}
