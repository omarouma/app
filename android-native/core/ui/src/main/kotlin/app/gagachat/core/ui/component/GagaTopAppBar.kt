package app.gagachat.core.ui.component

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.gagachat.core.model.UserStatus
import app.gagachat.core.ui.theme.GagaDimens

/**
 * The standard GaGa top bar. On secondary screens it can show a two-line
 * title/subtitle; on the chat screen it additionally renders the peer's avatar
 * and makes the whole header tappable so the user can jump straight to the
 * profile (Phase 1.2 of the Chat Room architecture).
 *
 * Design: a clean surface bar with a single hairline separator beneath it, so
 * the header reads as a distinct zone from the scrolling content without the
 * heavy shadow of a default elevation. The brand wordmark is tinted with the
 * primary (green) accent on primary screens.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GagaTopAppBar(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    brandMark: Boolean = false,
    avatarUrl: String? = null,
    avatarStatus: UserStatus? = null,
    onTitleClick: (() -> Unit)? = null,
    containerColor: Color = MaterialTheme.colorScheme.surface,
    showDivider: Boolean = true,
    actions: @Composable RowScope.() -> Unit = {},
) {
    Column(modifier = modifier) {
        TopAppBar(
            title = {
                val headerModifier = if (onTitleClick != null) {
                    Modifier
                        .clip(CircleShape)
                        .clickable(onClick = onTitleClick)
                } else {
                    Modifier
                }
                Row(
                    modifier = headerModifier,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (brandMark) {
                        // Brand anchor: the GaGa mark sits to the left of the
                        // wordmark on primary screens (home) so the logo is
                        // always visible.
                        GagaLogo(size = 32.dp, elevation = 0.dp)
                        Spacer(Modifier.width(GagaDimens.space12))
                    } else if (avatarUrl != null || subtitle != null) {
                        // Chat header identity: real avatar (or initials fallback)
                        // with a live presence dot, then the name + subtitle.
                        GagaAvatar(
                            imageUrl = avatarUrl,
                            name = title,
                            size = GagaDimens.avatarSmall,
                            status = avatarStatus,
                            showStatus = avatarStatus != null,
                        )
                        Spacer(Modifier.width(GagaDimens.space12))
                    }
                    if (subtitle == null) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = if (brandMark) FontWeight.ExtraBold else FontWeight.SemiBold,
                            color = if (brandMark) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurface
                            },
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    } else {
                        Column {
                            Text(
                                text = title,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            },
            navigationIcon = {
                if (onBack != null) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            },
            actions = actions,
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = containerColor,
                titleContentColor = MaterialTheme.colorScheme.onSurface,
                navigationIconContentColor = MaterialTheme.colorScheme.onSurface,
                actionIconContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        )
        if (showDivider) {
            HorizontalDivider(
                thickness = GagaDimens.hairline,
                color = MaterialTheme.colorScheme.outlineVariant,
            )
        }
    }
}
