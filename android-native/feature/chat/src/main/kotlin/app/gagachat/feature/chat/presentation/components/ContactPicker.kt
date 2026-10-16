package app.gagachat.feature.chat.presentation.components

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Only the one phone row explicitly chosen by the user is read. */
data class PickedContact(val name: String, val phone: String?)

@Composable
fun rememberContactPicker(
    onContactPicked: (PickedContact) -> Unit,
    onError: (String) -> Unit = {},
): () -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val currentPicked by rememberUpdatedState(onContactPicked)
    val currentError by rememberUpdatedState(onError)
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val uri = result.data?.data
        if (result.resultCode == Activity.RESULT_OK && uri != null) {
            scope.launch {
                val contact = withContext(Dispatchers.IO) { resolveContact(context, uri) }
                if (contact == null) currentError("Could not read that contact. Please choose a phone number again.")
                else currentPicked(contact)
            }
        }
    }
    return {
        // ACTION_PICK on the Phone data URI grants access to the selected row.
        // Querying the entire Phone table after PickContact did not have that grant.
        runCatching {
            launcher.launch(Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI))
        }.onFailure { currentError("No contact picker is available on this device.") }
    }
}

private fun resolveContact(context: Context, uri: Uri): PickedContact? = runCatching {
    context.contentResolver.query(uri, arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
        ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, null)?.use { cursor ->
        if (!cursor.moveToFirst()) return@use null
        val phone = cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER))
            ?.trim()?.takeIf { it.isNotEmpty() } ?: return@use null
        val name = cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME))
            ?.takeIf { it.isNotBlank() } ?: phone
        PickedContact(name, phone)
    }
}.getOrNull()
