package app.gagachat.feature.dailylife

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.net.Uri
import android.os.Build
import android.content.Intent
import android.provider.CalendarContract
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Note
import androidx.compose.material.icons.automirrored.filled.PhoneMissed
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.repeatOnLifecycle
import androidx.compose.ui.platform.LocalDensity
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.*
import androidx.navigation.compose.composable
import app.gagachat.core.model.*
import app.gagachat.core.ui.component.GagaScaffold
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.*
import java.time.format.DateTimeFormatter
import java.util.UUID

object DailyRoutes {
    const val HOME = "daily"
    const val RECORDS = "daily/records/{section}"
    const val EDIT = "daily/edit/{kind}?id={id}&text={text}&chat={chat}&message={message}"
    const val SHOP = "daily/shop/{id}"
    const val SPLITS = "daily/splits"
    const val SAFE = "daily/safe"
    fun records(section: String) = "daily/records/$section"
    fun edit(kind: String, id: String = "", text: String = "", chat: String = "", message: String = "") =
        "daily/edit/$kind?id=${Uri.encode(id)}&text=${Uri.encode(text.take(2000))}&chat=${Uri.encode(chat)}&message=${Uri.encode(message)}"
}

fun NavGraphBuilder.dailyLifeGraph(nav: NavController, onSaved: () -> Unit, onChat: (String) -> Unit) {
    composable(DailyRoutes.HOME) { DailyHome(nav, onSaved, onChat) }
    composable(DailyRoutes.RECORDS) { entry -> RecordList(entry.arguments?.getString("section").orEmpty(), nav, onChat) }
    composable(DailyRoutes.EDIT, arguments = listOf("id", "text", "chat", "message").map { navArgument(it) { type = NavType.StringType; defaultValue = "" } }) { entry ->
        RecordEditor(entry.arguments?.getString("kind").orEmpty(), entry.arguments?.getString("id").orEmpty(), entry.arguments?.getString("text").orEmpty(), entry.arguments?.getString("chat").orEmpty(), entry.arguments?.getString("message").orEmpty(), nav)
    }
    composable(DailyRoutes.SHOP) { entry -> ShoppingScreen(entry.arguments?.getString("id").orEmpty(), nav) }
    composable(DailyRoutes.SPLITS) { SplitBillsScreen(nav, onChat) }
    composable(DailyRoutes.SAFE) { SafeScreen(onBack = { nav.popBackStack() }) }
}

private val labels = mapOf("task" to "Task", "event" to "Event", "income" to "Income", "expense" to "Expense", "lent" to "Money lent", "borrowed" to "Money borrowed", "reminder" to "Reminder", "note" to "Private note", "goal" to "Savings goal", "budget" to "Monthly budget", "account" to "Opening balance")
private fun title(section: String) = when(section) { "task" -> "Tasks"; "event" -> "Events"; "money" -> "Money Book"; "debts" -> "Borrowed & Lent"; "shopping" -> "Shopping Lists"; "reminder" -> "Bills & Reminders"; "goal" -> "Savings Goals"; "budget" -> "Monthly Budgets"; "account" -> "Recorded Accounts"; else -> "Private Notes" }
private fun kinds(section: String) = when(section) { "money" -> listOf("income","expense"); "debts" -> listOf("lent","borrowed"); "shopping" -> emptyList(); else -> listOf(section) }
private fun date(value: String?) = value?.let { runCatching { Instant.parse(it).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("dd MMM yyyy, HH:mm")) }.getOrDefault(it) }.orEmpty()
private fun month(value: String) = runCatching { YearMonth.from(Instant.parse(value).atZone(ZoneId.systemDefault())) }.getOrNull()

@Composable
private fun ResumeRefresh(vm: DailyLifeViewModel) {
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner, vm) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) vm.refresh() }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
}

@Composable
private fun Status(ui: DailyUi, vm: DailyLifeViewModel) {
    if(ui.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
    ui.error?.let { error ->
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
            Column(Modifier.padding(12.dp)) { Text(error); TextButton(onClick = { vm.refresh() }, enabled = !ui.busy) { Text("Retry loading") } }
        }
    }
}

/** Compact count tile used by the "Today at a glance" summary card. */
@Composable
private fun GlanceStat(label: String, value: Int, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text("$value", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
    }
}

