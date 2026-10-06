package app.gagachat.feature.dailylife

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.net.Uri
import android.os.Build
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
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
    fun records(section: String) = "daily/records/$section"
    fun edit(kind: String, id: String = "", text: String = "", chat: String = "", message: String = "") =
        "daily/edit/$kind?id=${Uri.encode(id)}&text=${Uri.encode(text.take(2000))}&chat=${Uri.encode(chat)}&message=${Uri.encode(message)}"
}

fun NavGraphBuilder.dailyLifeGraph(nav: NavController, onSaved: () -> Unit, onChat: (String) -> Unit) {
    composable(DailyRoutes.HOME) { DailyHome(nav, onSaved) }
    composable(DailyRoutes.RECORDS) { entry -> RecordList(entry.arguments?.getString("section").orEmpty(), nav, onChat) }
    composable(DailyRoutes.EDIT, arguments = listOf("id", "text", "chat", "message").map { navArgument(it) { type = NavType.StringType; defaultValue = "" } }) { entry ->
        RecordEditor(entry.arguments?.getString("kind").orEmpty(), entry.arguments?.getString("id").orEmpty(), entry.arguments?.getString("text").orEmpty(), entry.arguments?.getString("chat").orEmpty(), entry.arguments?.getString("message").orEmpty(), nav)
    }
    composable(DailyRoutes.SHOP) { entry -> ShoppingScreen(entry.arguments?.getString("id").orEmpty(), nav) }
}

private val labels = mapOf("income" to "Income", "expense" to "Expense", "lent" to "Money lent", "borrowed" to "Money borrowed", "reminder" to "Reminder", "note" to "Private note", "goal" to "Savings goal", "budget" to "Monthly budget", "account" to "Opening balance")
private fun title(section: String) = when(section) { "money" -> "Money Book"; "debts" -> "Borrowed & Lent"; "shopping" -> "Shopping Lists"; "reminder" -> "Bills & Reminders"; "goal" -> "Savings Goals"; "budget" -> "Monthly Budgets"; "account" -> "Recorded Accounts"; else -> "Private Notes" }
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

