package app.gagachat.core.ui.component

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.gagachat.core.ui.R
import app.gagachat.core.ui.theme.GagaDimens

/**
 * The GaGa brand mark. Renders the official green app icon with a soft shadow so
 * it reads cleanly on both light and dark surfaces. Used on the splash, sign-in
 * and registration screens as the primary brand anchor.
 */
@Composable
fun GagaLogo(
    modifier: Modifier = Modifier,
    size: Dp = 96.dp,
    elevation: Dp = 8.dp,
) {
    Box(
        modifier = modifier
            .size(size)
            .shadow(elevation, RoundedCornerShape(size * 0.24f))
            .clip(RoundedCornerShape(size * 0.24f)),
    ) {
        Image(
            painter = painterResource(R.drawable.ic_gaga_logo),
            contentDescription = "GaGa logo",
            contentScale = ContentScale.Fit,
            modifier = Modifier.size(size),
        )
    }
}

/**
 * Logo + wordmark lockup used as the header of the authentication screens.
 */
@Composable
fun GagaBrandHeader(
    modifier: Modifier = Modifier,
    logoSize: Dp = 96.dp,
    tagline: String? = null,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        GagaLogo(size = logoSize)
        Spacer(Modifier.height(GagaDimens.space16))
        Text(
            text = "GaGa",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.ExtraBold,
            color = MaterialTheme.colorScheme.primary,
        )
        if (tagline != null) {
            Spacer(Modifier.height(GagaDimens.space4))
            Text(
                text = tagline,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
