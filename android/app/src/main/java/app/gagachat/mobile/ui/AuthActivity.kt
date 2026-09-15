package app.gagachat.mobile.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.BuildConfig
import app.gagachat.mobile.R
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.prefs.AppPrefs
import app.gagachat.mobile.prefs.SessionStore
import app.gagachat.mobile.firebase.PushTokenRegistrar
import app.gagachat.mobile.realtime.GaGaService
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/**
 * FIX C-08/M-09: phone-first auth with 24-country picker (default +880),
 * password login, register (phone+name+username+password), OTP verify path.
 * Handles https://gagachat.app and gaga:// deep links (C-07/M-10).
 * POST_NOTIFICATIONS runtime request (targetSdk 35).
 */
class AuthActivity : AppCompatActivity() {

    private var mode = "login"   // login | register | verify
    private var countryCode = "+880"
    private var pendingPhone: String? = null

    private lateinit var root: ScrollView
    private lateinit var content: LinearLayout
    private lateinit var logo: ImageView
    private lateinit var tagline: TextView
    private lateinit var countryField: AutoCompleteTextView
    private lateinit var phoneField: EditText
    private lateinit var nameField: EditText
    private lateinit var usernameField: EditText
    private lateinit var passwordField: EditText
    private lateinit var otpHint: TextView
    private lateinit var otpField: EditText
    private lateinit var actionBtn: TextView
    private lateinit var modeBtn: TextView
    private lateinit var otpBtn: TextView
    private lateinit var progress: com.google.android.material.progressindicator.CircularProgressIndicator
    private lateinit var serverNote: TextView

    private val countries = listOf(
        "+880 BD" to "+880",
        "+93 AF" to "+93", "+355 AL" to "+355", "+213 DZ" to "+213", "+973 BH" to "+973",
        "+32 BE" to "+32", "+55 BR" to "+55", "+86 CN" to "+86", "+20 EG" to "+20",
        "+33 FR" to "+33", "+49 DE" to "+49", "+91 IN" to "+91", "+62 ID" to "+62",
        "+98 IR" to "+98", "+964 IQ" to "+964", "+353 IE" to "+353", "+972 IL" to "+972",
        "+39 IT" to "+39", "+81 JP" to "+81", "+7 KZ" to "+7", "+82 KR" to "+82",
        "+965 KW" to "+965", "+961 LB" to "+961", "+60 MY" to "+60", "+95 MM" to "+95",
        "+977 NP" to "+977", "+31 NL" to "+31", "+92 PK" to "+92", "+974 QA" to "+974",
        "+966 SA" to "+966", "+65 SG" to "+65", "+94 LK" to "+94", "+66 TH" to "+66",
        "+90 TR" to "+90", "+971 AE" to "+971", "+44 GB" to "+44", "+1 US" to "+1"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        Api.baseUrl = AppPrefs.apiBase(this)

        if (SessionStore.isLoggedIn()) { startMain(); return }

        buildUi()
        handleDeepLink(intent)
        requestNotifPermission()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    // ---------------- UI ----------------

    private fun buildUi() {
        val ctx = this
        content = Ui.vertical(ctx, 24)

        logo = ImageView(ctx).apply {
            setImageResource(R.drawable.gaga_logo_master)
            contentDescription = getString(R.string.app_name)
            scaleType = ImageView.ScaleType.FIT_CENTER
            layoutParams = LinearLayout.LayoutParams(Ui.dp(ctx, 128), Ui.dp(ctx, 128)).apply {
                gravity = android.view.Gravity.CENTER_HORIZONTAL
                bottomMargin = Ui.dp(ctx, 12)
            }
        }
        tagline = Ui.subtitle(ctx, getString(R.string.auth_tagline)).apply {
            gravity = android.view.Gravity.CENTER
        }
        content.addView(logo)
        content.addView(tagline)
        content.addView(Ui.space(ctx, 24))

        countryField = Ui.spinner(ctx).apply {
            setAdapter(ArrayAdapter(ctx, android.R.layout.simple_list_item_1, countries.map { it.first }))
            setText(countries[0].first, false)
            setOnItemClickListener { _, _, pos, _ -> countryCode = countries[pos].second }
        }
        content.addView(Ui.subtitle(ctx, getString(R.string.country)))
        content.addView(countryField)
        content.addView(Ui.space(ctx, 12))

        phoneField = Ui.input(ctx, getString(R.string.phone_hint), InputType.TYPE_CLASS_PHONE)
        content.addView(phoneField)
        content.addView(Ui.space(ctx, 12))

        nameField = Ui.input(ctx, getString(R.string.name_hint))
        usernameField = Ui.input(ctx, getString(R.string.username_hint))
        passwordField = Ui.input(
            ctx, getString(R.string.password_hint),
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        )
        content.addView(nameField)
        content.addView(usernameField)
        content.addView(passwordField)
        content.addView(Ui.space(ctx, 8))

        otpHint = Ui.subtitle(ctx, "")
        otpField = Ui.input(ctx, getString(R.string.otp_hint), InputType.TYPE_CLASS_NUMBER)
        content.addView(otpHint)
        content.addView(otpField)

        actionBtn = Ui.text(ctx, "", 16f, bold = true, color = Ui.onPrimaryColor(ctx)).apply {
            background = Ui.pillBackground(Ui.primaryColor(ctx), 28f)
            val pad = Ui.dp(ctx, 16)
            setPadding(pad, Ui.dp(ctx, 14), pad, Ui.dp(ctx, 14))
            gravity = android.view.Gravity.CENTER
            setOnClickListener { submit() }
        }
        content.addView(actionBtn)
        content.addView(Ui.space(ctx, 12))

        modeBtn = Ui.text(ctx, "", 14f, color = Ui.secondaryColor(ctx)).apply {
            gravity = android.view.Gravity.CENTER
            setOnClickListener {
                mode = when (mode) {
                    "login" -> "register"
                    "register" -> "login"
                    else -> "login"
                }
                renderMode()
            }
        }
        content.addView(modeBtn)

        otpBtn = Ui.text(ctx, "", 13f, color = Ui.secondaryColor(ctx)).apply {
            gravity = android.view.Gravity.CENTER
            setOnClickListener {
                if (mode != "verify") {
                    requestOtp()
                } else {
                    mode = "login"
                    renderMode()
                }
            }
        }
        content.addView(otpBtn)
        content.addView(Ui.space(ctx, 24))

        serverNote = Ui.subtitle(ctx, "")
        content.addView(serverNote)

        progress = com.google.android.material.progressindicator.CircularProgressIndicator(ctx).apply {
            isIndeterminate = true
            visibility = View.GONE
        }
        val wrap = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            addView(progress)
        }
        content.addView(wrap)

        root = ScrollView(ctx).apply { addView(content) }
        setContentView(root)
        renderMode()
    }

