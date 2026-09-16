package app.gagachat.mobile.ui

import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.R
import app.gagachat.mobile.model.Me
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.prefs.SessionStore
import app.gagachat.mobile.ui.Ui.button
import app.gagachat.mobile.ui.Ui.dp
import app.gagachat.mobile.ui.Ui.input
import app.gagachat.mobile.ui.Ui.space
import app.gagachat.mobile.ui.Ui.text
import app.gagachat.mobile.ui.Ui.title
import app.gagachat.mobile.ui.Ui.vertical
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File

/**
 * Profile editor: avatar (upload via /upload), display name, bio.
 * Saves with PUT /users/me and refreshes the cached Me model.
 */
class ProfileActivity : AppCompatActivity() {

    private lateinit var content: LinearLayout
    private var avatar: AvatarView? = null
    private var nameField: android.widget.EditText? = null
    private var bioField: android.widget.EditText? = null
    private var usernameView: TextView? = null
    private var saveBtn: android.view.View? = null
    private var me: Me? = null
    private var uploadedAvatarUrl: String? = null

    private val pickAvatar = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let { uploadAvatar(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        loadMe()
    }

    private fun buildUi() {
        val scroll = ScrollView(this)
        content = vertical(this, 0)
        content.setPadding(dp(this, 20), dp(this, 24), dp(this, 20), dp(this, 32))
        scroll.addView(content)
        setContentView(scroll)

        content.addView(title(this, getString(R.string.edit_profile)))
        content.addView(Ui.subtitle(this, getString(R.string.profile_subtitle)))
        content.addView(space(this, 20))

        // avatar
        val avWrap = vertical(this, 0)
        avWrap.gravity = Gravity.CENTER
        avatar = AvatarView(this)
        avatar!!.bind("?", null, 96)
        avWrap.addView(avatar, LinearLayout.LayoutParams(dp(this, 96), dp(this, 96)))
        val changeAv = button(this, getString(R.string.change_photo), filled = false) { pickAvatar.launch("image/*") }
        val capLp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        capLp.topMargin = dp(this, 10)
        avWrap.addView(changeAv, capLp)
        content.addView(avWrap)
        content.addView(space(this, 20))

        // username (read-only)
        usernameView = Ui.subtitle(this, "@")
        usernameView!!.gravity = Gravity.CENTER
        content.addView(usernameView)
        content.addView(space(this, 16))

        // display name
        content.addView(text(this, getString(R.string.name_hint), 12f, bold = true))
        nameField = input(this, getString(R.string.name_hint))
        content.addView(nameField)
        content.addView(space(this, 12))

        // bio
        content.addView(text(this, getString(R.string.bio_hint), 12f, bold = true))
        bioField = input(this, getString(R.string.bio_hint))
        bioField!!.setSingleLine(false)
        bioField!!.minLines = 3
        bioField!!.gravity = Gravity.TOP or Gravity.START
        bioField!!.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        content.addView(bioField)
        content.addView(space(this, 20))

        // save
        saveBtn = button(this, getString(R.string.save)) { save() }
        content.addView(saveBtn)
    }

    private fun loadMe() {
        lifecycleScope.launch {
            try {
                val j = Api.get("/users/me")
                me = Me.fromJson(j)
                render(me)
            } catch (e: Exception) {
                toast(getString(R.string.err_network))
            }
        }
    }

    private fun render(m: Me?) {
        if (m == null) return
        avatar?.bind(m.displayName.ifEmpty { "?" }, uploadedAvatarUrl ?: m.avatarUrl, 96)
        nameField?.setText(m.displayName)
        bioField?.setText(m.bio ?: "")
        usernameView?.text = "@${m.username}"
    }

    private fun uploadAvatar(uri: Uri) {
        lifecycleScope.launch {
            saveBtn?.isEnabled = false
            toast(getString(R.string.uploading))
            try {
                val file = withContext(Dispatchers.IO) { copyToCache(uri) }
                val res = Api.uploadFile(file, "image/jpeg", "avatar")
                uploadedAvatarUrl = res.optString("url")
                avatar?.bind(me?.displayName ?: "?", uploadedAvatarUrl, 96)
                toast(getString(R.string.uploaded))
            } catch (e: Exception) {
                toast(getString(R.string.err_upload_failed))
            } finally {
                saveBtn?.isEnabled = true
            }
        }
    }

    private fun save() {
        val name = nameField?.text?.toString()?.trim() ?: ""
        if (name.isEmpty()) {
            toast(getString(R.string.err_name_required))
            return
        }
        val body = JSONObject()
            .put("display_name", name)
            .put("bio", bioField?.text?.toString()?.trim() ?: "")
        if (uploadedAvatarUrl != null) body.put("avatar_url", uploadedAvatarUrl)
        lifecycleScope.launch {
            saveBtn?.isEnabled = false
            try {
                Api.put("/users/me", body)
                // refresh cache
                runCatching {
                    val j = Api.get("/users/me")
                    val updated = Me.fromJson(j)
                    SessionStore.save(this@ProfileActivity, SessionStore.token, SessionStore.refreshToken, j.toString())
                    render(updated)
                }
                toast(getString(R.string.profile_saved))
                setResult(RESULT_OK)
            } catch (e: Exception) {
                toast(getString(R.string.err_network))
            } finally {
                saveBtn?.isEnabled = true
            }
        }
    }

    private fun copyToCache(uri: Uri): File {
        val dir = cacheDir
        val f = File(dir, "avatar_${System.currentTimeMillis()}.jpg")
        contentResolver.openInputStream(uri)?.use { input ->
            f.outputStream().use { output -> input.copyTo(output) }
        } ?: throw IllegalStateException("cannot read image")
        return f
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
}
