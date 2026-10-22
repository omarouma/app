package app.gagachat.core.data.repository

import android.content.Context
import android.content.SharedPreferences
import io.mockk.*
import org.junit.Assert.*
import org.junit.Test

class WalletTransferRequestStoreTest {
    @Test fun reconstructedStoreReusesUncertainRequestButCompletedSendGetsNewKey() {
        val values = mutableMapOf<String, String>()
        val context = mockk<Context>()
        val prefs = mockk<SharedPreferences>()
        val editor = mockk<SharedPreferences.Editor>()
        every { context.getSharedPreferences(any(), any()) } returns prefs
        every { prefs.getString(any(), null) } answers { values[firstArg()] }
        every { prefs.all } answers { values.toMap() }
        every { prefs.edit() } returns editor
        every { editor.putString(any(), any()) } answers {
            values[firstArg()] = secondArg<String>(); editor
        }
        every { editor.remove(any()) } answers { values.remove(firstArg<String>()); editor }
        every { editor.commit() } returns true
        val first = WalletTransferRequestStore(context).keyFor("alice", "bob", 10, "lunch")
        val reconstructed = WalletTransferRequestStore(context)
        assertEquals(first, reconstructed.keyFor("alice", "bob", 10, "lunch"))
        val other = reconstructed.keyFor("alice", "charlie", 10, "lunch")
        assertNotEquals(first, other)
        reconstructed.complete(first)
        assertNotEquals(first, reconstructed.keyFor("alice", "bob", 10, "lunch"))
        assertEquals(other, reconstructed.keyFor("alice", "charlie", 10, "lunch"))
    }
}
