package app.gagachat.feature.dailylife

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import app.gagachat.core.model.ConversationType
import app.gagachat.core.ui.component.GagaScaffold

/** Today's real-data tools surface. All counts come from authenticated APIs. */
@Composable
fun TodayWorkspaceRoute(
    nav: NavController,
    showBack: Boolean = true,
    vm: DailyLifeViewModel = hiltViewModel(),
) {
    val ui by vm.state.collectAsStateWithLifecycle()
    TodayWorkspaceScreen(
        ui = ui,
        onBack = { nav.popBackStack() },
        onRefresh = { vm.refresh() },
        onNavigate = { nav.navigate(it) },
        showBack = showBack,
    )
}

private data class WorkspaceTool(
    val title: String,
    val detail: String,
    val icon: ImageVector,
    val accent: Color,
    val destination: String,
)

private val todayGreen = Color(0xFF168A58)
private val todayBlue = Color(0xFF4D87C8)
private val todayPurple = Color(0xFF8B72CC)
private val todayOrange = Color(0xFFDE8E48)
private val todayTeal = Color(0xFF559A91)
private val todayGold = Color(0xFFC4962C)
private val todayPink = Color(0xFFA67BB5)

@Composable
fun TodayWorkspaceScreen(
    ui: DailyUi,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onNavigate: (String) -> Unit,
    showBack: Boolean = true,
) {
    val loading = ui.loading
    var searchVisible by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var menuOpen by remember { mutableStateOf(false) }
    // No example people, sample invoice totals, invented circles or fake
    // activity: the UI renders only the signed-in person's actual records.
    val tools = listOf(
        WorkspaceTool("Tasks",
            "${ui.records.count { it.kind == "task" && !it.completed }} open · ${ui.records.count { it.kind == "task" && it.completed }} completed",
            Icons.Default.TaskAlt, todayGreen, DailyRoutes.records("task")),
        WorkspaceTool("Reminders", "${ui.records.count { it.kind == "reminder" && !it.completed }} scheduled",
            Icons.Default.NotificationsActive, todayBlue, DailyRoutes.records("reminder")),
        WorkspaceTool("Events", "${ui.records.count { it.kind == "event" && !it.completed }} upcoming",
            Icons.Default.Event, todayPurple, DailyRoutes.records("event")),
        WorkspaceTool("Private notes", "${ui.records.count { it.kind == "note" }} saved notes",
            Icons.Default.Description, todayOrange, DailyRoutes.records("note")),
        WorkspaceTool("Shared lists", "${ui.lists.size} active lists",
            Icons.Default.Checklist, todayTeal, DailyRoutes.records("shopping")),
        WorkspaceTool("Bills & expenses", "${ui.records.count { it.kind == "expense" }} recorded",
            Icons.Default.ReceiptLong, todayGold, DailyRoutes.records("money")),
        WorkspaceTool("Borrowed & lent", "${ui.records.count { it.kind in listOf("borrowed", "lent") }} records",
            Icons.Default.People, todayPink, DailyRoutes.records("debts")),
        WorkspaceTool("Calls & people", "${ui.calls.count { it.status.name == "MISSED" }} missed calls",
            Icons.Default.Call, todayBlue, "calls"),
    )
    val shownTools = tools.filter {
        !searchVisible || query.isBlank() ||
            it.title.contains(query.trim(), ignoreCase = true) ||
            it.detail.contains(query.trim(), ignoreCase = true)
    }
    val circles = ui.conversations.count { it.type != ConversationType.DIRECT }
    val sectionVisible: (String) -> Boolean = { text ->
        !searchVisible || query.isBlank() || text.contains(query.trim(), ignoreCase = true)
    }

    GagaScaffold(
        title = "Today workspace",
        brandMark = !showBack,
        compactHeader = true,
        onBack = if (showBack) onBack else null,
        actions = {
            IconButton(onClick = { searchVisible = !searchVisible; if (!searchVisible) query = "" }) {
                Icon(Icons.Default.Search, contentDescription = if (searchVisible) "Close workspace search" else "Search Today tools")
            }
            Box {
                IconButton(onClick = { menuOpen = true }) {
                    Icon(Icons.Default.MoreVert, contentDescription = "Today options")
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(text = { Text("Today overview") },
                        onClick = { menuOpen = false; onNavigate(DailyRoutes.OVERVIEW) })
                    DropdownMenuItem(text = { Text("New task") },
                        onClick = { menuOpen = false; onNavigate(DailyRoutes.edit("task")) })
                    DropdownMenuItem(text = { Text("New reminder") },
                        onClick = { menuOpen = false; onNavigate(DailyRoutes.edit("reminder")) })
                    DropdownMenuItem(text = { Text("New event") },
                        onClick = { menuOpen = false; onNavigate(DailyRoutes.edit("event")) })
                    DropdownMenuItem(text = { Text("Private note") },
                        onClick = { menuOpen = false; onNavigate(DailyRoutes.edit("note")) })
                    DropdownMenuItem(text = { Text("Refresh") },
                        onClick = { menuOpen = false; onRefresh() })
                }
            }
        },
    ) { padding ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(padding)) {
            val columns = if (maxWidth < 340.dp || LocalDensity.current.fontScale > 1.25f) 1 else 2
            val rows = shownTools.chunked(columns)
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (searchVisible) {
                    item {
                        OutlinedTextField(
                            value = query,
                            onValueChange = { query = it },
                            label = { Text("Find a tool") },
                            singleLine = true,
                            leadingIcon = { Icon(Icons.Default.Search, null) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(20.dp),
                        )
                    }
                }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        Text("ALL TOOLS & ACTIVITY",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.Bold)
                        Text("Organize your day",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.ExtraBold)
                        Text("From conversations to real-life actions.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                ui.error?.let { error ->
                    item {
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                            Column(Modifier.padding(14.dp)) {
                                Text("Couldn't load your records", fontWeight = FontWeight.SemiBold)
                                Text(error, style = MaterialTheme.typography.bodySmall)
                                TextButton(onClick = onRefresh) { Text("Retry") }
                            }
                        }
                    }
                }
                if (shownTools.isEmpty()) {
                    item { Text("No matching tools", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                items(rows.size) { index ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        rows[index].forEach { tool ->
                            Card(
                                onClick = { onNavigate(tool.destination) },
                                modifier = Modifier.weight(1f).heightIn(min = 128.dp),
                                shape = RoundedCornerShape(22.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = .65f)),
                            ) {
                                Column(
                                    Modifier.fillMaxWidth().padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(9.dp),
                                ) {
                                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                                        Surface(shape = RoundedCornerShape(14.dp), color = tool.accent.copy(alpha = .12f)) {
                                            Icon(tool.icon, contentDescription = null,
                                                tint = tool.accent,
                                                modifier = Modifier.padding(10.dp).size(27.dp))
                                        }
                                        Spacer(Modifier.weight(1f))
                                        Icon(Icons.Default.ChevronRight,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .65f))
                                    }
                                    Text(tool.title, style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    Text(when { ui.error != null -> "Unavailable · Retry"; loading -> "Syncing…"; else -> tool.detail },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                        if (rows[index].size < columns) Spacer(Modifier.weight(1f))
                    }
                }
                if (sectionVisible("My Circles")) {
                    item {
                        WorkspaceSection("My Circles", "View all", {
                            onNavigate("groups")
                        }) {
                            WorkspaceLink(
                                title = "Shared groups & circles",
                                detail = if (loading) "Syncing…" else "$circles conversations · Open your circles",
                                icon = Icons.Default.Groups,
                                accent = todayPink,
                                onClick = { onNavigate("groups") },
                            )
                        }
                    }
                }
                if (sectionVisible("Money & shared plans")) {
                    item {
                        WorkspaceSection("Money & shared plans", "Details", {
                            onNavigate(DailyRoutes.SPLITS)
                        }) {
                            WorkspaceLink(
                                title = "Split bills & shared expenses",
                                detail = when {
                                    ui.splitError != null -> "Unavailable · Tap to retry"
                                    loading -> "Syncing…"
                                    else -> "${ui.splitBills.size} tracked split bills"
                                },
                                icon = Icons.Default.AccountBalanceWallet,
                                accent = todayGold,
                                onClick = { onNavigate(DailyRoutes.SPLITS) },
                            )
                        }
                    }
                }
                if (sectionVisible("China Direct")) {
                    item {
                        WorkspaceSection("China Direct", "Orders", {
                            onNavigate(DailyRoutes.CHINA_DIRECT)
                        }) {
                            WorkspaceLink(
                                title = "Shop & order updates",
                                detail = "Supplier quotes · Preview, checkout unavailable",
                                icon = Icons.Default.ShoppingBag,
                                accent = todayGreen,
                                onClick = { onNavigate(DailyRoutes.CHINA_DIRECT) },
                            )
                        }
                    }
                }
                item {
                    Text("Private notes and personal tracking are visible only to you. Shared items follow each feature's permissions.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun WorkspaceSection(
    heading: String,
    action: String,
    onAction: () -> Unit,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(heading, style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
            TextButton(onClick = onAction) {
                Text(action)
                Spacer(Modifier.width(2.dp))
                Icon(Icons.Default.ChevronRight, contentDescription = null,
                    modifier = Modifier.size(19.dp))
            }
        }
        content()
    }
}

@Composable
private fun WorkspaceLink(
    title: String,
    detail: String,
    icon: ImageVector,
    accent: Color,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = .65f)),
    ) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = RoundedCornerShape(15.dp), color = accent.copy(alpha = .12f)) {
                Icon(icon, contentDescription = null, tint = accent,
                    modifier = Modifier.padding(11.dp).size(26.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                Text(detail, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.width(8.dp))
            Icon(Icons.Default.ChevronRight, contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
