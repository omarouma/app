package app.gagachat.core.data.repository

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.MessageDigest
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Retains an uncertain transfer's identity across retries and process death. */
@Singleton
class WalletTransferRequestStore @Inject constructor(@ApplicationContext context: Context) {
    private val preferences = context.getSharedPreferences("wallet_transfer_requests", Context.MODE_PRIVATE)

    @Synchronized
    fun keyFor(owner: String, recipient: String, amount: Long, note: String?): String {
        // Length-prefix fields to avoid ambiguous concatenation. Store a digest,
        // never a recipient, amount or note, in the preference key.
        val input = listOf(owner, recipient, amount.toString(), note.orEmpty())
            .joinToString("") { "${it.length}:$it" }
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
        preferences.getString(digest, null)?.let { return it }
        val key = UUID.randomUUID().toString()
        check(preferences.edit().putString(digest, key).commit()) { "Unable to save transfer request. Try again." }
        return key
    }

    @Synchronized
    fun complete(key: String) {
        // Clear only this operation. Other uncertain drafts must keep their keys.
        val editor = preferences.edit()
        preferences.all.filterValues { it == key }.keys.forEach { editor.remove(it) }
        check(editor.commit()) { "Transfer recorded; refresh before sending again." }
    }
}
