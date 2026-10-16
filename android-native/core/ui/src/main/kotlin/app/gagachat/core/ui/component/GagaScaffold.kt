package app.gagachat.core.ui.component

import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import app.gagachat.core.model.UserStatus

/**
 * Thin wrapper over Material 3 [Scaffold] that standardises the top bar and
 * snackbar host across every feature screen. Keeps edge-to-edge insets handling
 * in one place so screens never forget to consume system bars.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GagaScaffold(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    brandMark: Boolean = false,
    compactHeader: Boolean = false,
    titleHighlight: String? = null,
    avatarUrl: String? = null,
    avatarStatus: UserStatus? = null,
    onTitleClick: (() -> Unit)? = null,
    showTopBarDivider: Boolean = title.isNotBlank() || onBack != null,
    snackbarHostState: SnackbarHostState? = null,
    actions: @Composable RowScope.() -> Unit = {},
    floatingActionButton: @Composable () -> Unit = {},
    bottomBar: @Composable () -> Unit = {},
    showTopBar: Boolean = true,
    content: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            if (showTopBar) GagaTopAppBar(
                title = title,
                subtitle = subtitle,
                onBack = onBack,
                brandMark = brandMark,
                compactHeader = compactHeader,
                titleHighlight = titleHighlight,
                avatarUrl = avatarUrl,
                avatarStatus = avatarStatus,
                onTitleClick = onTitleClick,
                showDivider = showTopBarDivider,
                actions = actions,
            )
        },
        snackbarHost = { snackbarHostState?.let { SnackbarHost(it) } },
        floatingActionButton = floatingActionButton,
        bottomBar = bottomBar,
        content = content,
    )
}
