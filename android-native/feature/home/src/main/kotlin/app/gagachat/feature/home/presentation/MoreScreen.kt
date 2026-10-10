package app.gagachat.feature.home.presentation

import android.content.Context
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.ui.component.GagaAvatar
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaSettingsRow
import app.gagachat.core.ui.theme.GagaDimens

/** Per-row icon accents so the menu reads like the reference (screenshot 174121). */
private val IconGreen = Color(0xFF25D366)
private val IconBlue = Color(0xFF2196F3)
private val IconPink = Color(0xFFE91E63)
private val IconCyan = Color(0xFF00BCD4)
private val IconPurple = Color(0xFF9C27B0)
private val IconOrange = Color(0xFFFF9800)
private val IconTeal = Color(0xFF009688)
private val IconAmber = Color(0xFFFFC107)
private val IconRed = Color(0xFFF44336)
private val IconIndigo = Color(0xFF3F51B5)

/**
 * Resolves the installed app's version name from the package manager so the
 * footer always reflects the real build (the home feature module does not own
 * the app's BuildConfig).
 */
private fun appVersionLabel(context: Context): String =
    runCatching {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName
    }.getOrNull()?.takeIf { it.isNotBlank() } ?: "\u2014"

/**
 * The "More" menu (reference screenshots 174121 / 174131 / 174138). It is now
 * reached exclusively from the Profile screen. It groups the app's secondary
 * surfaces into COMMUNICATION, DISCOVER, WALLET & REWARDS, ACCOUNT, SETTINGS
 * and ABOUT sections. Every row is a navigation callback so the menu owns no
 * business logic of its own beyond sign-out.
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
    onBack: () -> Unit = {},
    viewModel: MoreViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val appVersion = remember(context) { appVersionLabel(context) }

    GagaScaffold(title = "More", onBack = onBack) { padding ->
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
            MenuRow("Chats", "Your conversations", Icons.AutoMirrored.Filled.Chat, IconGreen, onOpenConversations)
            MenuRow("Calls", "Voice & video call history", Icons.Filled.Call, IconBlue, onOpenCalls)
            MenuRow("Contacts", "People you can message", Icons.Filled.People, IconPink, onOpenContacts)
            MenuRow("Add Friends", "Find and invite people", Icons.Filled.PersonAdd, IconCyan, onOpenAddFriends)
            MenuRow("Broadcast Lists", "Send messages to multiple contacts", Icons.Filled.Campaign, IconPink, onOpenContacts)
            MenuRow("GaGa AI", "Your AI assistant for chats & ideas", Icons.Filled.AutoAwesome, IconPurple, onOpenConversations)

            GagaSectionHeader("DISCOVER")
            MenuRow("Search", "Find people, groups, and messages", Icons.Filled.Search, IconBlue, onOpenSearch)
            MenuRow("Sent Requests", "Pending friend requests", Icons.AutoMirrored.Filled.Send, IconCyan, onOpenPeople)
            MenuRow("Blocked Users", "Manage blocked accounts", Icons.Filled.Block, IconRed, onOpenBlocked)

            GagaSectionHeader("WALLET & REWARDS")
            MenuRow("My Wallet", "Coins, top-up and activity", Icons.Filled.AccountBalanceWallet, IconGreen, onOpenWallet)
            MenuRow("Gaga Rewards", "Earn free Gaga Coins", Icons.Filled.CardGiftcard, IconOrange, onOpenWallet)
            MenuRow("Staking", "Earn interest in your wallet", Icons.AutoMirrored.Filled.TrendingUp, IconTeal, onOpenWallet)
            MenuRow("Premium", "Manage your subscription", Icons.Filled.WorkspacePremium, IconAmber, onOpenWallet)

            GagaSectionHeader("ACCOUNT")
            MenuRow("Profile", "Edit your profile", Icons.Filled.Person, IconBlue, onOpenProfile)
            MenuRow("My QR Code", "Share and scan", Icons.Filled.QrCode2, IconPurple, onOpenMyQr)
            MenuRow("Notifications", "Notification preferences", Icons.Filled.Notifications, IconOrange, onOpenNotifications)
            MenuRow("Security", "Privacy, login, and app lock", Icons.Filled.Security, IconGreen, onOpenPrivacy)
            MenuRow("Saved Messages", "Your bookmarked chats", Icons.Filled.Bookmark, IconBlue, onOpenConversations)

            GagaSectionHeader("SETTINGS")
            MenuRow("All Settings", "Theme, language, privacy, data & more", Icons.Filled.Settings, IconIndigo, onOpenSettings)

            GagaSectionHeader("ABOUT")
            MenuRow("About GaGa", "Version $appVersion", Icons.Filled.Info, IconBlue, onOpenHelp)
            MenuRow("Help Center", "FAQs and support", Icons.Filled.Info, IconGreen, onOpenHelp)
            MenuRow("Privacy Policy", "How we protect your data", Icons.Filled.Info, IconTeal, onOpenHelp)
            MenuRow("Terms of Service", "User agreement", Icons.Filled.Info, IconOrange, onOpenHelp)

            Spacer(Modifier.height(GagaDimens.space16))
            Button(
                onClick = viewModel::signOut,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFFDE7E7),
                    contentColor = Color(0xFFD32F2F),
                ),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = GagaDimens.space16)
                    .height(52.dp),
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.Logout,
                    contentDescription = null,
                    modifier = Modifier.size(GagaDimens.iconMedium),
                )
                Spacer(Modifier.width(GagaDimens.space8))
                Text(text = "Log Out", style = MaterialTheme.typography.labelLarge)
            }
            Spacer(Modifier.height(GagaDimens.space12))
            Text(
                text = "GaGa v$appVersion \u2022 Built with care",
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
    tint: Color,
    onClick: () -> Unit,
) {
    GagaSettingsRow(
        title = title,
        subtitle = subtitle,
        leadingIcon = icon,
        leadingIconTint = tint,
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
