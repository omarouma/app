package app.gagachat.mobile.ui

import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.R
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.ui.Ui.dp
import app.gagachat.mobile.ui.Ui.input
import app.gagachat.mobile.ui.Ui.space
import app.gagachat.mobile.ui.Ui.text
import app.gagachat.mobile.ui.Ui.vertical
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Add friends, restyled to the LINE design language: a three-up action row
 * (Invite / My QR code / Search), an auto-add toggle, a "Try inviting a friend"
 * card, friend requests, and a QR modal with Copy link / Share / Save /
 * Regenerate.
 */
class AddFriendsActivity : AppCompatActivity() {

    private val scanLauncher =
        registerForActivityResult(com.journeyapps.barcodescanner.ScanContract()) { result ->
            val contents = result?.contents
            if (!contents.isNullOrBlank()) handleScanned(contents)
        }

    private lateinit var content: LinearLayout
    private lateinit var requestsBox: LinearLayout
    private lateinit var usernameField: android.widget.EditText
    private var myUsername = ""
    private var myDisplayName = ""
    private var progressView: android.view.View? = null
    private var qrBitmap: Bitmap? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        loadMe()
    }

    private fun buildUi() {
        val root = vertical(this, 0)
        root.setBackgroundColor(Ui.lineBg(this))
        root.addView(Ui.topBar(this, getString(R.string.add_friends), onBack = { finish() }))

        val scroll = ScrollView(this)
        content = vertical(this, 0)
        content.setPadding(0, 0, 0, dp(this, 32))
        scroll.addView(content)
        root.addView(scroll, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        // ---------------- three-up action row ----------------
        val actions = Ui.horizontal(this).apply {
            setPadding(dp(this@AddFriendsActivity, 8), dp(this@AddFriendsActivity, 18),
                dp(this@AddFriendsActivity, 8), dp(this@AddFriendsActivity, 18))
        }
        actions.addView(actionCell(R.drawable.ic_invite, getString(R.string.invite)) { inviteFriend() },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        actions.addView(actionCell(R.drawable.ic_qr, getString(R.string.my_qr_code)) { showQrDialog() },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        actions.addView(actionCell(R.drawable.ic_search, getString(R.string.search_by_name)) { focusSearch() },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        content.addView(actions)
        content.addView(Ui.divider(this, 0))

        // ---------------- auto add friends ----------------
        val g1 = Ui.listGroup(this)
        g1.addView(Ui.toggleRow(this, getString(R.string.auto_add_friends),
            iconRes = R.drawable.ic_person_add, checked = true) { /* preference only */ })
        content.addView(g1)

        // ---------------- create a group ----------------
        val g2 = Ui.listGroup(this)
        g2.addView(Ui.listRow(this, getString(R.string.create_a_group),
            iconRes = R.drawable.ic_group, chevron = true) {
            toast(getString(R.string.not_set))
        })
        content.addView(g2)

        // ---------------- try inviting a friend ----------------
        content.addView(Ui.sectionHeader(this, getString(R.string.try_inviting)))
        val inviteCard = vertical(this, 0)
        inviteCard.setPadding(dp(this, 16), dp(this, 16), dp(this, 16), dp(this, 16))
        inviteCard.setBackgroundColor(Ui.lineBg(this))
        inviteCard.addView(text(this, getString(R.string.try_inviting_body), 14f, color = Ui.lineTextSecondary(this)))
        val inviteBtn = Ui.greenButton(this, getString(R.string.invite_a_friend)) { inviteFriend() }
        val ilp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        ilp.topMargin = dp(this, 12)
        inviteCard.addView(inviteBtn, ilp)
        content.addView(inviteCard)

        // ---------------- add by username ----------------
        content.addView(Ui.sectionHeader(this, getString(R.string.add_by_username)))
        val g3 = Ui.listGroup(this)
        val wrap = vertical(this, 0)
        wrap.setPadding(dp(this, 16), dp(this, 12), dp(this, 16), dp(this, 14))
        val row = Ui.horizontal(this).apply { gravity = Gravity.CENTER_VERTICAL }
        val field = input(this, getString(R.string.username_hint))
        usernameField = field
        intent.getStringExtra("username")?.takeIf { it.matches(Regex("^[a-z0-9_]{3,24}$")) }
            ?.let { field.setText(it) }
        field.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        row.addView(field)
        val addBtn = Ui.greenButton(this, getString(R.string.add)) {
            val u = field.text.toString().trim().removePrefix("@")
            if (u.isEmpty()) { toast(getString(R.string.err_invalid_username)); return@greenButton }
            addContact(u)
        }
        val ablp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        ablp.leftMargin = dp(this, 8)
        row.addView(addBtn, ablp)
        wrap.addView(row)
        val hint = text(this, getString(R.string.add_friend_via_link, "gaga://u/username"), 12f,
            color = Ui.lineTextSecondary(this))
        hint.setPadding(0, dp(this, 8), 0, 0)
        wrap.addView(hint)
        g3.addView(wrap)
        content.addView(g3)

        // ---------------- scan QR ----------------
        val g4 = Ui.listGroup(this)
        g4.addView(Ui.listRow(this, getString(R.string.scan_qr_code),
            iconRes = R.drawable.ic_scan, chevron = true) { launchScanner() })
        content.addView(g4)

        // ---------------- friend requests ----------------
        content.addView(Ui.sectionHeader(this, getString(R.string.friend_requests)))
        requestsBox = vertical(this, 0)
        requestsBox.setBackgroundColor(Ui.lineBg(this))
        content.addView(requestsBox)

        progressView = Ui.progress(this)
        progressView!!.visibility = android.view.View.GONE
        content.addView(progressView)
    }

    /** A LINE "Services"-style action cell: circular icon above a label. */
    private fun actionCell(iconRes: Int, label: String, onClick: () -> Unit): LinearLayout {
        val col = vertical(this, 0).apply {
            gravity = Gravity.CENTER
            isClickable = true
            setOnClickListener { onClick() }
        }
        col.addView(Ui.iconCircle(this, iconRes, Ui.lineGreen(this), 52, Color.WHITE))
        col.addView(text(this, label, 12f, color = Ui.lineText(this)).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(this@AddFriendsActivity, 8), 0, 0)
        })
        return col
    }

    private fun focusSearch() {
        usernameField.requestFocus()
        val imm = getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
        imm.showSoftInput(usernameField, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT)
    }

    private fun inviteFriend() {
        val payload = if (myUsername.isNotEmpty()) "gaga://u/$myUsername" else "https://gagachat.app"
        startActivity(android.content.Intent.createChooser(
            android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(android.content.Intent.EXTRA_TEXT,
                    getString(R.string.invite_message, payload))
            }, getString(R.string.invite_a_friend)))
    }

    private fun loadMe() {
        lifecycleScope.launch {
            try {
                val j = Api.get("/users/me")
                myUsername = j.optString("username")
                myDisplayName = j.optString("display_name")
                loadRequests()
            } catch (e: Exception) {
                toast(getString(R.string.err_network))
            }
        }
    }

    // ---------------- QR modal ----------------

    private fun showQrDialog() {
        if (myUsername.isEmpty()) { toast(getString(R.string.err_network)); return }
        val payload = "gaga://u/$myUsername"
        val sizePx = dp(this, 220)
        lifecycleScope.launch {
            val bmp = qrBitmap ?: withContext(Dispatchers.IO) {
                runCatching { generateQr(payload, sizePx) }.getOrNull()
            }
            if (bmp == null) { toast(getString(R.string.err_network)); return@launch }
            qrBitmap = bmp

            val box = vertical(this@AddFriendsActivity, 0).apply {
                gravity = Gravity.CENTER
                setPadding(dp(this@AddFriendsActivity, 24), dp(this@AddFriendsActivity, 20),
                    dp(this@AddFriendsActivity, 24), dp(this@AddFriendsActivity, 20))
            }
            val iv = ImageView(this@AddFriendsActivity).apply { setImageBitmap(bmp) }
            box.addView(iv, LinearLayout.LayoutParams(sizePx, sizePx))
            box.addView(text(this@AddFriendsActivity, "@$myUsername", 14f,
                color = Ui.lineTextSecondary(this@AddFriendsActivity)).apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(this@AddFriendsActivity, 12), 0, 0)
            })
            box.addView(text(this@AddFriendsActivity, getString(R.string.show_qr_hint), 12f,
                color = Ui.lineTextSecondary(this@AddFriendsActivity)).apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(this@AddFriendsActivity, 6), 0, dp(this@AddFriendsActivity, 16))
            })

            // Copy link / Share / Save / Regenerate
            val row1 = Ui.horizontal(this@AddFriendsActivity).apply { gravity = Gravity.CENTER }
            row1.addView(qrAction(R.drawable.ic_copy, getString(R.string.copy_link)) {
                val cm = getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                cm.setPrimaryClip(android.content.ClipData.newPlainText("gaga", payload))
                toast(getString(R.string.copied))
            })
            row1.addView(qrAction(R.drawable.ic_share, getString(R.string.share)) {
                startActivity(android.content.Intent.createChooser(
                    android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(android.content.Intent.EXTRA_TEXT, payload)
                    }, getString(R.string.share)))
            })
            row1.addView(qrAction(R.drawable.ic_save, getString(R.string.save)) { saveQr(bmp) })
            row1.addView(qrAction(R.drawable.ic_refresh, getString(R.string.regenerate)) {
                qrBitmap = null
                toast(getString(R.string.applied))
            })
            box.addView(row1)

            androidx.appcompat.app.AlertDialog.Builder(this@AddFriendsActivity)
                .setTitle(R.string.my_qr_code)
                .setView(box)
                .setPositiveButton(R.string.ok, null)
                .show()
        }
    }

    private fun qrAction(iconRes: Int, label: String, onClick: () -> Unit): LinearLayout {
        val col = vertical(this).apply {
            gravity = Gravity.CENTER
            isClickable = true
            setPadding(dp(this@AddFriendsActivity, 10), 0, dp(this@AddFriendsActivity, 10), 0)
            setOnClickListener { onClick() }
        }
        col.addView(Ui.icon(this, iconRes, 24, Ui.lineGreen(this)))
        col.addView(text(this, label, 11f, color = Ui.lineTextSecondary(this)).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(this@AddFriendsActivity, 4), 0, 0)
        })
        return col
    }

    private fun saveQr(bmp: Bitmap) {
        runCatching {
            val dir = java.io.File(cacheDir, "qr")
            dir.mkdirs()
            val f = java.io.File(dir, "gaga_qr_$myUsername.png")
            f.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            toast(getString(R.string.saved_to, f.absolutePath))
        }.onFailure { toast(getString(R.string.err_network)) }
    }

    private fun generateQr(payload: String, sizePx: Int): Bitmap {
        val hints = mapOf(EncodeHintType.MARGIN to 1)
        val matrix = QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565)
        for (x in 0 until sizePx) {
            for (y in 0 until sizePx) {
                bmp.setPixel(x, y, if (matrix.get(x, y)) Color.BLACK else Color.WHITE)
            }
        }
        return bmp
    }

    // ---------------- scanner ----------------

    private fun launchScanner() {
        scanLauncher.launch(com.journeyapps.barcodescanner.ScanOptions().apply {
            setDesiredBarcodeFormats(com.journeyapps.barcodescanner.ScanOptions.QR_CODE)
            setPrompt("")
            setBeepEnabled(false)
            setOrientationLocked(true)
        })
    }

    private fun handleScanned(contents: String) {
        val username = when {
            contents.startsWith("gaga://u/") -> contents.removePrefix("gaga://u/").substringBefore('/')
            contents.startsWith("@") -> contents.removePrefix("@")
            contents.matches(Regex("^[a-z0-9_]{3,24}$")) -> contents
            else -> ""
        }
        if (username.isEmpty()) {
            toast(getString(R.string.err_invalid_username))
            return
        }
        addContact(username)
    }

    // ---------------- add contact ----------------

    private fun addContact(username: String) {
        progressView?.visibility = android.view.View.VISIBLE
        lifecycleScope.launch {
            try {
                val result = Api.post("/contacts", JSONObject().put("username", username))
                toast(if (result.optString("state") == "pending") getString(R.string.friend_request_pending)
                    else getString(R.string.friend_request_sent))
                setResult(RESULT_OK)
                loadRequests()
            } catch (e: Exception) {
                val msg = (e as? app.gagachat.mobile.net.Api.ApiError)?.message
                toast(when (msg) {
                    "no_such_user" -> getString(R.string.err_no_such_user)
                    "already_contact" -> getString(R.string.err_already_contact)
                    else -> getString(R.string.err_network)
                })
            } finally {
                progressView?.visibility = android.view.View.GONE
            }
        }
    }

    private fun loadRequests() {
        lifecycleScope.launch {
            runCatching { Api.getArray("/friend-requests") }.onSuccess { arr ->
                requestsBox.removeAllViews()
                if (arr.length() == 0) {
                    requestsBox.addView(Ui.listRow(this@AddFriendsActivity,
                        getString(R.string.no_friend_requests)))
                    return@onSuccess
                }
                for (i in 0 until arr.length()) {
                    val request = arr.getJSONObject(i)
                    val incoming = request.optString("direction") == "incoming"
                    val row = vertical(this@AddFriendsActivity, 0).apply {
                        setPadding(dp(this@AddFriendsActivity, 16), dp(this@AddFriendsActivity, 12),
                            dp(this@AddFriendsActivity, 16), dp(this@AddFriendsActivity, 12))
                    }
                    row.addView(text(this@AddFriendsActivity,
                        request.optString("display_name", request.optString("username")), 16f,
                        color = Ui.lineText(this@AddFriendsActivity)))
                    row.addView(text(this@AddFriendsActivity,
                        "@${request.optString("username")} \u00b7 ${getString(if (incoming) R.string.incoming else R.string.outgoing)}",
                        12f, color = Ui.lineTextSecondary(this@AddFriendsActivity)))
                    if (incoming) {
                        val actions = Ui.horizontal(this@AddFriendsActivity)
                        val alp = LinearLayout.LayoutParams(
                            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                        alp.topMargin = dp(this@AddFriendsActivity, 8)
                        actions.addView(Ui.greenButton(this@AddFriendsActivity, getString(R.string.accept)) {
                            decideRequest(request.optString("id"), true)
                        })
                        actions.addView(Ui.button(this@AddFriendsActivity, getString(R.string.reject), filled = false) {
                            decideRequest(request.optString("id"), false)
                        })
                        row.addView(actions, alp)
                    }
                    requestsBox.addView(row)
                    if (i < arr.length() - 1) requestsBox.addView(Ui.divider(this@AddFriendsActivity, 16))
                }
            }.onFailure {
                requestsBox.removeAllViews()
                requestsBox.addView(Ui.listRow(this@AddFriendsActivity, getString(R.string.err_network)))
            }
        }
    }

    private fun decideRequest(id: String, accept: Boolean) {
        if (id.isBlank()) return
        lifecycleScope.launch {
            try {
                Api.post("/friend-requests/$id/${if (accept) "accept" else "reject"}")
                if (accept) setResult(RESULT_OK)
                toast(getString(if (accept) R.string.friend_request_accepted else R.string.friend_request_rejected))
                loadRequests()
            } catch (_: Exception) {
                toast(getString(R.string.err_network))
            }
        }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
}
