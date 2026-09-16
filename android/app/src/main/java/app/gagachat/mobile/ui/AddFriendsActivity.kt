package app.gagachat.mobile.ui

import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.R
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.ui.Ui.button
import app.gagachat.mobile.ui.Ui.dp
import app.gagachat.mobile.ui.Ui.input
import app.gagachat.mobile.ui.Ui.space
import app.gagachat.mobile.ui.Ui.text
import app.gagachat.mobile.ui.Ui.title
import app.gagachat.mobile.ui.Ui.vertical
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Add friends: by @username (POST /contacts) or by scanning a friend's QR
 * code (gaga://u/<username>). Also shows my own QR code to share.
 */
class AddFriendsActivity : AppCompatActivity() {

    // registerForActivityResult must run before RESUMED (lifecycle rule) — hence a field.
    private val scanLauncher =
        registerForActivityResult(com.journeyapps.barcodescanner.ScanContract()) { result ->
            val contents = result?.contents
            if (!contents.isNullOrBlank()) handleScanned(contents)
        }

    private lateinit var content: LinearLayout
    private var qrBox: LinearLayout? = null
    private lateinit var requestsBox: LinearLayout
    private lateinit var usernameField: android.widget.EditText
    private var myUsername = ""
    private var progressView: android.view.View? = null

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

        content.addView(title(this, getString(R.string.add_friends)))
        content.addView(Ui.subtitle(this, getString(R.string.add_friends_subtitle)))
        content.addView(space(this, 16))

        // ---------- add by username ----------
        content.addView(text(this, getString(R.string.add_by_username), 14f, bold = true))
        content.addView(space(this, 8))
        val row = Ui.horizontal(this).apply { gravity = Gravity.CENTER_VERTICAL }
        val field = input(this, getString(R.string.username_hint))
        usernameField = field
        intent.getStringExtra("username")?.takeIf { it.matches(Regex("^[a-z0-9_]{3,24}$")) }
            ?.let { field.setText(it) }
        field.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        row.addView(field)
        val addBtn = button(this, getString(R.string.add)) {
            val u = field.text.toString().trim().removePrefix("@")
            if (u.isEmpty()) { toast(getString(R.string.err_invalid_username)); return@button }
            addContact(u)
        }
        row.addView(addBtn)
        content.addView(row)
        content.addView(space(this, 8))
        val hint = text(this, getString(R.string.add_friend_via_link, "gaga://u/username"), 12f, color = Ui.secondaryColor(this))
        content.addView(hint)
        content.addView(space(this, 24))

        // ---------- scan QR ----------
        content.addView(text(this, getString(R.string.scan_qr), 14f, bold = true))
        content.addView(space(this, 8))
        content.addView(button(this, getString(R.string.scan_qr_button), filled = false) { launchScanner() })
        content.addView(space(this, 24))

        content.addView(text(this, getString(R.string.friend_requests), 14f, bold = true))
        content.addView(space(this, 8))
        requestsBox = vertical(this, 6)
        content.addView(requestsBox)
        content.addView(space(this, 24))

        // ---------- my QR ----------
        content.addView(text(this, getString(R.string.my_qr), 14f, bold = true))
        content.addView(space(this, 8))
        qrBox = vertical(this, 0)
        qrBox!!.gravity = Gravity.CENTER
        qrBox!!.setPadding(0, dp(this, 12), 0, dp(this, 12))
        content.addView(qrBox)
        progressView = Ui.progress(this)
        progressView!!.visibility = android.view.View.GONE
        content.addView(progressView)
    }

    private fun loadMe() {
        lifecycleScope.launch {
            try {
                val j = Api.get("/users/me")
                myUsername = j.optString("username")
                renderQr()
                loadRequests()
            } catch (e: Exception) {
                toast(getString(R.string.err_network))
            }
        }
    }

    // ---------------- QR render ----------------

    private fun renderQr() {
        val box = qrBox ?: return
        box.removeAllViews()
        if (myUsername.isEmpty()) return
        val payload = "gaga://u/$myUsername"
        val sizePx = dp(this, 220)
        lifecycleScope.launch {
            val bmp = withContext(Dispatchers.IO) {
                runCatching { generateQr(payload, sizePx) }.getOrNull()
            }
            if (bmp != null) {
                val iv = android.widget.ImageView(this@AddFriendsActivity)
                iv.setImageBitmap(bmp)
                box.addView(iv, LinearLayout.LayoutParams(sizePx, sizePx))
                val cap = text(this@AddFriendsActivity, "@$myUsername", 13f, color = Ui.secondaryColor(this@AddFriendsActivity))
                cap.gravity = Gravity.CENTER
                cap.setPadding(0, dp(this@AddFriendsActivity, 10), 0, 0)
                box.addView(cap)
                box.addView(button(this@AddFriendsActivity, getString(R.string.share_profile_link), filled = false) {
                    startActivity(android.content.Intent.createChooser(
                        android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(android.content.Intent.EXTRA_TEXT, payload)
                        }, getString(R.string.share_profile_link)))
                })
            } else {
                toast(getString(R.string.err_network))
            }
        }
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
        // gaga://u/<username> or bare @username / username
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
                    requestsBox.addView(Ui.subtitle(this@AddFriendsActivity, getString(R.string.no_friend_requests)))
                    return@onSuccess
                }
                for (i in 0 until arr.length()) {
                    val request = arr.getJSONObject(i)
                    val incoming = request.optString("direction") == "incoming"
                    val row = vertical(this@AddFriendsActivity, 4).apply {
                        setPadding(dp(this@AddFriendsActivity, 10), dp(this@AddFriendsActivity, 8),
                            dp(this@AddFriendsActivity, 10), dp(this@AddFriendsActivity, 8))
                        addView(text(this@AddFriendsActivity,
                            request.optString("display_name", request.optString("username")), 15f, bold = true))
                        addView(Ui.subtitle(this@AddFriendsActivity,
                            "@${request.optString("username")} · ${getString(if (incoming) R.string.incoming else R.string.outgoing)}"))
                    }
                    if (incoming) {
                        val actions = Ui.horizontal(this@AddFriendsActivity)
                        actions.addView(button(this@AddFriendsActivity, getString(R.string.accept)) {
                            decideRequest(request.optString("id"), true)
                        })
                        actions.addView(button(this@AddFriendsActivity, getString(R.string.reject), filled = false) {
                            decideRequest(request.optString("id"), false)
                        })
                        row.addView(actions)
                    }
                    requestsBox.addView(row)
                }
            }.onFailure {
                requestsBox.removeAllViews()
                requestsBox.addView(Ui.subtitle(this@AddFriendsActivity, getString(R.string.err_network)))
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
