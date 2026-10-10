package app.gagachat.feature.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.PrivacyAudience
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaSecondaryButton
import app.gagachat.core.ui.theme.GagaDimens

/**
 * Third onboarding step (Master Spec §C): Privacy Preferences.
 *
 * Lets a brand-new account choose sensible defaults for the three most visible
 * privacy switches before they ever send a message — who can see their last
 * seen, their profile photo and who can message them — plus read receipts. Every
 * choice is a one-tap chip; nothing here is required and all of it can be
 * fine-tuned later in Settings → Privacy.
 */
@Composable
fun PrivacyPreferencesScreen(
    viewModel: OnboardingViewModel = hiltViewModel(),
    onBack: () -> Unit = {},
    onContinue: () -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    val audienceOptions = listOf(
        PrivacyAudience.EVERYONE,
        PrivacyAudience.FRIENDS,
        PrivacyAudience.NOBODY,
    )

    GagaScaffold(
        title = "Privacy preferences",
        subtitle = "You're in control of what you share",
        onBack = onBack,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = GagaDimens.space24, vertical = GagaDimens.space16),
        ) {
            PrivacyChoiceRow(
                icon = Icons.Filled.Visibility,
                title = "Who can see my last seen",
                description = "Shows when you were last online.",
                options = audienceOptions,
                selected = state.privacyLastSeen,
                onSelect = viewModel::onPrivacyLastSeenChange,
            )
            Spacer(Modifier.height(GagaDimens.space16))

            PrivacyChoiceRow(
                icon = Icons.Filled.Visibility,
                title = "Who can see my profile photo",
                description = "Controls who sees your picture and name.",
                options = audienceOptions,
                selected = state.privacyProfilePhoto,
                onSelect = viewModel::onPrivacyProfilePhotoChange,
            )
            Spacer(Modifier.height(GagaDimens.space16))

            PrivacyChoiceRow(
                icon = Icons.Filled.Visibility,
                title = "Who can message me",
                description = "People outside your selection can't start a chat.",
                options = audienceOptions,
                selected = state.privacyMessages,
                onSelect = viewModel::onPrivacyMessagesChange,
            )
            Spacer(Modifier.height(GagaDimens.space16))

            ReadReceiptsRow(
                checked = state.readReceipts,
                onCheckedChange = viewModel::onReadReceiptsChange,
            )

            Spacer(Modifier.height(GagaDimens.space24))
            Text(
                text = "You can fine-tune every privacy option later in Settings → Privacy.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(GagaDimens.space24))

            Row(horizontalArrangement = Arrangement.spacedBy(GagaDimens.space12)) {
                GagaSecondaryButton(
                    text = "Back",
                    onClick = onBack,
                    modifier = Modifier.weight(1f),
                )
                GagaPrimaryButton(
                    text = "Continue",
                    onClick = { viewModel.savePrivacy(onContinue) },
                    loading = state.privacySaving,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun PrivacyChoiceRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    description: String,
    options: List<PrivacyAudience>,
    selected: PrivacyAudience,
    onSelect: (PrivacyAudience) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(GagaDimens.iconSmall),
            )
            Spacer(Modifier.size(GagaDimens.space8))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(Modifier.height(GagaDimens.space2))
        Text(
            text = description,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(GagaDimens.space8))
        Row(horizontalArrangement = Arrangement.spacedBy(GagaDimens.space8)) {
            options.forEach { option ->
                FilterChip(
                    selected = option == selected,
                    onClick = { onSelect(option) },
                    label = { Text(option.label) },
                )
            }
        }
    }
}

@Composable
private fun ReadReceiptsRow(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Lock,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(GagaDimens.iconSmall),
        )
        Spacer(Modifier.size(GagaDimens.space8))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Send read receipts",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Let people know when you've read their messages.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.size(GagaDimens.space8))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
