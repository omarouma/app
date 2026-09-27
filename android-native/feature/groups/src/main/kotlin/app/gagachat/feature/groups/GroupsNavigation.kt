package app.gagachat.feature.groups

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument

/** Routes for the Groups feature (Master Spec §C). */
object GroupsRoutes {
    const val GROUPS = "groups"
    const val CREATE = "groups/create"
    const val ARG_GROUP_ID = "groupId"
    const val INFO = "groups/info/{$ARG_GROUP_ID}"

    fun info(groupId: String) = "groups/info/$groupId"
}

/**
 * Registers the Groups graph.
 *
 * [onOpenConversation] receives a conversation id (a group is mirrored as a
 * conversation row, so its id doubles as the chat id).
 */
fun NavGraphBuilder.groupsGraph(
    navController: NavController,
    onOpenConversation: (String) -> Unit,
) {
    composable(GroupsRoutes.GROUPS) {
        GroupsScreen(
            onOpenGroup = { groupId -> navController.navigate(GroupsRoutes.info(groupId)) },
            onCreateGroup = { navController.navigate(GroupsRoutes.CREATE) },
            onBack = { navController.popBackStack() },
        )
    }
    composable(GroupsRoutes.CREATE) {
        CreateGroupScreen(
            onCreated = { groupId ->
                // Open the group conversation, replacing the create screen.
                navController.popBackStack()
                onOpenConversation(groupId)
            },
            onBack = { navController.popBackStack() },
        )
    }
    composable(
        route = GroupsRoutes.INFO,
        arguments = listOf(navArgument(GroupsRoutes.ARG_GROUP_ID) { type = NavType.StringType }),
    ) {
        GroupInfoScreen(
            onLeft = { navController.popBackStack() },
            onBack = { navController.popBackStack() },
        )
    }
}
