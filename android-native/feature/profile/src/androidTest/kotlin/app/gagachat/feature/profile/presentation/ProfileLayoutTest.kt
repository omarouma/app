package app.gagachat.feature.profile.presentation

import android.graphics.Bitmap
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Share
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import app.gagachat.core.model.AccountPrivacy
import app.gagachat.core.model.User
import app.gagachat.core.ui.theme.GagaTheme
import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ProfileLayoutTest {
    @get:Rule val compose = createComposeRule()

    private fun render(dark: Boolean, scale: Float, name: String) {
        var edits = 0
        var privacyOpens = 0
        compose.setContent {
            GagaTheme(darkTheme = dark, textScale = scale) {
                androidx.compose.material3.Surface {
                Column(Modifier.width(320.dp).verticalScroll(rememberScrollState())) {
                    ProfileHeader(
                        user = User(id = "layout-fixture", displayName = "A very long profile display name for layout validation", username = "long_profile_handle_for_layout", isVerified = true, isPremium = true),
                        isSelf = true, isUploadingCover = false, coverUploadProgress = 0,
                        onPickCoverPhoto = {}, onPickCoverVideo = {}, onOpenCover = { _, _ -> },
                        onOpenAvatar = {}, onEditPhoto = { edits++ },
                    )
                    ProfileActionGroup {
                        ProfileActionButton(Icons.Default.Edit, "Edit Profile", { edits++ }, Modifier.weight(1f), primary = true)
                        ProfileActionButton(Icons.Default.Lock, "Privacy", { privacyOpens++ }, Modifier.weight(1f))
                        ProfileActionButton(Icons.Default.Share, "Share", {}, Modifier.weight(1f))
                    }
                    CompletenessCard(60, AccountPrivacy(), onPrivacy = { privacyOpens++ })
                }
                }
            }
        }
        compose.onNodeWithText("PRO").assertIsDisplayed()
        compose.onNodeWithContentDescription("Change photo").assertIsDisplayed().performClick()
        assertTrue(edits == 1)
        save("$name-header.png")
        compose.onNodeWithText("Edit Profile").performScrollTo().assertIsDisplayed().performClick()
        assertTrue(edits == 2)
        compose.onNodeWithText("Friend list:", substring = true).performScrollTo().assertIsDisplayed().performClick()
        assertTrue(privacyOpens == 1)
        val online = compose.onNodeWithText("Online visibility:", substring = true).fetchSemanticsNode().boundsInRoot
        val friends = compose.onNodeWithText("Friend list:", substring = true).fetchSemanticsNode().boundsInRoot
        assertTrue("Privacy labels must not overlap", friends.left >= online.right || friends.top >= online.bottom)
        save("$name-privacy.png")
    }

    private fun save(name: String) {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.getExternalFilesDir("screenshots"), name)
        file.parentFile?.mkdirs()
        file.outputStream().use { compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it) }
        assertTrue(file.length() > 0)
    }
    @Test fun narrowLight() = render(false, 1f, "profile-light")
    @Test fun narrowLargeTextDark() = render(true, 2f, "profile-dark-large-text")
    @Test fun realCoverImageStaysAboveProfileIdentity() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "profile-cover-layout.png")
        val bitmap = Bitmap.createBitmap(320, 200, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(android.graphics.Color.BLUE)
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        compose.setContent {
            GagaTheme {
                androidx.compose.material3.Surface {
                    Column(Modifier.width(320.dp)) {
                        ProfileHeader(User("fixture", "Visible profile name", coverImage = android.net.Uri.fromFile(file).toString()),
                            false, false, 0, {}, {}, { _, _ -> }, {}, {})
                    }
                }
            }
        }
        val cover = compose.onNodeWithTag("profile-cover").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val name = compose.onNodeWithText("Visible profile name").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        assertTrue("Identity must be below the cover", name.top >= cover.bottom)
        save("profile-real-cover.png")
    }

}
