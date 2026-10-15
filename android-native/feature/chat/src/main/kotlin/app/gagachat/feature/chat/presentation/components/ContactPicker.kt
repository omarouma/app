package app.gagachat.feature.chat.presentation.components

import android.content.Context
import android.net.Uri
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * A single contact the user picked from the system address book.
 */
data class PickedContact(
    val name: String,
    val phone: String?,
)

/**
 * Wraps the platform contact picker ([ActivityResultContracts.PickContact]) so
 * the chat composer can attach a contact card without requesting the
 * READ_CONTACTS permission — the picker returns a single content Uri that we
 * resolve for the display name and primary phone number.
 *
 * @return a lambda to launch the picker; call it from the "Contact" attach option.
 */
@Composable
fun rememberContactPicker(
    onContactPicked: (PickedContact) -> Unit,
): () -> Unit {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickContact(),
    ) { uri: Uri? ->
        if (uri != null) {
            resolveContact(context, uri)?.let(onContactPicked)
        }
    }
    return remember(launcher) { { launcher.launch(null) } }
}

/**
 * Reads the display name and first phone number for a contact Uri returned by
 * the platform picker. Returns null when the row can't be read.
 */
private fun resolveContact(context: Context, uri: Uri): PickedContact? = runCatching {
    var name: String? = null
    var phone: String? = null
    var contactId: String? = null

    // Display name is available straight from the picked contact row.
    context.contentResolver.query(
        uri,
        arrayOf(ContactsContract.Contacts.DISPLAY_NAME, ContactsContract.Contacts._ID),
        null,
        null,
        null,
    )?.use { cursor ->
        if (cursor.moveToFirst()) {
            val idx = cursor.getColumnIndex(ContactsContract.Contacts.DISPLAY_NAME)
            if (idx >= 0) name = cursor.getString(idx)
            val idIndex = cursor.getColumnIndex(ContactsContract.Contacts._ID)
            if (idIndex >= 0) contactId = cursor.getString(idIndex)
        }
    }

    // A picked Contacts URI's lastPathSegment is usually a row ID, not a
    // LOOKUP_KEY. Resolve the actual _ID returned by the contact query.
    // Some Android providers give only scoped access to the selected contact,
    // not Phone.CONTENT_URI; handle this gracefully and send name-only.
    contactId?.let { id ->
        runCatching {
            context.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID + " = ?",
                arrayOf(id),
                null,
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                    if (idx >= 0) phone = cursor.getString(idx)
                }
            }
        }
    }

    val resolvedName = name?.takeIf { it.isNotBlank() } ?: phone ?: return null
    PickedContact(name = resolvedName, phone = phone)
}.getOrNull()
