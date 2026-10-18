package app.gagachat.feature.wallet

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.gagachat.core.model.*
import app.gagachat.core.ui.component.GagaScaffold
import app.gagachat.core.ui.component.GagaQrCode

@Composable
fun ExternalWalletScreen(onBack:()->Unit, viewModel:ExternalWalletViewModel=hiltViewModel()) {
 val state by viewModel.state.collectAsStateWithLifecycle()
 var adding by remember { mutableStateOf(false) }
 var selected by remember { mutableStateOf<ExternalWallet?>(null) }
 var removing by remember { mutableStateOf<ExternalWallet?>(null) }
 var transfer by remember { mutableStateOf<ExternalWallet?>(null) }
 var notice by remember { mutableStateOf<String?>(null) }
 val clipboard=LocalClipboardManager.current
 val links=LocalUriHandler.current
 LaunchedEffect(state.owner) { adding=false;selected=null;removing=null;transfer=null;notice=null }
 GagaScaffold(title="Connected wallets",subtitle="Watch-only · Your addresses",compactHeader=true,onBack=onBack) { padding->
  LazyColumn(Modifier.fillMaxSize().padding(padding),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
   item {
    Text("Track your wallet",style=MaterialTheme.typography.headlineSmall)
    Text("Save a public address to view on-chain assets. This does not verify ownership or connect your Binance exchange account. No keys or spending permissions are requested.",style=MaterialTheme.typography.bodySmall)
    Text("Balance checks share the address with the selected network's public data provider. These assets remain separate from GaGa Coins.",style=MaterialTheme.typography.bodySmall,modifier=Modifier.padding(top=8.dp))
    Button(onClick={adding=true},enabled=state.owner!=null && !state.busy) { Text("Add my wallet address") }
    if(state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
    state.error?.let { Text(it,color=MaterialTheme.colorScheme.error); TextButton(onClick=viewModel::reload){Text("Retry")} }
    notice?.let { Text(it,color=MaterialTheme.colorScheme.error) }
   }
   if(!state.busy && state.wallets.isEmpty()) item { Text("No addresses saved. Choose a network before adding an address.") }
   items(state.wallets,key={it.id}) { row->
    val data=state.snapshots[row.id]
    Surface(shape=MaterialTheme.shapes.large,color=MaterialTheme.colorScheme.surfaceContainerLow) {
     Column(Modifier.fillMaxWidth().padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
      Text(row.label,style=MaterialTheme.typography.titleMedium)
      Text(WalletNetworks.labels[row.network].orEmpty()+" · Ownership unverified",style=MaterialTheme.typography.labelMedium)
      Text(row.address,style=MaterialTheme.typography.bodySmall)
      if(data==null) Text("Balance not checked",style=MaterialTheme.typography.bodySmall)
      data?.let { snapshot->
       if(row.network=="bitcoin") Text("Confirmed on-chain balance",style=MaterialTheme.typography.labelSmall)
       snapshot.assets.forEach { asset->
        Text("${asset.amount} ${asset.symbol}",style=MaterialTheme.typography.titleMedium)
        if(asset.contract!=null) Text(asset.name,style=MaterialTheme.typography.bodySmall)
       }
       if(snapshot.status=="provider_not_connected") Text("TON balance provider not connected")
       if(snapshot.unavailableAssets.isNotEmpty()) Text("Unavailable: ${snapshot.unavailableAssets.joinToString()}")
       Text("Checked: ${snapshot.checkedAt}",style=MaterialTheme.typography.labelSmall)
       when(snapshot.historyStatus) {
        "recent_25" -> {
         Text("Recent Bitcoin transactions (up to 25)")
         if(snapshot.history.isEmpty()) Text("No recent transactions returned")
         snapshot.history.forEach { tx->
          TextButton(onClick={runCatching{links.openUri("https://mempool.space/tx/${tx.id}")}.onFailure{notice="Unable to open explorer"}}) {
           Text("${tx.id.take(12)}… · ${if(tx.confirmed) "Confirmed" else "Pending"}")
          }
         }
        }
        "explorer_required" -> Text("Full transaction history is available in the network explorer.",style=MaterialTheme.typography.bodySmall)
        else -> Text("Transaction history unavailable",style=MaterialTheme.typography.bodySmall)
       }
      }
      state.errors[row.id]?.let { Text(it,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall) }
      Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
       TextButton(onClick={viewModel.refresh(row)},enabled=row.id !in state.refreshing) { Text(if(row.id in state.refreshing) "Checking…" else "Check balance") }
       TextButton(onClick={selected=row}) { Text("Address / QR") }
      }
      Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
       TextButton(onClick={WalletNetworks.explorer(row.network,row.address)?.let { url->runCatching{links.openUri(url)}.onFailure{notice="Unable to open explorer"} }}){Text("Explorer")}
       if(row.network!="ton") TextButton(onClick={transfer=row}) { Text("Prepare transfer") }
       TextButton(onClick={removing=row},enabled=!state.busy){Text("Remove")}
      }
     }
    }
   }
  }
 }
 if(adding) AddAddressDialog(state.busy,state.error,onDismiss={adding=false}) { network,address,label->viewModel.add(network,address,label){adding=false} }
 selected?.let { row->
  AlertDialog(onDismissRequest={selected=null},title={Text(WalletNetworks.labels[row.network].orEmpty())},text={
   Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(12.dp)) {
    Text("Watch-only address · Ownership unverified")
    GagaQrCode(content=row.address,size=200.dp)
    Text(row.address,style=MaterialTheme.typography.bodySmall)
    Text("Verify this address in your own wallet before sharing it for payment. Only use ${WalletNetworks.labels[row.network]} assets. This is not a GaGa custodial deposit address.",style=MaterialTheme.typography.bodySmall)
   }
  },confirmButton={TextButton(onClick={clipboard.setText(AnnotatedString(row.address));selected=null}){Text("Copy address")}},dismissButton={TextButton(onClick={selected=null}){Text("Close")}})
 }
 removing?.let { row->AlertDialog(onDismissRequest={removing=null},title={Text("Remove watched address?")},text={Text("This removes it from GaGa. On-chain funds and your external wallet are unaffected.")},confirmButton={TextButton(onClick={viewModel.remove(row);removing=null}){Text("Remove")}},dismissButton={TextButton(onClick={removing=null}){Text("Cancel")}}) }
 transfer?.let { row->TransferRequestDialog(row.network,onDismiss={transfer=null}) }
}

