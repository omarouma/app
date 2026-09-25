package app.gagachat.feature.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.People
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.gagachat.core.ui.component.GagaLogo
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.theme.GagaDimens

/**
 * First onboarding step (Master Spec §C). Introduces the product with the GaGa
 * brand mark and the three pillars of the rebuild: speed, privacy, people.
 */
@Composable
fun WelcomeScreen(onContinue: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = GagaDimens.space24),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            GagaLogo(size = 112.dp)

            Spacer(Modifier.height(GagaDimens.space24))

            Text(
                text = "Welcome to GaGa",
                style = MaterialTheme.typography.headlineMedium,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(GagaDimens.space8))
            Text(
                text = "Fast, private messaging that just works.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(GagaDimens.space32))

            FeaturePill(Icons.Filled.Bolt, "Instant, local-first chats")
            FeaturePill(Icons.Filled.Lock, "End-to-end encrypted sessions")
            FeaturePill(Icons.Filled.People, "Groups, calls and coins")

            Spacer(Modifier.height(GagaDimens.space48))

            GagaPrimaryButton(
                text = "Get started",
                onClick = onContinue,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun FeaturePill(icon: ImageVector, text: String) {
    androidx.compose.foundation.layout.Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = GagaDimens.space6),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(GagaDimens.iconMedium),
        )
        Spacer(Modifier.size(GagaDimens.space12))
        Text(text = text, style = MaterialTheme.typography.bodyLarge)
    }
}
