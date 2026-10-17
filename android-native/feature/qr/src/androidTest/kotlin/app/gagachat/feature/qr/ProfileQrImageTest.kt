package app.gagachat.feature.qr

import android.net.Uri
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.Assert.assertEquals
import java.io.File

class ProfileQrImageTest {
    @Test fun savedPngCanBeScannedBackIntoTheSameProfile() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "qr-roundtrip.png")
        val payload = QrPayload.encodeUser("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        try {
            file.outputStream().use { ProfileQrImage.write(payload, it) }
            assertEquals(payload, QrImageDecoder.decode(context, Uri.fromFile(file)))
        } finally { file.delete() }
    }
}
