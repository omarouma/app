package app.gagachat.mobile.ui

import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
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
import app.gagachat.mobile.ui.Ui.dp
import app.gagachat.mobile.ui.Ui.input
import app.gagachat.mobile.ui.Ui.space
import app.gagachat.mobile.ui.Ui.text
import app.gagachat.mobile.ui.Ui.vertical
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File

/**
 * Profile editor, restyled to the LINE design language: a teal gradient banner
 * with a wave silhouette carrying the avatar + name, followed by grouped list
 * rows for display name, status message and profile icon/cover.
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
        val root = vertical(this, 0)
        root.setBackgroundColor(Ui.lineBg(this))
        root.addView(Ui.topBar(this, getString(R.string.edit_profile), onBack = { finish() }))

        val scroll = ScrollView(this)
        content = vertical(this, 0)
        content.setPadding(0, 0, 0, dp(this, 32))
        scroll.addView(content)
        root.addView(scroll, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        // ---------------- teal gradient banner ----------------
        val banner = FrameLayout(this)
        banner.background = GradientBanner.banner(this)
        val bannerInner = vertical(this, 0)
        bannerInner.gravity = Gravity.CENTER_HORIZONTAL
        bannerInner.setPadding(dp(this, 20), dp(this, 28), dp(this, 20), dp(this, 28))

        avatar = AvatarView(this)
        avatar!!.bind("?", null, 96)
        bannerInner.addView(avatar, LinearLayout.LayoutParams(dp(this, 96), dp(this, 96)))

        val nameView = text(this, "", 20f, bold = true, color = android.graphics.Color.WHITE)
        nameView.gravity = Gravity.CENTER
        val nlp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        nlp.topMargin = dp(this, 12)
        bannerInner.addView(nameView, nlp)

        usernameView = text(this, "@", 13f, color = android.graphics.Color.argb(220, 255, 255, 255))
        usernameView!!.gravity = Gravity.CENTER
        bannerInner.addView(usernameView)

        val changeAv = Ui.greenButton(this, getString(R.string.change_photo)) { pickAvatar.launch("image/*") }
        val capLp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        capLp.topMargin = dp(this, 14)
        bannerInner.addView(changeAv, capLp)

        banner.addView(bannerInner, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        content.addView(banner, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        // ---------------- display name ----------------
        content.addView(Ui.sectionHeader(this, getString(R.string.personal_info)))
        val g1 = Ui.listGroup(this)
        val nameWrap = vertical(this, 0)
        nameWrap.setPadding(dp(this, 16), dp(this, 12), dp(this, 16), dp(this, 14))
        nameWrap.addView(text(this, getString(R.string.display_name), 16f, color = Ui.lineText(this)))
        nameField = input(this, getString(R.string.name_hint))
        val nflp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        nflp.topMargin = dp(this, 8)
        nameWrap.addView(nameField, nflp)
        g1.addView(nameWrap)
        g1.addView(Ui.divider(this, 16))

        // ---------------- status message ----------------
        val bioWrap = vertical(this, 0)
        bioWrap.setPadding(dp(this, 16), dp(this, 12), dp(this, 16), dp(this, 14))
        bioWrap.addView(text(this, getString(R.string.status_message), 16f, color = Ui.lineText(this)))
        bioField = input(this, getString(R.string.status_message_hint))
        bioField!!.setSingleLine(false)
        bioField!!.minLines = 2
        bioField!!.gravity = Gravity.TOP or Gravity.START
        bioField!!.inputType = InputType.TYPE_CLASS_TEXT or
            InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        val bflp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        bflp.topMargin = dp(this, 8)
        bioWrap.addView(bioField, bflp)
        g1.addView(bioWrap)
        content.addView(g1)

        // ---------------- profile icon & cover ----------------
        content.addView(Ui.sectionHeader(this, getString(R.string.set_profile_icon_cover)))
        val g2 = Ui.listGroup(this)
        g2.addView(Ui.listRow(this, getString(R.string.profile_icon),
            iconRes = R.drawable.ic_photo, chevron = true) { pickAvatar.launch("image/*") })
        g2.addView(Ui.divider(this, 54))
        g2.addView(Ui.listRow(this, getString(R.string.profile_cover),
            iconRes = R.drawable.ic_photo, chevron = true) { pickAvatar.launch("image/*") })
        g2.addView(Ui.divider(this, 54))
        g2.addView(Ui.listRow(this, getString(R.string.decorate),
            iconRes = R.drawable.ic_theme, chevron = true) { toast(getString(R.string.not_set)) })
        g2.addView(Ui.divider(this, 54))
        g2.addView(Ui.listRow(this, getString(R.string.keep_memo),
            iconRes = R.drawable.ic_memo, chevron = true) { toast(getString(R.string.not_set)) })
        content.addView(g2)

        // ---------------- save ----------------
        saveBtn = Ui.greenButton(this, getString(R.string.save)) { save() }
        val slp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        slp.leftMargin = dp(this, 16); slp.rightMargin = dp(this, 16); slp.topMargin = dp(this, 24)
        content.addView(saveBtn, slp)

        // keep a handle to the banner name view for render()
        bannerNameView = nameView
    }

    private var bannerNameView: TextView? = null

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
        bannerNameView?.text = m.displayName.ifEmpty { getString(R.string.not_set) }
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