@Composable
fun DailyHome(nav: NavController, onSaved: () -> Unit, onChat: (String) -> Unit, vm: DailyLifeViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val fontScale = LocalDensity.current.fontScale
    ResumeRefresh(vm)
    val sections = listOf("task" to Icons.Default.TaskAlt, "event" to Icons.Default.Event, "reminder" to Icons.Default.NotificationsActive, "money" to Icons.Default.AccountBalanceWallet, "shopping" to Icons.Default.ShoppingCart, "debts" to Icons.Default.People, "goal" to Icons.Default.Savings, "budget" to Icons.Default.PieChart, "account" to Icons.Default.AccountBalance, "note" to Icons.AutoMirrored.Filled.Note)
    GagaScaffold(title = "GaGa Today", actions = { IconButton(onClick = { vm.refresh() }) { Icon(Icons.Default.Refresh, "Refresh") } }) { padding ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(padding)) {
            val columns = if (maxWidth < 340.dp || fontScale > 1.2f) 1 else 2
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item {
                    val greeting = when (LocalTime.now().hour) {
                        in 5..11 -> "Good morning"
                        in 12..16 -> "Good afternoon"
                        in 17..21 -> "Good evening"
                        else -> "Good night"
                    }
                    Text("$greeting \uD83D\uDC4B", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                    Text(LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, d MMMM")), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    Text("Your day, organized from your chats", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("See what needs attention, then turn conversations into actions without leaving GaGa.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                item { Status(ui, vm) }
                // "Today at a glance" — an at-a-glance summary of what needs
                // attention right now, computed from the same data the sections
                // below use. Purely additive; every section still renders.
                val glanceTasks = ui.records.filter { it.kind == "task" && !it.completed }
                val glanceReminders = ui.records.filter { it.kind == "reminder" && !it.completed }
                fun dueToday(value: String?): Boolean = value?.let { runCatching { Instant.parse(it).atZone(ZoneId.systemDefault()).toLocalDate() == LocalDate.now() }.getOrDefault(false) } == true
                fun overdue(value: String?): Boolean = value?.let { runCatching { Instant.parse(it).isBefore(Instant.now()) }.getOrDefault(false) } == true
                val tasksDueToday = glanceTasks.count { dueToday(it.dueAt) }
                val eventsToday = ui.records.count { it.kind == "event" && !it.completed && dueToday(it.dueAt) }
                val overdueTasks = glanceTasks.filter { overdue(it.dueAt) }
                val overdueReminders = glanceReminders.filter { overdue(it.dueAt) }
                val unreadTotal = ui.conversations.filter { !it.isArchived }.sumOf { it.unreadCount }
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Today, null, tint = MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.width(10.dp))
                                Text("Today at a glance", fontWeight = FontWeight.Bold)
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                GlanceStat("Tasks due", tasksDueToday, Modifier.weight(1f))
                                GlanceStat("Events", eventsToday, Modifier.weight(1f))
                                GlanceStat("Reminders", glanceReminders.size, Modifier.weight(1f))
                                GlanceStat("Unread", unreadTotal, Modifier.weight(1f))
                            }
                        }
                    }
                }
                if (overdueTasks.isNotEmpty() || overdueReminders.isNotEmpty()) item {
                    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.WarningAmber, null, tint = MaterialTheme.colorScheme.error)
                                Spacer(Modifier.width(10.dp))
                                Text("Overdue", fontWeight = FontWeight.Bold)
                                Spacer(Modifier.weight(1f))
                                Text("${overdueTasks.size + overdueReminders.size}", fontWeight = FontWeight.Bold)
                            }
                            overdueTasks.take(2).forEach { Text("\u2022 ${it.title} \u00b7 due ${date(it.dueAt)}", style = MaterialTheme.typography.bodyMedium) }
                            overdueReminders.take(2).forEach { Text("\u2022 ${it.title} \u00b7 due ${date(it.dueAt)}", style = MaterialTheme.typography.bodyMedium) }
                        }
                    }
                }
                item { Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("task", "event", "reminder", "expense", "income", "note").forEach { kind ->
                        FilledTonalButton(onClick = { nav.navigate(DailyRoutes.edit(kind)) }) { Text("Add ${labels[kind]}") }
                    }
                } }
                val needsReply = ui.conversations
                    .filter { it.unreadCount > 0 && !it.isArchived }
                    .sortedByDescending { it.lastMessageAt ?: it.updatedAt }
                if (needsReply.isNotEmpty()) item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.MarkUnreadChatAlt, null, tint = MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.width(10.dp))
                                Text("Needs reply", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                Text("${needsReply.sumOf { it.unreadCount }} unread", style = MaterialTheme.typography.labelMedium)
                            }
                            needsReply.take(3).forEach { conversation ->
                                Row(
                                    Modifier.fillMaxWidth().clickable { onChat(conversation.id) }.padding(vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Text(conversation.displayTitle(vm.userId), fontWeight = FontWeight.SemiBold)
                                        conversation.lastMessagePreview?.takeIf { it.isNotBlank() }?.let {
                                            Text(it, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                    Text("${conversation.unreadCount}", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }

                val upcomingEvents = ui.records
                    .filter { it.kind == "event" && !it.completed }
                    .mapNotNull { record -> record.dueAt?.let { runCatching { Instant.parse(it) }.getOrNull() }?.let { record to it } }
                    .filter { (_, due) -> due.isAfter(Instant.now().minusSeconds(60)) }
                    .sortedBy { it.second }
                if (upcomingEvents.isNotEmpty()) item {
                    Card(Modifier.fillMaxWidth().clickable { nav.navigate(DailyRoutes.records("event")) }) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Event, null, tint = MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.width(10.dp))
                                Text("Upcoming", fontWeight = FontWeight.Bold)
                            }
                            upcomingEvents.take(3).forEach { (record, due) ->
                                Text("${record.title} · ${date(due.toString())}", style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }

                val missedCalls = ui.calls
                    .filter { it.status == CallStatus.MISSED && !it.isOutgoing && it.conversationId.isNotBlank() }
                    .sortedByDescending { it.startedAt }
                if (missedCalls.isNotEmpty()) item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.AutoMirrored.Filled.PhoneMissed, null, tint = MaterialTheme.colorScheme.error)
                                Spacer(Modifier.width(10.dp))
                                Text("Missed calls", fontWeight = FontWeight.Bold)
                            }
                            missedCalls.take(3).forEach { call ->
                                Row(
                                    Modifier.fillMaxWidth().clickable { onChat(call.conversationId) }.padding(vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(call.peerName?.takeIf { it.isNotBlank() } ?: "GaGa contact", modifier = Modifier.weight(1f))
                                    Text("Open chat", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
                                }
                            }
                        }
                    }
                }

                val myOpenSplitShares = ui.splitMembers.filter { it.userId == vm.userId && !it.settled }
                if (ui.splitBills.isNotEmpty()) item {
                    val amountByCurrency = myOpenSplitShares
                        .mapNotNull { share -> ui.splitBills.firstOrNull { it.id == share.billId }?.let { it.currency to share.shareMinor } }
                        .groupBy({ it.first }, { it.second })
                        .mapValues { (_, values) -> values.sum() }
                    val splitSummary = if (amountByCurrency.isNotEmpty()) {
                        amountByCurrency.entries.joinToString(" · ") { (currency, minor) -> "${DailyMoney.format(minor)} $currency due" }
                    } else {
                        "${ui.splitBills.size} tracked ${if (ui.splitBills.size == 1) "bill" else "bills"}"
                    }
                    Card(Modifier.fillMaxWidth().clickable { nav.navigate(DailyRoutes.SPLITS) }) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Groups, null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text("Split bills", fontWeight = FontWeight.SemiBold)
                                Text(splitSummary, style = MaterialTheme.typography.bodySmall)
                            }
                            Icon(Icons.Default.ChevronRight, null)
                        }
                    }
                }

                item {
                    Card(Modifier.fillMaxWidth().clickable { nav.navigate(DailyRoutes.SAFE) }) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.HealthAndSafety, null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text("GaGa Safe", fontWeight = FontWeight.SemiBold)
                                Text("Check-ins, safe arrival & SOS to your trusted contacts", style = MaterialTheme.typography.bodySmall)
                            }
                            Icon(Icons.Default.ChevronRight, null)
                        }
                    }
                }

                val tasks = ui.records.filter { it.kind == "task" && !it.completed }
                if (tasks.isNotEmpty()) item {
                    val dueToday = tasks.count { it.dueAt?.let { due -> runCatching { Instant.parse(due).atZone(ZoneId.systemDefault()).toLocalDate() == LocalDate.now() }.getOrDefault(false) } == true }
                    Card(Modifier.fillMaxWidth().clickable { nav.navigate(DailyRoutes.records("task")) }) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.TaskAlt, null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) { Text("${tasks.size} open tasks", fontWeight = FontWeight.SemiBold); Text("$dueToday due today", style = MaterialTheme.typography.bodySmall) }
                            Icon(Icons.Default.ChevronRight, null)
                        }
                    }
                }
                val reminders = ui.records.filter { it.kind == "reminder" && !it.completed }
                if (reminders.isNotEmpty()) item {
                    val overdue = reminders.count { it.dueAt?.let { due -> Instant.parse(due).isBefore(Instant.now()) } == true }
                    Card(Modifier.fillMaxWidth().clickable { nav.navigate(DailyRoutes.records("reminder")) }) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.NotificationsActive, null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) { Text("${reminders.size} pending reminders", fontWeight = FontWeight.SemiBold); Text("$overdue overdue", style = MaterialTheme.typography.bodySmall) }
                            Icon(Icons.Default.ChevronRight, null)
                        }
                    }
                }
                val current = ui.records.filter { month(it.happenedAt) == YearMonth.now() }
                items(current.filter { it.kind in listOf("income", "expense") }.map { it.currency }.distinct()) { currency ->
                    val income = current.filter { it.kind == "income" && it.currency == currency }.sumOf { it.amountMinor }
                    val expense = current.filter { it.kind == "expense" && it.currency == currency }.sumOf { it.amountMinor }
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                        Column(Modifier.fillMaxWidth().padding(16.dp)) {
                            Text("This month · $currency", fontWeight = FontWeight.Bold)
                            Text("Recorded difference ${DailyMoney.format(income - expense)}", style = MaterialTheme.typography.titleLarge)
                            Text("Income ${DailyMoney.format(income)}")
                            Text("Expenses ${DailyMoney.format(expense)}")
                        }
                    }
                }
                items(sections.chunked(columns)) { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        row.forEach { (section, icon) ->
                            Card(Modifier.weight(1f).clickable { nav.navigate(DailyRoutes.records(section)) }) {
                                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
                                    Text(title(section), fontWeight = FontWeight.SemiBold)
                                    val count = if (section == "shopping") ui.lists.size else ui.records.count { it.kind in kinds(section) }
                                    Text("$count ${if (section == "shopping") "lists" else "records"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
                item { OutlinedButton(onClick = onSaved, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Bookmark, null); Spacer(Modifier.width(8.dp)); Text("Saved messages") } }
                item { Text("Personal records stay private. Only your chosen members can see shared shopping lists. Recorded amounts are not money held by GaGa.", style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

@Composable
private fun RecordList(section: String, nav: NavController, onChat: (String) -> Unit, vm: DailyLifeViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    ResumeRefresh(vm)
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("All") }
    var addList by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<DailyRecord?>(null) }
    var confirmDelete by remember { mutableStateOf<DailyRecord?>(null) }
    var contribution by remember { mutableStateOf<DailyRecord?>(null) }
    var exportMessage by remember { mutableStateOf<String?>(null) }
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    val visible=ui.records.filter {
        val matchesFilter = when (filter) {
            "This month" -> month(it.happenedAt) == YearMonth.now()
            "Pending" -> !it.completed
            "Completed" -> it.completed
            else -> true
        }
        matchesFilter && it.kind in kinds(section) && (it.title.contains(query,true) || it.note.contains(query,true) || it.category.contains(query,true)) }
    val export=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if(uri!=null) scope.launch {
            try {
                val snapshot=visible.toList()
                withContext(Dispatchers.IO) {
                    val csv=buildString {
                        append("Type,Title,Amount,Currency,Category,Account,Recorded date,Due date,Paid,Note\n")
                        snapshot.forEach { r -> append(listOf(r.kind,r.title,DailyMoney.format(r.amountMinor),r.currency,r.category,r.account,r.happenedAt,r.dueAt.orEmpty(),DailyMoney.format(r.paidMinor),r.note).joinToString(",") { raw ->
                            val prefix = raw.trimStart().firstOrNull()
                            val safe=if(prefix in listOf('=', '+', '-', '@') || raw.firstOrNull() in listOf('\t', '\r', '\n')) "'$raw" else raw
                            "\"${safe.replace("\"","\"\"")}\""
                        });append('\n') }
                    }
                    requireNotNull(context.contentResolver.openOutputStream(uri)).use { it.write(csv.toByteArray(Charsets.UTF_8)) }
                }; exportMessage="Export saved"
            } catch(e: CancellationException) { throw e } catch(e: Exception) { exportMessage="Could not save the export" }
        }
    }
    GagaScaffold(title=title(section),onBack={nav.popBackStack()},actions={
        IconButton(onClick={vm.refresh()}) { Icon(Icons.Default.Refresh,"Refresh") }
        if(section!="shopping") IconButton(onClick={export.launch("GaGa-$section.csv")}) { Icon(Icons.Default.FileDownload,"Export records") }
    }) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
            item { Status(ui,vm) }
            if (section in listOf("money", "task", "event", "reminder", "budget")) item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    (if (section in listOf("task", "event", "reminder")) listOf("All", "Pending", "Completed") else listOf("All", "This month")).forEach { option ->
                        FilterChip(selected = filter == option, onClick = { filter = option }, label = { Text(option) })
                    }
                }
            }
            item { OutlinedTextField(query,{query=it},label={Text("Search")},modifier=Modifier.fillMaxWidth(),singleLine=true) }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    if(section=="shopping") Button(onClick={addList=true}) { Text("New list") }
                    else kinds(section).forEach { kind -> Button(onClick={nav.navigate(DailyRoutes.edit(kind))}) { Text("Add ${labels[kind]}") } }
                }
            }
            exportMessage?.let { item { Text(it) } }
            if(section=="account") {
                items(ui.records.filter { it.kind in listOf("account","income","expense") }.map { it.account to it.currency }.distinct()) { (account,currency) ->
                    val balance=ui.records.filter { it.account==account && it.currency==currency }.sumOf { when(it.kind) { "account","income" -> it.amountMinor; "expense" -> -it.amountMinor; else -> 0L } }
                    itemCard("$account · $currency","Recorded balance ${DailyMoney.format(balance)}") {}
                }
            }
            if(section=="shopping") {
                if(ui.lists.isEmpty()&&!ui.loading) item { Text("Create your first shopping list. Add members only when you want to share it.") }
                items(ui.lists.filter { it.title.contains(query,true) },key={it.id}) { list -> itemCard(list.title,"${list.memberIds.size+1} members · ${if(list.ownerId==vm.userId) "Owned by you" else "Shared with you"}") {nav.navigate("daily/shop/${list.id}")} }
            } else {
                if(visible.isEmpty()&&!ui.loading) item { Text("No records here yet. Add your first one above.") }
                items(visible,key={it.id}) { record ->
                    val detail=buildString {
                        append(labels[record.kind]);append(" · ");append(date(record.happenedAt))
                        if(record.kind !in listOf("task","event","note","reminder")) append("\n${record.currency} ${DailyMoney.format(record.amountMinor)} · ${record.category}")
                        if(record.kind in listOf("lent","borrowed","goal")) append("\nRemaining ${DailyMoney.format(record.amountMinor-record.paidMinor)}")
                        if(record.kind=="budget") {
                            val spent=ui.records.filter { it.kind=="expense" && it.currency==record.currency && (record.category=="All" || it.category.equals(record.category,true)) && month(it.happenedAt)==month(record.happenedAt) }.sumOf { it.amountMinor }
                            append("\nSpent ${DailyMoney.format(spent)} · Remaining ${DailyMoney.format(record.amountMinor-spent)}")
                        }
                        record.dueAt?.let { append("\nDue ${date(it)}${if(record.completed) " · Completed" else if(Instant.parse(it).isBefore(Instant.now())) " · Overdue" else ""}") }
                    }
                    itemCard(record.title,detail) { selected=record }
                }
            }
        }
    }
    selected?.let { record ->
        AlertDialog(onDismissRequest={selected=null},title={Text(record.title)},text={
            Column {
                if(record.note.isNotBlank()) Text(record.note)
                TextButton(onClick={selected=null;nav.navigate(DailyRoutes.edit(record.kind,record.id))}) {Text("Edit")}
                if(record.kind in listOf("task","event","reminder")) TextButton(onClick={vm.complete(record);selected=null},enabled=!ui.busy) {Text(if(record.completed) "Mark pending" else "Mark completed")}
                if(record.kind=="event" && record.dueAt != null) TextButton(onClick={addEventToCalendar(context,record)}) {Text("Add to device calendar")}
                if(record.kind in listOf("lent","borrowed","goal") && record.paidMinor<record.amountMinor) TextButton(onClick={selected=null;contribution=record}) {Text(if(record.kind=="goal") "Record contribution" else "Record repayment")}
                record.sourceChat?.let { chat -> TextButton(onClick={selected=null;onChat(chat)}) {Text("Open source chat")} }
                TextButton(onClick={selected=null;confirmDelete=record}) {Text("Delete",color=MaterialTheme.colorScheme.error)}
            }
        },confirmButton={TextButton(onClick={selected=null}) {Text("Close")}})
    }
    confirmDelete?.let { record -> AlertDialog(onDismissRequest={if(!ui.busy)confirmDelete=null},title={Text("Delete this record?")},text={Text("This removes the record and its repayment history. Chat messages are unaffected.")},confirmButton={TextButton(onClick={vm.remove(record){confirmDelete=null}},enabled=!ui.busy){Text("Delete")}},dismissButton={TextButton(onClick={confirmDelete=null},enabled=!ui.busy){Text("Cancel")}}) }
    contribution?.let { record -> EntryDialog(if(record.kind=="goal") "Record contribution" else "Record repayment","Amount (${record.currency})",ui.busy,ui.error,{contribution=null;vm.clearError()}) { text,id,done -> vm.contribute(record,text,id){contribution=null;done()} } }
    if(addList) EntryDialog("New shopping list","List name",ui.busy,ui.error,{addList=false;vm.clearError()}) { text,id,done -> vm.createList(text,id){addList=false;done()} }
}