@Composable
fun DailyHome(nav: NavController, onSaved: () -> Unit, vm: DailyLifeViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    ResumeRefresh(vm)
    val sections = listOf("money" to Icons.Default.AccountBalanceWallet, "debts" to Icons.Default.People, "reminder" to Icons.Default.NotificationsActive, "shopping" to Icons.Default.ShoppingCart, "goal" to Icons.Default.Savings, "budget" to Icons.Default.PieChart, "account" to Icons.Default.AccountBalance, "note" to Icons.Default.Note)
    GagaScaffold(title = "Daily Life", actions = { IconButton(onClick = { vm.refresh() }) { Icon(Icons.Default.Refresh,"Refresh") } }) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { Text("Your everyday organizer", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold) }
            item { Text("Personal records and plans. Recorded amounts are not money held by GaGa.", style = MaterialTheme.typography.bodyMedium) }
            item { Status(ui,vm) }
            val current = ui.records.filter { month(it.happenedAt) == YearMonth.now() }
            items(current.filter { it.kind in listOf("income","expense") }.map { it.currency }.distinct()) { currency ->
                val income = current.filter { it.kind=="income" && it.currency==currency }.sumOf { it.amountMinor }
                val expense = current.filter { it.kind=="expense" && it.currency==currency }.sumOf { it.amountMinor }
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Column(Modifier.fillMaxWidth().padding(16.dp)) {
                        Text("This month · $currency",fontWeight = FontWeight.Bold)
                        Text("Income ${DailyMoney.format(income)}  ·  Expenses ${DailyMoney.format(expense)}")
                        Text("Recorded difference ${DailyMoney.format(income-expense)}")
                    }
                }
            }
            items(sections) { (section,icon) ->
                Card(Modifier.fillMaxWidth().clickable { nav.navigate(DailyRoutes.records(section)) }) {
                    Row(Modifier.padding(16.dp),verticalAlignment = Alignment.CenterVertically) {
                        Icon(icon,null,tint=MaterialTheme.colorScheme.primary); Spacer(Modifier.width(16.dp))
                        Column(Modifier.weight(1f)) {
                            Text(title(section),fontWeight=FontWeight.SemiBold)
                            val count = if(section=="shopping") ui.lists.size else ui.records.count { it.kind in kinds(section) }
                            Text("$count records",style=MaterialTheme.typography.bodySmall)
                        }
                        Icon(Icons.Default.ChevronRight,null)
                    }
                }
            }
            item { OutlinedButton(onClick=onSaved,modifier=Modifier.fillMaxWidth()) { Icon(Icons.Default.Bookmark,null); Spacer(Modifier.width(8.dp));Text("Saved messages") } }
            item { Text("Your personal records stay private. Shopping lists are visible to members you choose.",style=MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun RecordList(section: String, nav: NavController, onChat: (String) -> Unit, vm: DailyLifeViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    ResumeRefresh(vm)
    var query by rememberSaveable { mutableStateOf("") }
    var addList by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<DailyRecord?>(null) }
    var confirmDelete by remember { mutableStateOf<DailyRecord?>(null) }
    var contribution by remember { mutableStateOf<DailyRecord?>(null) }
    var exportMessage by remember { mutableStateOf<String?>(null) }
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    val visible=ui.records.filter { it.kind in kinds(section) && (it.title.contains(query,true) || it.note.contains(query,true) || it.category.contains(query,true)) }
    val export=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if(uri!=null) scope.launch {
            try {
                val snapshot=visible.toList()
                withContext(Dispatchers.IO) {
                    val csv=buildString {
                        append("Type,Title,Amount,Currency,Category,Account,Recorded date,Due date,Paid,Note\n")
                        snapshot.forEach { r -> append(listOf(r.kind,r.title,DailyMoney.format(r.amountMinor),r.currency,r.category,r.account,r.happenedAt,r.dueAt.orEmpty(),DailyMoney.format(r.paidMinor),r.note).joinToString(",") { raw ->
                            val safe=if(raw.startsWith("=") || raw.startsWith("+") || raw.startsWith("-") || raw.startsWith("@")) "'$raw" else raw
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
            item { OutlinedTextField(query,{query=it},label={Text("Search")},modifier=Modifier.fillMaxWidth(),singleLine=true) }
            item {
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
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
                        if(record.kind !in listOf("note","reminder")) append("\n${record.currency} ${DailyMoney.format(record.amountMinor)} · ${record.category}")
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
                if(record.kind=="reminder") TextButton(onClick={vm.complete(record);selected=null},enabled=!ui.busy) {Text(if(record.completed) "Mark pending" else "Mark completed")}
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

@Composable
private fun itemCard(name: String, detail: String, action: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick=action)) { Column(Modifier.padding(16.dp)) {Text(name,fontWeight=FontWeight.SemiBold);Text(detail,style=MaterialTheme.typography.bodyMedium)} }
}

@Composable
private fun EntryDialog(title: String,label: String,busy: Boolean,error: String?,dismiss: () -> Unit,save: (String,String,()->Unit)->Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    val id=rememberSaveable { UUID.randomUUID().toString() }
    AlertDialog(onDismissRequest={if(!busy)dismiss()},title={Text(title)},text={Column {OutlinedTextField(text,{text=it},label={Text(label)},singleLine=true);error?.let{Text(it,color=MaterialTheme.colorScheme.error)}} ,confirmButton={TextButton(onClick={save(text,id,{})},enabled=!busy&&text.isNotBlank()){Text(if(busy)"Saving…" else "Save")}},dismissButton={TextButton(onClick=dismiss,enabled=!busy){Text("Cancel")}})
}

@Composable
private fun RecordEditor(kind: String,id: String,prefill: String,chat: String,message: String,nav: NavController,vm: DailyLifeViewModel=hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val existing=ui.records.firstOrNull {it.id==id}
    if(id.isNotEmpty() && existing==null) {
        GagaScaffold(title="Edit record",onBack={nav.popBackStack()}) {p->Column(Modifier.padding(p).padding(16.dp)){Status(ui,vm);if(!ui.loading)Text("Record not available. Refresh or return to your list.")}}
        return
    }
    var name by rememberSaveable(id) { mutableStateOf(existing?.title ?: if(kind in listOf("expense","reminder")) prefill.take(160) else "") }
    var amount by rememberSaveable(id) { mutableStateOf(existing?.let {DailyMoney.format(it.amountMinor)} ?: "") }
    var currency by rememberSaveable(id) { mutableStateOf(existing?.currency ?: "BDT") }
    var category by rememberSaveable(id) { mutableStateOf(existing?.category ?: if(kind=="budget") "All" else "Other") }
    var account by rememberSaveable(id) { mutableStateOf(existing?.account ?: "Cash") }
    var note by rememberSaveable(id) { mutableStateOf(existing?.note ?: prefill) }
    var happened by rememberSaveable(id) { mutableStateOf(existing?.happenedAt ?: Instant.now().toString()) }
    var due by rememberSaveable(id) { mutableStateOf(existing?.dueAt ?: if(kind=="reminder") Instant.now().plusSeconds(86400).toString() else "") }
    var validation by remember { mutableStateOf<String?>(null) }
    val newId=rememberSaveable {UUID.randomUUID().toString()}
    val context=LocalContext.current
    val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    val monetary=kind !in listOf("note","reminder")
    GagaScaffold(title=if(id.isEmpty()) "Add ${labels[kind]}" else "Edit ${labels[kind]}",onBack={nav.popBackStack()}) {padding->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(name,{name=it.take(160)},label={Text(if(kind in listOf("lent","borrowed")) "Person / description" else "Title")},modifier=Modifier.fillMaxWidth())
            if(monetary) {
                OutlinedTextField(amount,{amount=it},label={Text(if(kind=="account") "Opening recorded balance" else "Amount")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Decimal),modifier=Modifier.fillMaxWidth(),enabled=existing?.paidMinor==null || existing.paidMinor==0L)
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {listOf("BDT","USD","CNY").forEach{c->FilterChip(selected=currency==c,onClick={currency=c},label={Text(c)},enabled=existing?.paidMinor==null || existing.paidMinor==0L)}}
                if(kind in listOf("income","expense","budget")) OutlinedTextField(category,{category=it.take(80)},label={Text("Category${if(kind=="budget") " (All for overall budget)" else ""}")},modifier=Modifier.fillMaxWidth())
                if(kind in listOf("income","expense","account")) OutlinedTextField(account,{account=it.take(80)},label={Text("Recorded account (Cash / Bank / bKash…)" )},modifier=Modifier.fillMaxWidth())
                Text("This records an amount. It does not move or hold money.",style=MaterialTheme.typography.bodySmall)
            }
            OutlinedButton(onClick={pickDateTime(context,happened){happened=it}},modifier=Modifier.fillMaxWidth()){Text("Record date: ${date(happened)}")}
            if(kind in listOf("reminder","lent","borrowed","goal")) {
                OutlinedButton(onClick={pickDateTime(context,due.ifBlank{Instant.now().plusSeconds(86400).toString()}){due=it}},modifier=Modifier.fillMaxWidth()){Text(if(due.isBlank()) "Set due date" else "Due: ${date(due)}")}
                if(kind!="reminder" && due.isNotBlank()) TextButton(onClick={due=""}){Text("Remove due date")}
                if(kind=="reminder") Text("Reminder alerts can be delayed by connectivity or Android battery settings. Upcoming reminders remain visible in this app.",style=MaterialTheme.typography.bodySmall)
            }
            OutlinedTextField(note,{note=it.take(4000)},label={Text("Private note")},modifier=Modifier.fillMaxWidth(),minLines=3)
            validation?.let{Text(it,color=MaterialTheme.colorScheme.error)}
            ui.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
            Button(modifier=Modifier.fillMaxWidth(),enabled=!ui.busy,onClick={
                val minor=if(monetary)DailyMoney.parseMinor(amount) else 0L
                validation=when {
                    name.isBlank()->"Enter a title or person."
                    minor==null->"Enter a positive amount with at most two decimal places."
                    category.isBlank() || account.isBlank()->"Category and account cannot be empty."
                    kind=="reminder" && !Instant.parse(due).isAfter(Instant.now())->"Choose a future reminder time."
                    else->null
                }
                if(validation==null) {
                    if(kind=="reminder" && Build.VERSION.SDK_INT>=33 && ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    vm.save(DailyRecord(id=existing?.id ?: newId,ownerId=vm.userId,kind=kind,title=name.trim(),amountMinor=minor ?: 0,paidMinor=existing?.paidMinor ?: 0,currency=currency,category=category.trim(),account=account.trim(),note=note,happenedAt=happened,dueAt=due.takeIf{it.isNotBlank()},completed=existing?.completed ?: false,sourceChat=existing?.sourceChat ?: chat.takeIf{it.isNotBlank()},sourceMessage=existing?.sourceMessage ?: message.takeIf{it.isNotBlank()}),id.isNotEmpty()){nav.popBackStack()}
                }
            }) {Text(if(ui.busy) "Saving…" else "Save record")}
        }
    }
}

private fun pickDateTime(context: android.content.Context,iso: String,onPicked:(String)->Unit) {
    val zoned=Instant.parse(iso).atZone(ZoneId.systemDefault())
    DatePickerDialog(context,{_,year,month,day->TimePickerDialog(context,{_,hour,minute->onPicked(LocalDateTime.of(year,month+1,day,hour,minute).atZone(ZoneId.systemDefault()).toInstant().toString())},zoned.hour,zoned.minute,true).show()},zoned.year,zoned.monthValue-1,zoned.dayOfMonth).show()
}

@Composable
private fun ShoppingScreen(id:String,nav:NavController,vm:DailyLifeViewModel=hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    var adding by remember {mutableStateOf(false)}
    var sharing by remember {mutableStateOf(false)}
    LaunchedEffect(id) {
        while(true) {vm.selectList(id);delay(15000)}
    }
    val list=ui.selectedList
    GagaScaffold(title=list?.title ?: "Shopping list",onBack={nav.popBackStack()},actions={IconButton(onClick={vm.selectList(id)}){Icon(Icons.Default.Refresh,"Refresh")}}) {padding->
        LazyColumn(Modifier.fillMaxSize().padding(padding),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
            item {Status(ui,vm)}
            if(list==null) item {Text("Loading list. If access was removed, return to Shopping Lists.")}
            else {
                item {Text("${ui.items.count{it.purchased}} of ${ui.items.size} purchased",fontWeight=FontWeight.Bold)}
                item {Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){Button(onClick={adding=true}){Text("Add item")};if(list.ownerId==vm.userId)OutlinedButton(onClick={sharing=true}){Text("Manage members")}}}
                items(ui.items,key={it.id}){item->Card{Row(Modifier.fillMaxWidth().padding(12.dp),verticalAlignment=Alignment.CenterVertically){Checkbox(item.purchased,{vm.purchase(item)},enabled=!ui.busy);Column{Text(item.name);Text("Quantity: ${item.quantity}",style=MaterialTheme.typography.bodySmall)}}}}
                if(ui.items.isEmpty()) item{Text("No items yet. Add groceries or other things to buy.")}
                item{Text("Members can view and check off items. Updates refresh while this screen is open.",style=MaterialTheme.typography.bodySmall)}
            }
        }
    }
    if(adding) {
        var name by rememberSaveable{mutableStateOf("")};var quantity by rememberSaveable{mutableStateOf("1")};val itemId=rememberSaveable{UUID.randomUUID().toString()}
        AlertDialog(onDismissRequest={if(!ui.busy)adding=false},title={Text("Add shopping item")},text={Column{OutlinedTextField(name,{name=it.take(160)},label={Text("Item")});OutlinedTextField(quantity,{quantity=it.take(80)},label={Text("Quantity")});ui.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}}},confirmButton={TextButton(onClick={vm.addItem(id,name,quantity,itemId){adding=false}},enabled=!ui.busy&&name.isNotBlank()&&quantity.isNotBlank()){Text("Save")}},dismissButton={TextButton(onClick={adding=false},enabled=!ui.busy){Text("Cancel")}})
    }
    if(sharing) {
        var query by rememberSaveable{mutableStateOf("")};var found by remember{mutableStateOf<List<User>>(emptyList())};var selected by remember{mutableStateOf<User?>(null)}
        LaunchedEffect(query){delay(350);found=if(query.trim().length<3)emptyList() else try{vm.searchUsers(query.trim())}catch(e:CancellationException){throw e}catch(e:Exception){emptyList()}}
        AlertDialog(onDismissRequest={if(!ui.busy)sharing=false},title={Text("Shopping list members")},text={Column(Modifier.heightIn(max=400.dp).verticalScroll(rememberScrollState())){
            Text("Members can see every item in this list. Your Money Book and debts remain private.")
            ui.members.forEach{member->Row(verticalAlignment=Alignment.CenterVertically){Text(member.displayLabel,Modifier.weight(1f));if(member.id!=list?.ownerId)TextButton(onClick={vm.share(id,member,true){}},enabled=!ui.busy){Text("Remove")}}}
            OutlinedTextField(query,{query=it},label={Text("Search GaGa name or ID")})
            found.filter{it.id !in (list?.memberIds ?: emptyList())}.forEach{member->TextButton(onClick={selected=member}){Text("${member.displayLabel} ${member.username?.let{"@$it"}.orEmpty()}")}}
            selected?.let{member->Text("Share this list with ${member.displayLabel}?");Button(onClick={vm.share(id,member,false){selected=null;query=""}},enabled=!ui.busy){Text("Confirm sharing")}}
            ui.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
        }},confirmButton={TextButton(onClick={sharing=false},enabled=!ui.busy){Text("Done")}})
    }
}
