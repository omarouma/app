package app.gagachat.feature.settings.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import app.gagachat.core.ui.component.GagaDivider
import app.gagachat.core.ui.component.GagaSectionHeader
import app.gagachat.core.ui.component.GagaSettingsRow
import app.gagachat.core.ui.theme.GagaDimens

/**
 * Reusable building blocks for the Settings Center V2.0 screens. Keeping the
 * controls in one place guarantees a consistent look and — importantly — a
 * consistent accessibility story: every row is a labelled control, choices are
 * announced as radio options, and unavailable features are visually and
 * textually distinct from working ones (spec §5).
 */

/** A labelled section: header + rows. */
@Composable
fun SettingsGroup(title: String, content: @Composable ColumnScope.() -> Unit) {
    GagaSectionHeader(text = title.uppercase())
    Column(content = content)
}

/** A boolean control. [enabled] = false renders an informational, non-working row. */
@Composable
fun ToggleRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    subtitle: String? = null,
    icon: ImageVector? = null,
    enabled: Boolean = true,
) {
    GagaSettingsRow(
        title = title,
        subtitle = subtitle,
        leadingIcon = icon,
        leadingIconTint = MaterialTheme.colorScheme.onSurfaceVariant,
        onClick = if (enabled) ({ onCheckedChange(!checked) }) else null,
        trailing = {
            Switch(
                checked = checked,
                onCheckedChange = if (enabled) onCheckedChange else null,
                enabled = enabled,
            )
        },
    )
    GagaDivider()
}

/**
 * A single-select control. Tapping opens a radio dialog so the current value is
 * always visible as text (never conveyed by colour or position alone).
 */
@Composable
fun ChoiceRow(
    title: String,
    options: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
    subtitle: String? = null,
    icon: ImageVector? = null,
    enabled: Boolean = true,
) {
    var open by remember { mutableStateOf(false) }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(title) },
            text = {
                Column {
                    options.forEach { option ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = GagaDimens.space4),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(
                                selected = option == selected,
                                onClick = {
                                    onSelect(option)
                                    open = false
                                },
                            )
                            Spacer(Modifier.width(GagaDimens.space8))
                            Text(option, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { open = false }) { Text("Cancel") }
            },
        )
    }
    GagaSettingsRow(
        title = title,
        subtitle = subtitle ?: selected,
        leadingIcon = icon,
        leadingIconTint = MaterialTheme.colorScheme.onSurfaceVariant,
        onClick = if (enabled) ({ open = true }) else null,
    )
    GagaDivider()
}

/** A read-only informational row (status, values, guidance). */
@Composable
fun InfoRow(
    title: String,
    subtitle: String? = null,
    icon: ImageVector? = null,
    onClick: (() -> Unit)? = null,
) {
    GagaSettingsRow(
        title = title,
        subtitle = subtitle,
        leadingIcon = icon ?: Icons.Filled.Info,
        leadingIconTint = MaterialTheme.colorScheme.onSurfaceVariant,
        onClick = onClick,
    )
    GagaDivider()
}

/** A tappable action row (e.g. "Clear search history", "Run network test"). */
@Composable
fun ActionRow(
    title: String,
    subtitle: String? = null,
    icon: ImageVector? = null,
    onClick: () -> Unit,
) {
    GagaSettingsRow(
        title = title,
        subtitle = subtitle,
        leadingIcon = icon,
        leadingIconTint = MaterialTheme.colorScheme.primary,
        onClick = onClick,
    )
    GagaDivider()
}

/**
 * A row for a feature that is not implemented yet. It is deliberately NOT a
 * working toggle — the spec forbids controls that look functional but do
 * nothing. The "Soon" chip makes the unavailability explicit.
 */
@Composable
fun ComingSoonRow(title: String, subtitle: String? = null) {
    GagaSettingsRow(
        title = title,
        subtitle = subtitle,
        leadingIcon = Icons.Filled.Schedule,
        leadingIconTint = MaterialTheme.colorScheme.onSurfaceVariant,
        trailing = {
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(GagaDimens.space8),
            ) {
                Text(
                    text = "Soon",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = GagaDimens.space8, vertical = GagaDimens.space2),
                )
            }
        },
    )
    GagaDivider()
}

/** A short explanatory note shown above a group of controls. */
@Composable
fun SettingsNote(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
    )
}

/**
 * A prominent banner used for the critical rules (AI never acts silently, SOS is
 * best-effort, backups are not end-to-end encrypted unless verified, …). Uses a
 * tinted surface so it reads as guidance, not a control.
 */
@Composable
fun SettingsBanner(text: String, tint: Color = MaterialTheme.colorScheme.primary) {
    Surface(
        color = tint.copy(alpha = 0.10f),
        shape = RoundedCornerShape(GagaDimens.space12),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = GagaDimens.space16, vertical = GagaDimens.space8),
    ) {
        Row(modifier = Modifier.padding(GagaDimens.space12)) {
            Icon(
                imageVector = Icons.Filled.Info,
                contentDescription = null,
                tint = tint,
            )
            Spacer(Modifier.width(GagaDimens.space8))
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}
