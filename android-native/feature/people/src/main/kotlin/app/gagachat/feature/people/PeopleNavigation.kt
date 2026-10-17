package app.gagachat.feature.people

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable

/** Routes for the People / Friends feature (Master Spec §C). */
object PeopleRoutes {
    const val PEOPLE = "people"
    const val REQUESTS = "people/requests"
    const val DISCOVER = "people/discover"
}

/**
 * Registers the People graph. [onOpenProfile] receives a user id and
 * [onOpenConversation] receives a resolved conversation id (the People
 * ViewModel performs the direct-conversation open/creation).
 */
fun NavGraphBuilder.peopleGraph(
    navController: NavController,
    onOpenProfile: (String) -> Unit,
    onOpenConversation: (String) -> Unit,
    onOpenGroups: () -> Unit = {},
    onOpenMyQr: () -> Unit = {},
    onOpenAddByCode: () -> Unit = {},
) {
    listOf(PeopleRoutes.PEOPLE, PeopleRoutes.REQUESTS).forEach { route ->
    composable(route) {
        PeopleScreen(
            initialTab = if (route == PeopleRoutes.REQUESTS) 2 else 0,
            onOpenProfile = onOpenProfile,
            onOpenConversation = onOpenConversation,
            onOpenDiscover = { navController.navigate(PeopleRoutes.DISCOVER) },
            onOpenGroups = onOpenGroups,
            onOpenMyQr = onOpenMyQr,
            onOpenAddByCode = onOpenAddByCode,
        )
    }
    }
    composable(PeopleRoutes.DISCOVER) {
        DiscoverScreen(
            onOpenProfile = onOpenProfile,
            onBack = { navController.popBackStack() },
            onOpenAddByCode = onOpenAddByCode,
            onOpenMyQr = onOpenMyQr,
        )
    }
}