    private fun renderMode() {
        if (mode == "register" && !BuildConfig.SELF_REGISTRATION_ENABLED) mode = "login"
        if (mode == "verify" && !BuildConfig.OTP_ENABLED) mode = "login"
        val isLogin = mode == "login"
        val isVerify = mode == "verify"
        nameField.isVisible = !isLogin && !isVerify
        usernameField.isVisible = !isLogin && !isVerify
        passwordField.isVisible = !isVerify
        phoneField.isVisible = !isVerify
        countryField.isVisible = !isVerify
        otpHint.isVisible = isVerify
        otpField.isVisible = isVerify
        if (isVerify) {
            otpHint.text = getString(R.string.otp_sent, pendingPhone ?: "")
            actionBtn.text = getString(R.string.verify)
            modeBtn.isVisible = false
            otpBtn.text = getString(R.string.back_to_login)
        } else if (isLogin) {
            actionBtn.text = getString(R.string.login)
            modeBtn.text = getString(R.string.no_account_register)
            modeBtn.isVisible = BuildConfig.SELF_REGISTRATION_ENABLED
            otpBtn.text = getString(R.string.login_with_code)
            otpBtn.isVisible = BuildConfig.OTP_ENABLED
        } else {
            actionBtn.text = getString(R.string.create_account)
            modeBtn.text = getString(R.string.have_account_login)
            modeBtn.isVisible = true
            otpBtn.isVisible = false
        }
    }

    // ---------------- actions ----------------

