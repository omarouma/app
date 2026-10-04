package app.gagachat.core.ui.theme

import androidx.compose.ui.unit.dp

/**
 * Shared spacing + sizing tokens. Centralising these keeps layouts consistent
 * across features and makes responsive adjustments a single-file change.
 */
object GagaDimens {
    val space2 = 2.dp
    val space4 = 4.dp
    val space6 = 6.dp
    val space8 = 8.dp
    val space12 = 12.dp
    val space16 = 16.dp
    val space20 = 20.dp
    val space24 = 24.dp
    val space32 = 32.dp
    val space48 = 48.dp

    val avatarSmall = 32.dp
    val avatarMedium = 44.dp
    val avatarLarge = 56.dp
    val avatarXLarge = 96.dp

    val iconSmall = 18.dp
    val iconMedium = 24.dp
    val iconLarge = 32.dp

    // Compact list rows: 56dp keeps a comfortable, accessible touch target
    // (>=48dp per Material a11y guidance) while tightening vertical rhythm so
    // more rows fit on screen. Spec §1 "compact row spacing".
    val listItemMinHeight = 56.dp
    val composerMinHeight = 52.dp
    val topBarHeight = 56.dp

    val bubbleMaxWidthFraction = 0.78f
    val hairline = 0.5.dp
}
