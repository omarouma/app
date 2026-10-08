package app.gagachat.feature.dailylife

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import app.gagachat.core.model.SafetyCheckIn
import app.gagachat.core.model.SafetyContact
import app.gagachat.core.network.rest.SafetyApi
import app.gagachat.core.network.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.inject.Inject

data class SafeUi(
    val contacts: List<SafetyContact> = emptyList(),
    val checkIns: List<SafetyCheckIn> = emptyList(),
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
) {
    val activeCheckIn: SafetyCheckIn?
        get() = checkIns.firstOrNull { it.safetyStatus == app.gagachat.core.model.SafetyStatus.PENDING }
}

/** GaGa Safe (Signature Features 2.3): trusted contacts, timed check-ins and SOS. */
@HiltViewModel
class SafeViewModel @Inject constructor(
    private val api: SafetyApi,
    private val session: SessionStore,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val _state = MutableStateFlow(SafeUi())
    val state = _state.asStateFlow()
    val userId get() = session.userId().orEmpty()

    init { refresh() }

    fun refresh() = viewModelScope.launch {
        _state.update { it.copy(loading = true, error = null) }
        try {
            val contacts = api.contacts()
            val checkIns = api.checkIns()
            _state.update { it.copy(contacts = contacts, checkIns = checkIns, loading = false) }
            // Opportunistically escalate anything that expired while the app was
            // closed. Escalation is owner-only and idempotent server-side.
            checkIns.filter { it.safetyStatus == app.gagachat.core.model.SafetyStatus.PENDING }
                .filter { runCatching { Instant.parse(it.dueAt) }.getOrNull()?.isBefore(Instant.now()) == true }
                .forEach { expired -> runCatching { api.escalate(expired.id) } }
            checkIns.filter { it.safetyStatus == app.gagachat.core.model.SafetyStatus.PENDING }
                .forEach(::schedule)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _state.update { it.copy(loading = false, error = "Could not load your safety settings. Check your connection and try again.") }
        }
    }

    fun addContact(name: String, phone: String, contactId: String?, done: () -> Unit) {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) {
            _state.update { it.copy(error = "Enter a name for this contact.") }
            return
        }
        if (phone.isBlank() && contactId.isNullOrBlank()) {
            _state.update { it.copy(error = "Add a phone number or pick a GaGa contact.") }
            return
        }
        mutate {
            val contact = SafetyContact(
                id = UUID.randomUUID().toString(),
                ownerId = userId,
                name = trimmed.take(120),
                phone = phone.trim().take(32),
                contactId = contactId,
                priority = _state.value.contacts.size,
            )
            val saved = api.addContact(contact)
            _state.update { it.copy(contacts = (it.contacts.filterNot { c -> c.id == saved.id } + saved).sortedBy { c -> c.priority }) }
            done()
        }
    }

    fun removeContact(contact: SafetyContact) = mutate {
        api.removeContact(contact.id)
        _state.update { it.copy(contacts = it.contacts.filterNot { c -> c.id == contact.id }) }
    }

    fun createCheckIn(label: String, minutes: Int, done: () -> Unit) {
        val trimmed = label.trim().ifBlank { "Safe check-in" }
        if (minutes !in 5..1440) {
            _state.update { it.copy(error = "Choose a check-in window between 5 minutes and 24 hours.") }
            return
        }
        mutate {
            val checkIn = SafetyCheckIn(
                id = UUID.randomUUID().toString(),
                ownerId = userId,
                label = trimmed.take(160),
                dueAt = Instant.now().plusSeconds(minutes * 60L).toString(),
            )
            val saved = api.createCheckIn(checkIn)
            _state.update { it.copy(checkIns = listOf(saved) + it.checkIns.filterNot { c -> c.id == saved.id }) }
            schedule(saved)
            done()
        }
    }

    /** "I reached safely" / cancel a pending check-in. */
    fun resolve(checkIn: SafetyCheckIn, status: String) = mutate {
        api.resolve(checkIn.id, status)
        WorkManager.getInstance(context).cancelUniqueWork("safe-${checkIn.ownerId}-${checkIn.id}")
        val refreshed = api.checkIns()
        _state.update { it.copy(checkIns = refreshed, notice = if (status == "safe") "Marked as safe." else "Check-in cancelled.") }
    }

    /** Raise an immediate SOS: a check-in due now, escalated straight away. */
    fun raiseSos(done: () -> Unit) = mutate {
        val checkIn = SafetyCheckIn(
            id = UUID.randomUUID().toString(),
            ownerId = userId,
            label = "SOS",
            dueAt = Instant.now().toString(),
        )
        val saved = api.createCheckIn(checkIn)
        api.escalate(saved.id)
        val refreshed = api.checkIns()
        _state.update { it.copy(checkIns = refreshed, notice = "SOS raised. Your safety contacts have been alerted.") }
        done()
    }

    fun clearMessages() { _state.update { it.copy(error = null, notice = null) } }

    private fun mutate(block: suspend () -> Unit) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(error = "Could not save this change. Check your connection and try again.") }
            } finally {
                _state.update { it.copy(busy = false) }
            }
        }
    }

    private fun schedule(checkIn: SafetyCheckIn) {
        val manager = WorkManager.getInstance(context)
        val name = "safe-${checkIn.ownerId}-${checkIn.id}"
        val due = runCatching { Instant.parse(checkIn.dueAt).toEpochMilli() }.getOrNull() ?: return
        val request = OneTimeWorkRequestBuilder<SafetyCheckInWorker>()
            .setInitialDelay((due - System.currentTimeMillis()).coerceAtLeast(0), TimeUnit.MILLISECONDS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInputData(workDataOf("checkin" to checkIn.id, "owner" to checkIn.ownerId))
            .build()
        manager.enqueueUniqueWork(name, ExistingWorkPolicy.REPLACE, request)
    }
}