    private fun requestNotifPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }
    }

    private fun fullPhone(): String {
        val entered = phoneField.text.toString().trim()
        val digits = entered.filter { it in '0'..'9' }
        if (entered.startsWith("+")) return "+$digits"
        // Bangladesh mobile numbers are normally entered as 01XXXXXXXXX.
        // E.164 uses +8801XXXXXXXXX, without the domestic trunk zero.
        val national = if (countryCode == "+880" && digits.startsWith("0"))
            digits.drop(1) else digits
        return countryCode + national
    }

    private fun submit() {
        when (mode) {
            "verify" -> doVerify()
            "register" -> doRegister()
            else -> doLogin()
        }
    }

    private fun doLogin() {
        val phone = fullPhone()
        if (phone.length < 8) return toast(getString(R.string.err_invalid_phone))
        val pw = passwordField.text.toString()
        if (pw.length < 8) return toast(getString(R.string.err_weak_password))
        apiCall { Api.post("/auth/login", JSONObject().put("phone", phone).put("password", pw)) }
    }

    private fun doRegister() {
        if (!BuildConfig.SELF_REGISTRATION_ENABLED) return toast(getString(R.string.err_service_unavailable))
        val phone = fullPhone()
        if (phone.length < 8) return toast(getString(R.string.err_invalid_phone))
        val name = nameField.text.toString().trim()
        val uname = usernameField.text.toString().trim().lowercase()
        val pw = passwordField.text.toString()
        if (name.length < 2) return toast(getString(R.string.err_name_required))
        if (!uname.matches(Regex("^[a-z0-9_]{3,24}$"))) return toast(getString(R.string.err_invalid_username))
        if (pw.length < 8) return toast(getString(R.string.err_weak_password))
        apiCall {
            Api.post("/auth/register", JSONObject()
                .put("phone", phone)
                .put("display_name", name)
                .put("username", uname)
                .put("password", pw))
        }
    }

    private fun doVerify() {
        if (!BuildConfig.OTP_ENABLED) return toast(getString(R.string.err_service_unavailable))
        val phone = pendingPhone ?: fullPhone()
        val code = otpField.text.toString().trim()
        if (!code.matches(Regex("^\\d{4,8}$"))) return toast(getString(R.string.err_bad_code))
        apiCall { Api.post("/auth/verify", JSONObject().put("phone", phone).put("code", code)) }
    }

    private fun requestOtp() {
        if (!BuildConfig.OTP_ENABLED) return toast(getString(R.string.err_service_unavailable))
        val phone = fullPhone()
        if (phone.length < 8) return toast(getString(R.string.err_invalid_phone))
        otpBtn.isEnabled = false
        progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                Api.post("/auth/otp/request", JSONObject().put("phone", phone))
                pendingPhone = phone
                mode = "verify"
                renderMode()
            } catch (e: Exception) {
                toast(friendlyError(e))
            } finally {
                otpBtn.isEnabled = true
                progress.visibility = View.GONE
            }
        }
    }

    private fun apiCall(block: suspend () -> JSONObject) {
        actionBtn.isEnabled = false
        progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val res = block()
                val token = res.optString("token")
                if (token.isBlank()) throw IllegalStateException("no_token")
                SessionStore.save(
                    this@AuthActivity, token,
                    res.optString("refresh_token"), res.optJSONObject("user")?.toString() ?: "{}"
                )
                AppPrefs.setSession(this@AuthActivity, true)
                Api.baseUrl = AppPrefs.apiBase(this@AuthActivity)
                GaGaService.start(this@AuthActivity)
                PushTokenRegistrar.refreshAndRegister()
                toast(getString(R.string.welcome))
                startMain()
            } catch (e: Exception) {
                toast(friendlyError(e))
            } finally {
                actionBtn.isEnabled = true
                progress.visibility = View.GONE
            }
        }
    }

    private fun friendlyError(e: Exception): String = when {
        e is Api.ApiError -> when (e.body?.let { runCatching { JSONObject(it).optString("error") }.getOrNull() }) {
            "no_such_user" -> getString(R.string.err_no_such_user)
            "bad_credentials" -> getString(R.string.err_bad_credentials)
            "already_registered" -> getString(R.string.err_already_registered)
            "invalid_phone" -> getString(R.string.err_invalid_phone)
            "weak_password" -> getString(R.string.err_weak_password)
            "invalid_username" -> getString(R.string.err_invalid_username)
            "rate_limited" -> getString(R.string.err_auth_rate_limited)
            "otp_provider_not_configured", "service_unavailable", "registration_disabled" ->
                getString(R.string.err_service_unavailable)
            else -> if (e.status >= 500 || e.status == 404) getString(R.string.err_service_unavailable)
                else getString(R.string.err_request_failed, e.status)
        }
        e is UnknownHostException -> getString(R.string.err_server_dns)
        e is SocketTimeoutException || e is ConnectException -> getString(R.string.err_server_unreachable)
        e is SSLException -> getString(R.string.err_server_tls)
        e is IllegalStateException && e.message == "no_token" -> getString(R.string.err_service_unavailable)
        else -> getString(R.string.err_network)
    }

    private fun handleDeepLink(intent: Intent) {
        val data = intent.data ?: return
        if (data.scheme == "gaga") {
            val uname = data.pathSegments.firstOrNull()
            if (!uname.isNullOrBlank()) toast(getString(R.string.add_friend_via_link, uname))
        }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
    private fun startMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