private fun addEventToCalendar(context: android.content.Context, record: DailyRecord) {
    val start = record.dueAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: return
    val intent = Intent(Intent.ACTION_INSERT).apply {
        data = CalendarContract.Events.CONTENT_URI
        putExtra(CalendarContract.Events.TITLE, record.title)
        putExtra(CalendarContract.Events.DESCRIPTION, record.note)
        putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start)
        putExtra(CalendarContract.EXTRA_EVENT_END_TIME, start + 60L * 60 * 1000)
    }
    runCatching { context.startActivity(intent) }
}

@Composable
private fun itemCard(name: String, detail: String, action: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick=action)) { Column(Modifier.padding(16.dp)) {Text(name,fontWeight=FontWeight.SemiBold);Text(detail,style=MaterialTheme.typography.bodyMedium)} }
}

@Composable
private fun EntryDialog(title: String,label: String,busy: Boolean,error: String?,dismiss: () -> Unit,save: (String,String,()->Unit)->Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    val id=rememberSaveable { UUID.randomUUID().toString() }
    AlertDialog(
        onDismissRequest = { if (!busy) dismiss() },
        title = { Text(title) },
        text = {
            Column {
                OutlinedTextField(text, { text = it }, label = { Text(label) }, singleLine = true)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = { save(text, id, {}) }, enabled = !busy && text.isNotBlank()) {
                Text(if (busy) "Saving…" else "Save")
            }
        },
        dismissButton = { TextButton(onClick = dismiss, enabled = !busy) { Text("Cancel") } },
    )
}