@Composable
private fun AddAddressDialog(busy:Boolean,error:String?,onDismiss:()->Unit,onAdd:(String,String,String)->Unit) {
 var network by remember{mutableStateOf("bsc")};var address by remember{mutableStateOf("")};var label by remember{mutableStateOf("My wallet")}
 AlertDialog(onDismissRequest={if(!busy)onDismiss()},title={Text("Add a watch address")},text={
  Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(8.dp)) {
   Text("Select the exact network shown in your wallet's Receive screen. Public address only.")
   WalletNetworks.labels.forEach { (key,title)->Row{RadioButton(selected=network==key,onClick={network=key});TextButton(onClick={network=key}){Text(title)}} }
   OutlinedTextField(value=label,onValueChange={label=it.take(40)},label={Text("Label")},singleLine=true)
   OutlinedTextField(value=address,onValueChange={address=it.take(100)},label={Text("Public receiving address")})
   error?.let { Text(it,color=MaterialTheme.colorScheme.error) }
   Text("GaGa will not ask for a seed phrase or private key. Check balance sends this address to a public network provider.",style=MaterialTheme.typography.bodySmall)
  }
 },confirmButton={TextButton(onClick={onAdd(network,address,label)},enabled=!busy && label.isNotBlank() && address.isNotBlank()){Text(if(busy)"Saving…" else "Save address")}},dismissButton={TextButton(onClick=onDismiss,enabled=!busy){Text("Cancel")}})
}

@Composable
internal fun TransferRequestDialog(network:String,onDismiss:()->Unit) {
 var recipient by remember{mutableStateOf("")};var amount by remember{mutableStateOf("")};var draft by remember{mutableStateOf<WalletTransferDraft?>(null)};var error by remember{mutableStateOf<String?>(null)}
 val links=LocalUriHandler.current
 val symbol=when(network){"bsc"->"BNB";"bitcoin"->"BTC";else->"ETH"}
 AlertDialog(onDismissRequest=onDismiss,title={Text(if(draft==null)"Prepare $symbol transfer" else "Review wallet request")},text={
  Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(8.dp)) {
   Text("Network: ${WalletNetworks.labels[network]}")
   if(draft==null) {
    OutlinedTextField(value=recipient,onValueChange={recipient=it.take(100)},label={Text("Recipient address")})
    OutlinedTextField(value=amount,onValueChange={amount=it.take(40)},label={Text("Amount ($symbol)")},singleLine=true)
    Text("Native $symbol only. Token transfers and direct signing sessions are not connected.",style=MaterialTheme.typography.bodySmall)
   } else {
    Text("${draft!!.amount} $symbol");Text("To: ${draft!!.recipient}")
    Text("Your external wallet must verify the recipient, network, sending account, fee and total before you authorize. Opening it does not mean a transaction was sent.")
   }
   error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
  }
 },confirmButton={TextButton(onClick={
  if(draft==null) { runCatching { WalletTransferDraft(network,recipient.trim(),amount.trim()).also{it.uri()} }.onSuccess{draft=it;error=null}.onFailure{error=it.message?:"Invalid transfer"} }
  else { runCatching { links.openUri(draft!!.uri()) }.onSuccess{onDismiss()}.onFailure{error="No compatible wallet opened. Use your wallet app directly; nothing was sent by GaGa."} }
 }){Text(if(draft==null)"Review" else "Open external wallet")}},dismissButton={TextButton(onClick=onDismiss){Text("Cancel")}})
}
