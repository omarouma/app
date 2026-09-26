package app.gagachat.feature.profile.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import app.gagachat.feature.profile.presentation.ProfileRoute

object ProfileRoutes {
    const val ARG_USER_ID = "userId"
    const val PROFILE = "profile?$ARG_USER_ID={$ARG_USER_ID}"

    fun profile(userId: String? = null): String =
        if (userId.isNullOrBlank()) "profile" else "profile?$ARG_USER_ID=$userId"
}

fun NavGraphBuilder.profileScreen(
    navController: NavController,
    onOpenConversation: (String) -> Unit,
    onStartCall: (String, Boolean) -> Unit,
    onEditProfile: () -> Unit = {},
    onOpenPrivacy: () -> Unit = {},
    onShare: (String) -> Unit = {},
) {
    composable(
        route = ProfileRoutes.PROFILE,
        arguments = listOf(
            navArgument(ProfileRoutes.ARG_USER_ID) {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            },
        ),
    ) {
        ProfileRoute(
            onNavigateBack = { navController.popBackStack() },
            onOpenConversation = onOpenConversation,
            onStartCall = onStartCall,
            onEditProfile = onEditProfile,
            onOpenPrivacy = onOpenPrivacy,
            onShare = onShare,
        )
    }
}
