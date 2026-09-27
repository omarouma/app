package app.gagachat.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.rememberNavController
import app.gagachat.feature.auth.navigation.AuthRoutes
import app.gagachat.feature.auth.navigation.authGraph

/**
 * Hosts the authentication graph. The session gate in [GagaApp] swaps this out
 * for the main graph as soon as a session exists, so [onAuthenticated] is a
 * no-op here.
 */
@Composable
fun AuthNavHost() {
    val navController = rememberNavController()
    NavHost(
        navController = navController,
        startDestination = AuthRoutes.LOGIN,
    ) {
        authGraph(
            navController = navController,
            onAuthenticated = { /* session flow drives the swap */ },
        )
    }
}
