package app.gagachat.feature.dailylife

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.*
import app.gagachat.core.model.*
import app.gagachat.core.network.rest.DailyLifeApi
import app.gagachat.core.network.rest.SupabaseRestApi
import app.gagachat.core.network.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.inject.Inject

data class DailyUi(
    val records: List<DailyRecord> = emptyList(),
    val lists: List<ShoppingList> = emptyList(),
    val items: List<ShoppingItem> = emptyList(),
    val members: List<User> = emptyList(),
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    val selectedList: ShoppingList? = null,
    val listLoading: Boolean = false,
)

@HiltViewModel
class DailyLifeViewModel @Inject constructor(
    private val api: DailyLifeApi,
    private val profiles: SupabaseRestApi,
    private val session: SessionStore,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val _state = MutableStateFlow(DailyUi())
    val state = _state.asStateFlow()
    val userId get() = session.userId().orEmpty()
    private var listJob: Job? = null
    init { refresh() }

    fun refresh() = viewModelScope.launch {
        _state.update { it.copy(loading = true, error = null) }
        try {
            val records = api.records()
            val lists = api.lists()
            _state.update { it.copy(records = records, lists = lists, loading = false) }
            records.filter { it.kind in listOf("task", "reminder") }.forEach(::schedule)
            _state.value.selectedList?.let { selectList(it.id) }
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { _state.update { it.copy(loading = false, error = "Could not load your records. Check your connection and try again.") } }
    }

    // UI stays open on failure and retains entered values; success callback only after server ACK.
    fun save(record: DailyRecord, editing: Boolean, done: () -> Unit) = mutate {
        val saved = api.save(record, editing)
        _state.update { it.copy(records = (it.records.filterNot { r -> r.id == saved.id } + saved).sortedByDescending { r -> r.happenedAt }) }
        if (saved.kind in listOf("task", "reminder")) schedule(saved)
        done()
    }

    fun remove(record: DailyRecord, done: () -> Unit) = mutate {
        api.remove(record.id)
        WorkManager.getInstance(context).cancelUniqueWork("daily-${record.ownerId}-${record.id}")
        _state.update { it.copy(records = it.records.filterNot { r -> r.id == record.id }) }
        done()
    }

    fun complete(record: DailyRecord) = save(record.copy(completed = !record.completed), true) {}

    fun contribute(record: DailyRecord, text: String, operationId: String, done: () -> Unit) {
        val amount = DailyMoney.parseMinor(text)
        if (amount == null || amount > record.amountMinor - record.paidMinor) {
            _state.update { it.copy(error = "Enter a positive amount within the remaining balance, with at most two decimals.") }; return
        }
        mutate {
            api.contribute(record.id, amount, operationId)
            val saved = requireNotNull(api.record(record.id))
            _state.update { it.copy(records = it.records.map { r -> if (r.id == saved.id) saved else r }) }
            done()
        }
    }

    fun createList(title: String, id: String, done: () -> Unit) = mutate {
        require(title.trim().isNotEmpty())
        val list = api.createList(id, title.trim().take(160))
        _state.update { it.copy(lists = listOf(list) + it.lists.filterNot { l -> l.id == id }) }
        done()
    }

    fun selectList(id: String): Job {
        listJob?.cancel()
        return viewModelScope.launch {
        _state.update { it.copy(listLoading = true) }
        try {
            val list = api.lists().firstOrNull { it.id == id }
            if (list != null) {
                val items = api.items(id)
                val members = try { profiles.getUsers(listOf(list.ownerId) + list.memberIds).map {
                    User(id = it.id, displayName = it.displayName.orEmpty(), username = it.username)
                } } catch (e: CancellationException) { throw e } catch (e: Exception) { emptyList() }
                _state.update { it.copy(selectedList = list, items = items, members = members, listLoading = false) }
            } else _state.update { it.copy(selectedList = null, items = emptyList(), members = emptyList(), listLoading = false) }
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { _state.update { it.copy(listLoading = false, error = "Could not open the shopping list. Try refreshing.") } }
        }.also { listJob = it }
    }

    fun renameList(id: String, title: String, done: () -> Unit) = mutate {
        require(title.trim().isNotEmpty())
        api.renameList(id, title.trim().take(160))
        selectList(id); done()
    }

    fun removeList(id: String, done: () -> Unit) = mutate {
        api.removeList(id)
        _state.update { it.copy(lists = it.lists.filterNot { list -> list.id == id }, selectedList = null, items = emptyList()) }
        done()
    }

    fun editItem(item: ShoppingItem, name: String, quantity: String, done: () -> Unit) = mutate {
        require(name.trim().isNotEmpty() && quantity.trim().isNotEmpty())
        api.editItem(item, name.trim().take(160), quantity.trim().take(80))
        val items = api.items(item.listId)
        _state.update { it.copy(items = items) }; done()
    }

    fun removeItem(item: ShoppingItem, done: () -> Unit) = mutate {
        api.removeItem(item)
        _state.update { it.copy(items = it.items.filterNot { row -> row.id == item.id }) }; done()
    }

    fun addItem(listId: String, name: String, quantity: String, id: String, done: () -> Unit) = mutate {
        api.addItem(id, listId, name.trim().take(160), quantity.trim().take(80))
        val items = api.items(listId)
        _state.update { it.copy(items = items) }; done()
    }

    fun purchase(item: ShoppingItem) = mutate {
        api.purchase(item)
        val items = api.items(item.listId)
        _state.update { it.copy(items = items) }
    }

    fun share(listId: String, member: User, remove: Boolean, done: () -> Unit) = mutate {
        api.share(listId, member.id, remove)
        selectList(listId); done()
    }

    suspend fun searchUsers(query: String): List<User> = profiles.searchUsers(query).map {
        User(id = it.id, displayName = it.displayName.orEmpty(), username = it.username)
    }.filter { it.id != userId }

    fun clearError() { _state.update { it.copy(error = null) } }

    private fun mutate(block: suspend () -> Unit) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try { block() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { _state.update { it.copy(error = "Could not save this change. Check your connection, permissions and entered amount, then retry.") } }
            finally { _state.update { it.copy(busy = false) } }
        }
    }

    private fun schedule(record: DailyRecord) {
        val manager = WorkManager.getInstance(context)
        val name = "daily-${record.ownerId}-${record.id}"
        val due = record.dueAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
        if (record.completed || due == null || context.getSharedPreferences("daily_reminder_delivery", Context.MODE_PRIVATE).getString("${record.ownerId}-${record.id}", null) == record.dueAt) {
            manager.cancelUniqueWork(name); return
        }
        val request = OneTimeWorkRequestBuilder<DailyReminderWorker>()
            .setInitialDelay((due - System.currentTimeMillis()).coerceAtLeast(0), TimeUnit.MILLISECONDS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInputData(workDataOf("record" to record.id, "owner" to record.ownerId))
            .build()
        manager.enqueueUniqueWork(name, ExistingWorkPolicy.REPLACE, request)
    }
}
