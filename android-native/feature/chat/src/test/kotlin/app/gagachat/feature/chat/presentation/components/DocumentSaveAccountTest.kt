package app.gagachat.feature.chat.presentation.components

import android.content.Context
import android.net.Uri
import app.gagachat.core.model.Message
import app.gagachat.core.network.session.SessionStore
import app.gagachat.core.network.storage.MediaUrlResolver
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertTrue
import org.junit.Test

class DocumentSaveAccountTest {
    @Test fun accountSwitchWhileSystemDestinationPickerIsOpenCancelsPrivateSave() = runTest {
        var owner = "alice"
        val sessions = mockk<SessionStore> { every { userId() } answers { owner } }
        val resolver = mockk<MediaUrlResolver>()
        val saver = DocumentSaver(mockk<Context>(), resolver, this, sessions)
        saver.launchCreate = { }
        saver.save(Message("local", "client", conversationId = "private", senderId = "sender", text = "file.pdf"))
        owner = "bob"
        saver.onTargetChosen(mockk<Uri>())
        assertTrue(saver.state is DocumentSaveState.Error)
        coVerify(exactly = 0) { resolver.resolve(any()) }
    }
}
