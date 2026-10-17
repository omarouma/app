package app.gagachat.feature.wallet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.gagachat.core.data.repository.AuthRepository
import app.gagachat.core.model.ExternalWallet
import app.gagachat.core.model.ChainSnapshot
import app.gagachat.core.network.rest.SupabaseRestApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ExternalWalletUi(
 val owner: String? = null, val wallets: List<ExternalWallet> = emptyList(),
 val snapshots: Map<String,ChainSnapshot> = emptyMap(), val busy: Boolean = false,
 val refreshing: Set<String> = emptySet(), val error: String? = null,
 val errors: Map<String,String> = emptyMap(),
)

@HiltViewModel
class ExternalWalletViewModel @Inject constructor(private val api: SupabaseRestApi, private val auth: AuthRepository): ViewModel() {
 private val _state = MutableStateFlow(ExternalWalletUi())
 val state = _state.asStateFlow()
 private var generation = 0L
 init {
  viewModelScope.launch {
   auth.sessionFlow.map { it?.userId }.distinctUntilChanged().collectLatest { me ->
    generation++; _state.value = ExternalWalletUi(owner = me)
    if (me != null) load(me, generation)
   }
  }
 }
 private fun active(me: String, epoch: Long) = auth.sessionFlow.value?.userId == me && generation == epoch
 private suspend fun load(me: String, epoch: Long) {
  _state.update { it.copy(busy=true,error=null) }
  try {
   val rows=api.externalWallets(me)
   if (active(me,epoch)) _state.update { it.copy(wallets=rows.filter { row->row.userId==me },busy=false) }
  } catch(t: Throwable) {
   if(t is CancellationException) throw t
   if(active(me,epoch)) _state.update { it.copy(busy=false,error="Unable to load watched addresses. Retry.") }
  }
 }
 fun reload() { val me=_state.value.owner ?: return; val epoch=generation; viewModelScope.launch { load(me,epoch) } }
 fun add(network: String,address: String,label: String,onAdded:()->Unit) {
  val me=_state.value.owner ?: return; val epoch=generation
  if(_state.value.busy) return
  _state.update { it.copy(busy=true,error=null) }
  viewModelScope.launch {
   try {
    val row=api.addExternalWallet(network,address.trim(),label.trim(),me)
    if(active(me,epoch) && row.userId==me) { load(me,epoch); onAdded() }
   } catch(t: Throwable) {
    if(t is CancellationException) throw t
    if(active(me,epoch)) _state.update { it.copy(busy=false,error="Could not add address. Check the network, address and label (maximum 10 addresses).") }
   }
  }
 }
 fun remove(row: ExternalWallet) {
  val me=_state.value.owner ?: return; val epoch=generation
  if(_state.value.busy) return
  _state.update { it.copy(busy=true,error=null) }
  viewModelScope.launch {
   try {
    api.removeExternalWallet(row.id,me)
    if(active(me,epoch)) _state.update { it.copy(wallets=it.wallets.filterNot { w->w.id==row.id },snapshots=it.snapshots-row.id,errors=it.errors-row.id,busy=false) }
   } catch(t: Throwable) {
    if(t is CancellationException) throw t
    if(active(me,epoch)) _state.update { it.copy(busy=false,error="Unable to remove address. Retry.") }
   }
  }
 }
 fun refresh(row: ExternalWallet) {
  val me=_state.value.owner ?: return; val epoch=generation
  if(row.id in _state.value.refreshing) return
  _state.update { it.copy(refreshing=it.refreshing+row.id,errors=it.errors-row.id) }
  viewModelScope.launch {
   try {
    val result=api.chainSnapshot(row.id,me)
    check(result.id==row.id && result.network==row.network && result.address==row.address)
    if(active(me,epoch) && _state.value.wallets.any { it.id==row.id }) _state.update { it.copy(snapshots=it.snapshots+(row.id to result),refreshing=it.refreshing-row.id) }
   } catch(t: Throwable) {
    if(t is CancellationException) throw t
    if(active(me,epoch)) _state.update { it.copy(refreshing=it.refreshing-row.id,errors=it.errors+(row.id to "Could not refresh. Wait 30 seconds and retry. Any displayed data is from the previous check.")) }
   }
  }
 }
}
