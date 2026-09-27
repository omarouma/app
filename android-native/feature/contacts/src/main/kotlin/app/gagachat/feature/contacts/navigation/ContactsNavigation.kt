package app.gagachat.feature.contacts.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import app.gagachat.feature.contacts.presentation.ContactsRoute

object ContactsRoutes {
    const val CONTACTS = "contacts"
}

fun NavGraphBuilder.contactsScreen(
    navController: NavController,
    onOpenProfile: (String) -> Unit,
    onOpenConversation: (String) -> Unit,
) {
    composable(ContactsRoutes.CONTACTS) {
        ContactsRoute(
            onOpenProfile = onOpenProfile,
            onOpenConversation = onOpenConversation,
        )
    }
}
