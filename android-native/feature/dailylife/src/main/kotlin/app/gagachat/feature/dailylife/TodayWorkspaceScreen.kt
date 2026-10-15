package app.gagachat.feature.dailylife

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.gagachat.core.ui.component.GagaScaffold

/** The second Today mockup is a real workspace, not a collection of example counters.
 * Counts come exclusively from DailyLifeViewModel's authenticated API state.
 */
@Composable
fun TodayWorkspaceRoute(
    nav: NavController,
    vm: DailyLifeViewModel = hiltViewModel(),
) {
    val ui by vm.state.collectAsStateWithLifecycle()
    TodayWorkspaceScreen(ui, onBack = { nav.popBackStack() }, onRefresh = vm::refresh,
        onNavigate = nav::navigate)
}

private data class WorkspaceTool(
    val title: String,
    val detail: String,
    val icon: ImageVector,
    val destination: String,
)

@Composable
fun TodayWorkspaceScreen(
    ui: DailyUi,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onNavigate: (String) -> Unit,
) {
    val loading = ui.loading
    val tools = listOf(
        WorkspaceTool("Tasks", "${ui.records.count { it.kind == "task" && !it.completed }} open", Icons.Default.TaskAlt, DailyRoutes.records("task")),
        WorkspaceTool("Reminders", "${ui.records.count { it.kind == "reminder" && !it.completed }} scheduled", Icons.Default.NotificationsActive, DailyRoutes.records("reminder")),
        WorkspaceTool("Events", "${ui.records.count { it.kind == "event" && !it.completed }} upcoming", Icons.Default.Event, DailyRoutes.records("event")),
        WorkspaceTool("Private notes", "${ui.records.count { it.kind == "note" }} saved", Icons.Default.Description, DailyRoutes.records("note")),
        WorkspaceTool("Shared lists", "${ui.lists.size} lists", Icons.Default.Checklist, DailyRoutes.records("shopping")),
        WorkspaceTool("Bills & expenses", "${ui.records.count { it.kind == "expense" }} recorded", Icons.Default.ReceiptLong, DailyRoutes.records("expense")),
        WorkspaceTool("Borrowed & lent", "${ui.records.count { it.kind in listOf("borrowed", "lent") }} records", Icons.Default.People, DailyRoutes.records("debts")),
        WorkspaceTool("Calls & people", "${ui.calls.count { it.status.name == "MISSED" }} missed calls", Icons.Default.Call, "calls"),
    )
    GagaScaffold(
        title = "Today workspace",
        onBack = onBack,
        actions = {
            IconButton(onClick = onRefresh, enabled = !loading && !ui.busy) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh workspace")
            }
        },
    ) { padding ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(padding)) {
            val columns = if (maxWidth < 340.dp || LocalDensity.current.fontScale > 1.25f) 1 else 2
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("ALL TOOLS & ACTIVITY", style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                        Text("Organize your day", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        Text("From conversations to real-life actions.", style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                ui.error?.let { error -> item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                        Column(Modifier.padding(14.dp)) {
                            Text("Couldn't load your records", fontWeight = FontWeight.SemiBold)
                            Text(error, style = MaterialTheme.typography.bodySmall)
                            TextButton(onClick = onRefresh) { Text("Retry") }
                        }
                    }
                } }
                items(tools.chunked(columns).size) { rowIndex ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        tools.chunked(columns)[rowIndex].forEach { tool ->
                            Card(
                                onClick = { onNavigate(tool.destination) },
                                modifier = Modifier.weight(1f).heightIn(min = 118.dp),
                                shape = RoundedCornerShape(18.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                            ) {
                                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Icon(tool.icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(26.dp))
                                    Text(tool.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                                    Text(if (loading || ui.error != null) "Syncing…" else tool.detail,
                                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                        if (tools.chunked(columns)[rowIndex].size < columns) Spacer(Modifier.weight(1f))
                    }
                }
                item {
                    WorkspaceLink("My Circles", "Family, class, work and business conversations",
                        Icons.Default.Groups, onClick = { onNavigate("groups") })
                }
                item {
                    WorkspaceLink("Money & shared plans",
                        if (ui.splitError != null) "Split bills unavailable · Tap to retry"
                        else if (loading) "Syncing…" else "${ui.splitBills.size} tracked split bills",
                        Icons.Default.AccountBalanceWallet,
                        onClick = { onNavigate(DailyRoutes.SPLITS) })
                }
                item {
                    WorkspaceLink("China Direct", "Supplier quotes and shopping preview · Checkout is not live",
                        Icons.Default.ShoppingBag, onClick = { onNavigate(DailyRoutes.CHINA_DIRECT) })
                }
                item {
                    Text("Private records are visible only to you. Shared information follows each feature's permissions.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun WorkspaceLink(
    title: String,
    detail: String,
    icon: ImageVector,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
    ) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
