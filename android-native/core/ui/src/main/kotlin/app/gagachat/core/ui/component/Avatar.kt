package app.gagachat.core.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.gagachat.core.model.UserStatus
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaTheme
import coil.compose.AsyncImage

/**
 * Circular avatar with a deterministic colored fallback showing the user's
 * initials. Uses Coil's memory + disk cache so avatars appear instantly on
 * repeat visits (a core performance requirement of the rebuild).
 */
@Composable
fun GagaAvatar(
    imageUrl: String?,
    name: String?,
    modifier: Modifier = Modifier,
    size: Dp = GagaDimens.avatarMedium,
    status: UserStatus? = null,
    showStatus: Boolean = false,
) {
    val initials = rememberInitials(name)
    val fallbackColor = rememberAvatarColor(name)

    Box(modifier = modifier.size(size)) {
        Box(
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .background(fallbackColor),
            contentAlignment = Alignment.Center,
        ) {
            if (!imageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = imageUrl,
                    contentDescription = name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(size)
                        .clip(CircleShape),
                )
            } else {
                Text(
                    text = initials,
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.titleMedium,
                )
            }
        }

        if (showStatus && status != null) {
            StatusDot(
                status = status,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(size * 0.30f)
                    .border(width = 2.dp, color = MaterialTheme.colorScheme.surface, shape = CircleShape),
            )
        }
    }
}

@Composable
private fun rememberInitials(name: String?): String {
    if (name.isNullOrBlank()) return "?"
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    return when {
        parts.isEmpty() -> "?"
        parts.size == 1 -> parts[0].take(2).uppercase()
        else -> (parts[0].first().toString() + parts[1].first().toString()).uppercase()
    }
}

private val avatarPalette = listOf(
    Color(0xFF00C300),
    Color(0xFF00A884),
    Color(0xFF00897B),
    Color(0xFF2E7D32),
    Color(0xFF43A047),
    Color(0xFF00838F),
    Color(0xFF00695C),
    Color(0xFF558B2F),
)

private fun rememberAvatarColor(name: String?): Color {
    if (name.isNullOrBlank()) return avatarPalette.first()
    val index = (name.hashCode().let { if (it < 0) -it else it }) % avatarPalette.size
    return avatarPalette[index]
}

@Composable
fun StatusDot(
    status: UserStatus,
    modifier: Modifier = Modifier,
) {
    val color = when (status) {
        UserStatus.ONLINE -> GagaTheme.extraColors.statusOnline
        UserStatus.AWAY -> GagaTheme.extraColors.statusAway
        UserStatus.BUSY -> GagaTheme.extraColors.statusBusy
        UserStatus.OFFLINE -> GagaTheme.extraColors.statusOffline
    }
    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(color),
    )
}
