package app.gagachat.feature.auth.presentation.intro

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.EventNote
import androidx.compose.material.icons.filled.TaskAlt
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.gagachat.core.ui.component.GagaPrimaryButton
import app.gagachat.core.ui.component.GagaTextButton
import app.gagachat.core.ui.theme.GagaDimens
import app.gagachat.core.ui.theme.GagaGreen
import app.gagachat.core.ui.theme.GagaTeal
import kotlinx.coroutines.launch

/** A single tour page: one of GaGa's three headline advantages, in depth. */
private data class IntroPage(
    val icon: ImageVector,
    val tint: Color,
    val eyebrow: String,
    val title: String,
    val description: String,
)

/**
 * Introduction / feature tour (Master Spec §C — startup journey).
 *
 * An optional, fully skippable three-page walkthrough that expands on the three
 * advantages teased on the Welcome screen — "Connect with People → Organize
 * Daily Life → Get Things Done". The user can swipe or tap Next; the final page
 * turns the primary action into "Create my account" and routes into sign-up.
 * Skip (top-right) jumps straight to sign-in for returning users.
 *
 * Stateless: all routing is delegated to the caller.
 */
@Composable
fun IntroductionRoute(
    onFinish: () -> Unit,
    onSkip: () -> Unit,
    onSignIn: () -> Unit,
) {
    val pages = listOf(
        IntroPage(
            icon = Icons.Filled.ChatBubble,
            tint = GagaGreen,
            eyebrow = "Connect with People",
            title = "Real-time chat & calls",
            description = "Message friends, start group chats, make HD voice and video calls, and share photos, videos and files — instantly and securely.",
        ),
        IntroPage(
            icon = Icons.Filled.EventNote,
            tint = GagaTeal,
            eyebrow = "Organize Daily Life",
            title = "Your day, from your chats",
            description = "Turn any message into a task, event, reminder, budget or shopping list. GaGa keeps your plans, money and to-dos in one tidy place.",
        ),
        IntroPage(
            icon = Icons.Filled.TaskAlt,
            tint = Color(0xFF7E57C2),
            eyebrow = "Get Things Done",
            title = "Everything in one app",
            description = "Split bills with friends, share your live location, check in safe, and track goals — without ever leaving the conversation.",
        ),
    )

    val pagerState = rememberPagerState(pageCount = { pages.size })
    val scope = rememberCoroutineScope()
    val isLastPage = pagerState.currentPage == pages.lastIndex

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(vertical = GagaDimens.space16),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Skippable affordance, always available.
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = GagaDimens.space16)) {
            Spacer(Modifier.weight(1f))
            GagaTextButton(text = "Skip", onClick = onSkip)
        }

        HorizontalPager(
            state = pagerState,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        ) { page ->
            IntroPageContent(pages[page])
        }

        // Page indicator dots.
        Row(
            horizontalArrangement = Arrangement.spacedBy(GagaDimens.space8),
            modifier = Modifier.padding(vertical = GagaDimens.space16),
        ) {
            repeat(pages.size) { index ->
                val selected = pagerState.currentPage == index
                val width by animateFloatAsState(
                    targetValue = if (selected) 24f else 8f,
                    label = "dotWidth",
                )
                Box(
                    modifier = Modifier
                        .height(8.dp)
                        .size(width = width.dp, height = 8.dp)
                        .clip(CircleShape)
                        .background(
                            if (selected) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.outlineVariant,
                        ),
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = GagaDimens.space24),
        ) {
            GagaPrimaryButton(
                text = if (isLastPage) "Create my account" else "Next",
                onClick = {
                    if (isLastPage) {
                        onFinish()
                    } else {
                        scope.launch { pagerState.animateScrollToPage(pagerState.currentPage + 1) }
                    }
                },
                leadingIcon = Icons.Filled.ArrowForward,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(GagaDimens.space4))
            GagaTextButton(
                text = "I already have an account",
                onClick = onSignIn,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun IntroPageContent(page: IntroPage) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = GagaDimens.space32),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(160.dp)
                .clip(RoundedCornerShape(percent = 50))
                .background(page.tint.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = page.icon,
                contentDescription = null,
                tint = page.tint,
                modifier = Modifier.size(72.dp),
            )
        }
        Spacer(Modifier.height(GagaDimens.space32))
        Text(
            text = page.eyebrow.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(GagaDimens.space8))
        Text(
            text = page.title,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(GagaDimens.space12))
        Text(
            text = page.description,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}
