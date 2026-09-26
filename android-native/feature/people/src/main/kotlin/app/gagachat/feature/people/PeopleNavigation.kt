package app.gagachat.feature.people

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable

/** Routes for the People / Friends feature (Master Spec §C). */
object PeopleRoutes {
    const val PEOPLE = "people"
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
    composable(PeopleRoutes.PEOPLE) {
        PeopleScreen(
            onOpenProfile = onOpenProfile,
            onOpenConversation = onOpenConversation,
            onOpenDiscover = { navController.navigate(PeopleRoutes.DISCOVER) },
            onOpenGroups = onOpenGroups,
            onOpenMyQr = onOpenMyQr,
        )
    }
    composable(PeopleRoutes.DISCOVER) {
        DiscoverScreen(
            onOpenProfile = onOpenProfile,
            onBack = { navController.popBackStack() },
            onOpenAddByCode = onOpenAddByCode,
        )
    }
}