@Composable
private fun RecordEditor(kind: String,id: String,prefill: String,chat: String,message: String,nav: NavController,vm: DailyLifeViewModel=hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    // A chat-derived action gets a deterministic id so the same message can never create two records,
    // even before the server's ignore-duplicates resolution runs.
    val newId=rememberSaveable(chat,message,kind) { if(message.isNotBlank()) SmartActionDraft.dedupeId(vm.userId,message,kind) else UUID.randomUUID().toString() }
    val existing=ui.records.firstOrNull {it.id==id || (id.isEmpty() && it.id==newId)}
    if(id.isNotEmpty() && existing==null) {
        GagaScaffold(title="Edit record",onBack={nav.popBackStack()}) {p->Column(Modifier.padding(p).padding(16.dp)){Status(ui,vm);if(!ui.loading)Text("Record not available. Refresh or return to your list.")}}
        return
    }
    var name by rememberSaveable(id) { mutableStateOf(existing?.title ?: if(kind in listOf("task","event","expense","reminder")) SmartActionDraft.title(prefill, labels[kind] ?: "Record") else "") }
    var amount by rememberSaveable(id) { mutableStateOf(existing?.let {DailyMoney.format(it.amountMinor)} ?: (SmartActionDraft.money(prefill)?.amountText ?: "")) }
    var currency by rememberSaveable(id) { mutableStateOf(existing?.currency ?: SmartActionDraft.currency(prefill)) }
    var category by rememberSaveable(id) { mutableStateOf(existing?.category ?: if(kind=="budget") "All" else "Other") }
    var account by rememberSaveable(id) { mutableStateOf(existing?.account ?: "Cash") }
    var note by rememberSaveable(id) { mutableStateOf(existing?.note ?: prefill) }
    var happened by rememberSaveable(id) { mutableStateOf(existing?.happenedAt ?: Instant.now().toString()) }
    var due by rememberSaveable(id) { mutableStateOf(existing?.dueAt ?: if(kind in listOf("task","event","reminder")) (SmartActionDraft.dueAt(prefill, Instant.now(), ZoneId.systemDefault()) ?: Instant.now().plusSeconds(86400).toString()) else "") }
    var validation by remember { mutableStateOf<String?>(null) }
    var confirmed by remember { mutableStateOf(false) }
    val context=LocalContext.current
    val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    val monetary=kind !in listOf("task","event","note","reminder")
    val fromChat = id.isEmpty() && (chat.isNotBlank() || message.isNotBlank())
    // Validate, then persist. A chat-derived action is confirmed before saving.
    val validate = {
        val minor=if(monetary)DailyMoney.parseMinor(amount) else 0L
        validation=when {
            name.isBlank()->"Enter a title or person."
            minor==null->"Enter a positive amount with at most two decimal places."
            category.isBlank() || account.isBlank()->"Category and account cannot be empty."
            kind in listOf("reminder","event") && due != existing?.dueAt && !Instant.parse(due).isAfter(Instant.now())->"Choose a future time."
            else->null
        }
        validation==null
    }
    val save = {
        val minor=if(monetary)DailyMoney.parseMinor(amount) else 0L
        if(kind in listOf("task","event","reminder") && Build.VERSION.SDK_INT>=33 && ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        vm.save(DailyRecord(id=existing?.id ?: newId,ownerId=vm.userId,kind=kind,title=name.trim(),amountMinor=minor ?: 0,paidMinor=existing?.paidMinor ?: 0,currency=currency,category=category.trim(),account=account.trim(),note=note,happenedAt=happened,dueAt=due.takeIf{it.isNotBlank()},completed=existing?.completed ?: false,sourceChat=existing?.sourceChat ?: chat.takeIf{it.isNotBlank()},sourceMessage=existing?.sourceMessage ?: message.takeIf{it.isNotBlank()}),id.isNotEmpty()){nav.popBackStack()}
    }
    GagaScaffold(title=if(id.isEmpty()) "Add ${labels[kind]}" else "Edit ${labels[kind]}",onBack={nav.popBackStack()}) {padding->
        Column(Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(name,{name=it.take(160)},label={Text(if(kind in listOf("lent","borrowed")) "Person / description" else "Title")},modifier=Modifier.fillMaxWidth())
            if(monetary) {
                OutlinedTextField(amount,{amount=it},label={Text(if(kind=="account") "Opening recorded balance" else "Amount")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal),modifier=Modifier.fillMaxWidth(),enabled=existing?.paidMinor==null || existing.paidMinor==0L)
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {listOf("BDT","USD","CNY").forEach{c->FilterChip(selected=currency==c,onClick={currency=c},label={Text(c)},enabled=existing?.paidMinor==null || existing.paidMinor==0L)}}
                if(kind in listOf("income","expense","budget")) OutlinedTextField(category,{category=it.take(80)},label={Text("Category${if(kind=="budget") " (All for overall budget)" else ""}")},modifier=Modifier.fillMaxWidth())
                if(kind in listOf("income","expense","account")) OutlinedTextField(account,{account=it.take(80)},label={Text("Recorded account (Cash / Bank / bKash…)" )},modifier=Modifier.fillMaxWidth())
                Text("This records an amount. It does not move or hold money.",style=MaterialTheme.typography.bodySmall)
            }
            OutlinedButton(onClick={pickDateTime(context,happened){happened=it}},modifier=Modifier.fillMaxWidth()){Text("Record date: ${date(happened)}")}
            if(kind in listOf("task","event","reminder","lent","borrowed","goal")) {
                OutlinedButton(onClick={pickDateTime(context,due.ifBlank{Instant.now().plusSeconds(86400).toString()}){due=it}},modifier=Modifier.fillMaxWidth()){Text(if(due.isBlank()) "Set due date" else "Due: ${date(due)}")}
                if(kind !in listOf("reminder","event") && due.isNotBlank()) TextButton(onClick={due=""}){Text("Remove due date")}
                if(kind in listOf("task","event","reminder")) Text("Due alerts can be delayed by connectivity or Android battery settings. Upcoming items remain visible in GaGa Today.",style=MaterialTheme.typography.bodySmall)
            }
            OutlinedTextField(note,{note=it.take(4000)},label={Text("Private note")},modifier=Modifier.fillMaxWidth(),minLines=3)
            validation?.let{Text(it,color=MaterialTheme.colorScheme.error)}
            ui.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
            Button(modifier=Modifier.fillMaxWidth(),enabled=!ui.busy,onClick={
                if(validate()) { if(fromChat) confirmed=true else save() }
            }) {Text(if(ui.busy) "Saving…" else if(fromChat) "Review & save" else "Save record")}
        }
    }
    if(confirmed) AlertDialog(
        onDismissRequest={if(!ui.busy)confirmed=false},
        title={Text("Add to GaGa Today?")},
        text={Column(verticalArrangement=Arrangement.spacedBy(4.dp)){
            Text("${labels[kind]}: ${name.trim()}")
            if(due.isNotBlank()) Text("Due ${date(due)}",style=MaterialTheme.typography.bodySmall)
            if(monetary) Text("${currency} ${DailyMoney.format(DailyMoney.parseMinor(amount) ?: 0L)}",style=MaterialTheme.typography.bodySmall)
            Text("You can edit or delete it any time in GaGa Today.",style=MaterialTheme.typography.bodySmall)
        }},
        confirmButton={TextButton(onClick={confirmed=false;save()},enabled=!ui.busy){Text("Confirm")}},
        dismissButton={TextButton(onClick={confirmed=false},enabled=!ui.busy){Text("Cancel")}},
    )
}

private fun pickDateTime(context: android.content.Context,iso: String,onPicked:(String)->Unit) {
    val zoned=Instant.parse(iso).atZone(ZoneId.systemDefault())
    DatePickerDialog(context,{_,year,month,day->TimePickerDialog(context,{_,hour,minute->onPicked(LocalDateTime.of(year,month+1,day,hour,minute).atZone(ZoneId.systemDefault()).toInstant().toString())},zoned.hour,zoned.minute,true).show()},zoned.year,zoned.monthValue-1,zoned.dayOfMonth).show()
}

@Composable
private fun SplitBillsScreen(nav: NavController, onChat: (String) -> Unit, vm: DailyLifeViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    ResumeRefresh(vm)
    GagaScaffold(title = "Split bills", onBack = { nav.popBackStack() }) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Status(ui, vm) }
            if (!ui.loading && ui.splitBills.isEmpty()) {
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("No split bills yet", fontWeight = FontWeight.Bold)
                            Text("Long-press a money message in chat and choose Split bill.")
                        }
                    }
                }
            }
            items(ui.splitBills, key = { it.id }) { bill ->
                val shares = ui.splitMembers.filter { it.billId == bill.id }
                val mine = shares.firstOrNull { it.userId == vm.userId }
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(bill.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text("Total: ${DailyMoney.format(bill.totalMinor)} ${bill.currency}")
                        shares.forEach { share ->
                            val name = ui.splitUsers[share.userId]?.displayLabel
                                ?: if (share.userId == vm.userId) "You" else "GaGa user"
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text(name, modifier = Modifier.weight(1f))
                                Text("${DailyMoney.format(share.shareMinor)} ${bill.currency}")
                                Spacer(Modifier.width(8.dp))
                                Text(if (share.settled) "Settled" else "Due", color = if (share.settled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                            }
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                            TextButton(onClick = { onChat(bill.chatId) }) { Text("Open chat") }
                            mine?.let { share ->
                                TextButton(onClick = { vm.setSplitSettled(bill.id, vm.userId, !share.settled) }, enabled = !ui.busy) {
                                    Text(if (share.settled) "Mark due" else "Mark settled")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ShoppingScreen(id: String, nav: NavController, vm: DailyLifeViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val owner = LocalLifecycleOwner.current
    var adding by remember { mutableStateOf(false) }
    var sharing by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var deletingList by remember { mutableStateOf(false) }
    var editItem by remember { mutableStateOf<ShoppingItem?>(null) }
    var deleteItem by remember { mutableStateOf<ShoppingItem?>(null) }
    var menu by remember { mutableStateOf(false) }
    LaunchedEffect(id, owner) {
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) { vm.selectList(id).join(); delay(15000) }
        }
    }
    val list = ui.selectedList
    GagaScaffold(title = list?.title ?: "Shopping list", onBack = { nav.popBackStack() }, actions = {
        IconButton(onClick = { vm.selectList(id) }, enabled = !ui.busy) { Icon(Icons.Default.Refresh, "Refresh list") }
        if (list?.ownerId == vm.userId) Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, "List options") }
            DropdownMenu(menu, { menu = false }) {
                DropdownMenuItem(text = { Text("Rename list") }, onClick = { menu = false; renaming = true })
                DropdownMenuItem(text = { Text("Delete list") }, onClick = { menu = false; deletingList = true })
            }
        }
    }) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { Status(ui, vm) }
            if (list == null) item {
                Text(if (ui.listLoading || ui.loading) "Loading shopping list…" else "This list was deleted or you no longer have access. Return to Shopping Lists.")
            } else {
                item {
                    Text("${ui.items.count { it.purchased }} of ${ui.items.size} purchased", style = MaterialTheme.typography.titleMedium)
                    if (ui.items.isNotEmpty()) LinearProgressIndicator(
                        progress = { ui.items.count { it.purchased }.toFloat() / ui.items.size }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { adding = true }, enabled = !ui.busy) { Text("Add item") }
                        if (list.ownerId == vm.userId) OutlinedButton(onClick = { sharing = true }, enabled = !ui.busy) { Text("Members") }
                    }
                }
                items(ui.items, key = { it.id }) { item ->
                    var options by remember { mutableStateOf(false) }
                    Card {
                        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(item.purchased, { vm.purchase(item) }, enabled = !ui.busy)
                            Column(Modifier.weight(1f)) {
                                Text(item.name, fontWeight = FontWeight.Medium)
                                Text("Quantity: ${item.quantity}", style = MaterialTheme.typography.bodySmall)
                            }
                            Box {
                                IconButton(onClick = { options = true }, enabled = !ui.busy) { Icon(Icons.Default.MoreVert, "Item options") }
                                DropdownMenu(options, { options = false }) {
                                    DropdownMenuItem(text = { Text("Edit item") }, onClick = { options = false; editItem = item })
                                    DropdownMenuItem(text = { Text("Remove item") }, onClick = { options = false; deleteItem = item })
                                }
                            }
                        }
                    }
                }
                if (ui.items.isEmpty()) item { Text("No items yet. Add groceries or other things to buy.") }
                item { Text("Members can view, edit and check off items. Lists refresh while this screen is visible.", style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
    if (adding || editItem != null) {
        val current = editItem
        var name by rememberSaveable(current?.id) { mutableStateOf(current?.name.orEmpty()) }
        var quantity by rememberSaveable(current?.id) { mutableStateOf(current?.quantity ?: "1") }
        val itemId = rememberSaveable { UUID.randomUUID().toString() }
        AlertDialog(onDismissRequest = { if (!ui.busy) { adding = false; editItem = null; vm.clearError() } },
            title = { Text(if (current == null) "Add item" else "Edit item") },
            text = { Column {
                OutlinedTextField(name, { name = it.take(160) }, label = { Text("Item") })
                OutlinedTextField(quantity, { quantity = it.take(80) }, label = { Text("Quantity") })
                ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            } },
            confirmButton = { TextButton(onClick = {
                val done = { adding = false; editItem = null }
                if (current == null) vm.addItem(id, name, quantity, itemId, done) else vm.editItem(current, name, quantity, done)
            }, enabled = !ui.busy && name.isNotBlank() && quantity.isNotBlank()) { Text(if (ui.busy) "Saving…" else "Save") } },
            dismissButton = { TextButton(onClick = { adding = false; editItem = null; vm.clearError() }, enabled = !ui.busy) { Text("Cancel") } })
    }
    if (renaming) {
        var text by rememberSaveable { mutableStateOf(list?.title.orEmpty()) }
        AlertDialog(onDismissRequest = { if (!ui.busy) renaming = false }, title = { Text("Rename list") },
            text = { Column { OutlinedTextField(text, { text = it.take(160) }, label = { Text("List name") }); ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) } } },
            confirmButton = { TextButton(onClick = { vm.renameList(id, text) { renaming = false } }, enabled = !ui.busy && text.isNotBlank()) { Text("Save") } },
            dismissButton = { TextButton(onClick = { renaming = false }, enabled = !ui.busy) { Text("Cancel") } })
    }
    if (deletingList || deleteItem != null) {
        val target = deleteItem
        AlertDialog(onDismissRequest = { if (!ui.busy) { deletingList = false; deleteItem = null } },
            title = { Text(if (target == null) "Delete shared list?" else "Remove item?") },
            text = { Column {
                Text(if (target == null) "This removes the list and every item for all members." else "Remove ${target.name} from this list for all members?")
                ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            } },
            confirmButton = { TextButton(onClick = {
                if (target == null) vm.removeList(id) { nav.popBackStack() } else vm.removeItem(target) { deleteItem = null }
            }, enabled = !ui.busy) { Text("Remove", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { deletingList = false; deleteItem = null }, enabled = !ui.busy) { Text("Cancel") } })
    }
    if (sharing) {
        var query by rememberSaveable { mutableStateOf("") }
        var found by remember { mutableStateOf<List<User>>(emptyList()) }
        var selected by remember { mutableStateOf<User?>(null) }
        var searchError by remember { mutableStateOf<String?>(null) }
        LaunchedEffect(query) {
            delay(350); searchError = null
            found = if (query.trim().length < 3) emptyList() else try { vm.searchUsers(query.trim()) }
            catch (e: CancellationException) { throw e } catch (e: Exception) { searchError = "Search failed. Check your connection."; emptyList() }
        }
        AlertDialog(onDismissRequest = { if (!ui.busy) sharing = false }, title = { Text("List members") },
            text = { Column(Modifier.heightIn(max = 400.dp).verticalScroll(rememberScrollState())) {
                Text("Members see every item. Your Money Book and debts remain private.")
                ui.members.forEach { member -> Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(member.displayLabel, Modifier.weight(1f))
                    if (member.id != list?.ownerId) TextButton(onClick = { vm.share(id, member, true) {} }, enabled = !ui.busy) { Text("Remove") }
                } }
                OutlinedTextField(query, { query = it }, label = { Text("Search GaGa name or ID") })
                searchError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                found.filter { it.id !in (list?.memberIds ?: emptyList()) && it.id != list?.ownerId }.forEach { member ->
                    TextButton(onClick = { selected = member }) { Text("${member.displayLabel} ${member.username?.let { "@$it" }.orEmpty()}") }
                }
                selected?.let { member ->
                    Text("Share this list with ${member.displayLabel}?")
                    Button(onClick = { vm.share(id, member, false) { selected = null; query = "" } }, enabled = !ui.busy) { Text("Confirm sharing") }
                }
                ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            } }, confirmButton = { TextButton(onClick = { sharing = false }, enabled = !ui.busy) { Text("Done") } })
    }
}
