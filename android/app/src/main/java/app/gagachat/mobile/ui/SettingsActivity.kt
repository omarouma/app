package app.gagachat.mobile.ui

import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.BuildConfig
import app.gagachat.mobile.R
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.prefs.AppPrefs
import app.gagachat.mobile.prefs.SessionStore
import app.gagachat.mobile.realtime.GaGaService
import app.gagachat.mobile.ui.Ui.button
import app.gagachat.mobile.ui.Ui.dp
import app.gagachat.mobile.ui.Ui.input
import app.gagachat.mobile.ui.Ui.space
import app.gagachat.mobile.ui.Ui.text
import app.gagachat.mobile.ui.Ui.title
import app.gagachat.mobile.ui.Ui.vertical
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Settings screen: appearance (theme, language), security (biometric unlock),
 * advanced (server override), account (logout).
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var content: LinearLayout
    private var themeLabelView: TextView? = null
    private var langLabelView: TextView? = null
    private var bioBtn: android.widget.Button? = null
    private var serverField: android.widget.EditText? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
    }

    private fun buildUi() {
        val scroll = ScrollView(this)
        content = vertical(this, 0)
        content.setPadding(dp(this, 20), dp(this, 24), dp(this, 20), dp(this, 32))
        scroll.addView(content)
        setContentView(scroll)

        content.addView(title(this, getString(R.string.settings)))
        content.addView(Ui.subtitle(this, getString(R.string.settings_subtitle)))
        content.addView(space(this, 20))

        content.addView(sectionLabel(getString(R.string.notification_settings)))
        content.addView(button(this, getString(R.string.notification_settings), filled = false) {
            startActivity(android.content.Intent(this, NotificationSettingsActivity::class.java))
        })
        content.addView(space(this, 8))
        content.addView(button(this, getString(R.string.storage_title), filled = false) {
            startActivity(android.content.Intent(this, StorageActivity::class.java))
        })
        content.addView(space(this, 20))

        // ---------------- Appearance: theme ----------------
        content.addView(sectionLabel(getString(R.string.settings_appearance)))
        val themeRow = row()
        themeLabelView = text(this, themeLabel(AppPrefs.theme(this)), 15f)
        themeRow.addView(themeLabelView, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        themeRow.addView(button(this, getString(R.string.change), filled = false) { cycleTheme() })
        content.addView(themeRow)
        content.addView(space(this, 12))

        // ---------------- Appearance: language ----------------
        val langRow = row()
        langLabelView = text(this, langLabel(AppPrefs.locale(this)), 15f)
        langRow.addView(langLabelView, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        langRow.addView(button(this, getString(R.string.change), filled = false) { pickLanguage() })
        content.addView(langRow)
        content.addView(space(this, 24))

        // ---------------- Security: biometric ----------------
        content.addView(sectionLabel(getString(R.string.settings_security)))
        val bioRow = row()
        bioRow.addView(text(this, getString(R.string.settings_biometric), 15f),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        bioBtn = button(this, if (AppPrefs.biometricEnabled(this)) getString(R.string.on) else getString(R.string.off), filled = false) { toggleBiometric() }
        bioRow.addView(bioBtn)
        content.addView(bioRow)
        content.addView(space(this, 24))

        // Server switching is a debug-only diagnostic. Release builds are
        // permanently pinned to BuildConfig.API_BASE.
        if (BuildConfig.ALLOW_SERVER_OVERRIDE) {
            content.addView(sectionLabel(getString(R.string.settings_advanced)))
            serverField = input(this, getString(R.string.server_hint))
            serverField!!.setSingleLine(true)
            serverField!!.setText(AppPrefs.apiBase(this))
            content.addView(serverField)
            val serverNote = text(this, getString(R.string.server_note), 12f, color = Ui.secondaryColor(this))
            serverNote.setPadding(0, dp(this, 6), 0, 0)
            content.addView(serverNote)
            val applyBtn = button(this, getString(R.string.apply)) { applyServer() }
            val applyLp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            applyLp.topMargin = dp(this, 10)
            content.addView(applyBtn, applyLp)
            content.addView(space(this, 24))
        }

        // ---------------- Privacy, safety and account rights ----------------
        content.addView(sectionLabel(getString(R.string.safety_title)))
        content.addView(button(this, getString(R.string.safety_title), filled = false) {
            startActivity(android.content.Intent(this, SafetyActivity::class.java))
        })
        content.addView(space(this, 12))

        // ---------------- Account: export, delete, logout ----------------
        content.addView(sectionLabel(getString(R.string.settings_account)))
        content.addView(button(this, getString(R.string.export_data), filled = false) { exportData() })
        content.addView(space(this, 8))
        content.addView(button(this, getString(R.string.delete_account), filled = false) { confirmDeleteAccount() })
        content.addView(space(this, 8))
        val logoutBtn = button(this, getString(R.string.logout), filled = true) { doLogout() }
        content.addView(logoutBtn)
    }

    // ---------------- rows ----------------

    private fun row(): LinearLayout = Ui.horizontal(this).apply {
        gravity = Gravity.CENTER_VERTICAL
        setPadding(0, dp(this@SettingsActivity, 8), 0, dp(this@SettingsActivity, 10))
    }

    private fun sectionLabel(s: String): TextView {
        val t = text(this, s.uppercase(), 12f, bold = true, color = Ui.primaryColor(this))
        t.setPadding(0, 0, dp(this, 8), 0)
        return t
    }

    // ---------------- theme ----------------

    private fun themeLabel(t: String): String = when (t) {
        AppPrefs.THEME_LIGHT -> getString(R.string.theme_light)
        AppPrefs.THEME_DARK -> getString(R.string.theme_dark)
        else -> getString(R.string.theme_system)
    }

    private fun cycleTheme() {
        val next = when (AppPrefs.theme(this)) {
            AppPrefs.THEME_SYSTEM -> AppPrefs.THEME_LIGHT
            AppPrefs.THEME_LIGHT -> AppPrefs.THEME_DARK
            else -> AppPrefs.THEME_SYSTEM
        }
        AppPrefs.setTheme(this, next)
        AppCompatDelegate.setDefaultNightMode(when (next) {
            AppPrefs.THEME_LIGHT -> AppCompatDelegate.MODE_NIGHT_NO
            AppPrefs.THEME_DARK -> AppCompatDelegate.MODE_NIGHT_YES
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        })
        themeLabelView?.text = themeLabel(next)
        toast(getString(R.string.applied))
    }

    // ---------------- language ----------------

    private val languages = listOf(
        null to R.string.lang_system,
        "en" to R.string.lang_en,
        "ar" to R.string.lang_ar,
        "bn" to R.string.lang_bn,
        "fr" to R.string.lang_fr,
        "tr" to R.string.lang_tr,
        "es" to R.string.lang_es,
        "hi" to R.string.lang_hi,
        "id" to R.string.lang_id,
        "pt" to R.string.lang_pt,
        "ru" to R.string.lang_ru,
        "ur" to R.string.lang_ur,
        "zh" to R.string.lang_zh,
        "de" to R.string.lang_de
    )

    private fun langLabel(tag: String?): String =
        getString(languages.firstOrNull { it.first == tag }?.second ?: R.string.lang_system)

    private fun pickLanguage() {
        val labels = languages.map { getString(it.second) }
        val view = Ui.spinner(this)
        view.setAdapter(ArrayAdapter(this, android.R.layout.simple_list_item_1, labels))
        view.setText(langLabel(AppPrefs.locale(this)), false)
        view.setOnItemClickListener { _, _, position, _ ->
            val tag = languages[position].first
            AppPrefs.setLocale(this, tag)
            val locales = if (tag != null)
                androidx.core.os.LocaleListCompat.forLanguageTags(tag)
            else androidx.core.os.LocaleListCompat.getEmptyLocaleList()
            AppCompatDelegate.setApplicationLocales(locales)
            langLabelView?.text = langLabel(tag)
            toast(getString(R.string.applied))
        }
        // Present as a bottom-sheet style dialog using the spinner in a popup
        val wrap = android.widget.FrameLayout(this)
        val pad = dp(this, 20)
        wrap.setPadding(pad, pad, pad, pad)
        wrap.addView(view, android.widget.FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(R.string.settings_language)
            .setView(wrap)
            .setPositiveButton(R.string.ok, null)
            .create()
        view.setOnClickListener { dialog.dismiss() }
        dialog.show()
        view.showDropDown()
    }

    // ---------------- biometric ----------------

    private fun toggleBiometric() {
        val bm = BiometricManager.from(this)
        if (AppPrefs.biometricEnabled(this)) {
            AppPrefs.setBiometric(this, false)
            bioBtn?.text = getString(R.string.off)
            toast(getString(R.string.applied))
            return
        }
        if (bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) !=
            BiometricManager.BIOMETRIC_SUCCESS) {
            toast(getString(R.string.biometric_unavailable))
            return
        }
        val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    AppPrefs.setBiometric(this@SettingsActivity, true)
                    bioBtn?.text = getString(R.string.on)
                    toast(getString(R.string.applied))
                }
                override fun onAuthenticationError(code: Int, msg: CharSequence) {
                    toast(msg.toString())
                }
            })
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(getString(R.string.biometric_title))
            .setNegativeButtonText(getString(R.string.cancel))
            .build()
        prompt.authenticate(info)
    }

    // ---------------- server ----------------

    private fun applyServer() {
        if (!BuildConfig.ALLOW_SERVER_OVERRIDE) return
        val url = serverField?.text?.toString()?.trim() ?: ""
        val validHttps = runCatching {
            val parsed = android.net.Uri.parse(url)
            parsed.scheme == "https" && !parsed.host.isNullOrBlank()
        }.getOrDefault(false)
        if (url.isNotEmpty() && !validHttps) {
            toast(getString(R.string.err_invalid_server))
            return
        }
        AppPrefs.setApiBase(this, url)
        Api.baseUrl = if (url.isEmpty()) BuildConfig.API_BASE else url
        toast(getString(R.string.server_applied))
    }

    // ---------------- account ----------------

    private fun exportData() {
        lifecycleScope.launch {
            try {
                val data=Api.get("/users/me/export").toString(2)
                startActivity(android.content.Intent.createChooser(
                    android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                        type="application/json"
                        putExtra(android.content.Intent.EXTRA_SUBJECT,getString(R.string.data_export_subject))
                        putExtra(android.content.Intent.EXTRA_TEXT,data)
                    }, getString(R.string.export_data)))
            } catch(e:Exception) { toast(e.message ?: getString(R.string.err_network)) }
        }
    }

    private fun confirmDeleteAccount() {
        val password=input(this,getString(R.string.password_confirm),android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD)
        val wrap=android.widget.FrameLayout(this).apply { val p=dp(this@SettingsActivity,20);setPadding(p,p,p,p);addView(password) }
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(R.string.delete_account_title).setMessage(R.string.delete_account_body).setView(wrap)
            .setNegativeButton(R.string.cancel,null)
            .setPositiveButton(R.string.delete_account) { _,_ -> deleteAccount(password.text.toString()) }.show()
    }

    private fun deleteAccount(password:String) {
        lifecycleScope.launch {
            try {
                Api.post("/users/me/delete",JSONObject().put("password",password))
                GaGaService.stop(this@SettingsActivity);SessionStore.clear();AppPrefs.setSession(this@SettingsActivity,false)
                startActivity(android.content.Intent(this@SettingsActivity,AuthActivity::class.java)
                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK))
                finishAffinity()
            } catch(e:Exception) { toast(e.message ?: getString(R.string.err_network)) }
        }
    }

    private fun doLogout() {
        lifecycleScope.launch {
            runCatching {
                Api.post("/auth/logout", JSONObject()
                    .put("refresh_token", SessionStore.refreshToken ?: ""))
            }
            GaGaService.stop(this@SettingsActivity)
            SessionStore.clear()
            AppPrefs.setSession(this@SettingsActivity, false)
            val i = android.content.Intent(this@SettingsActivity, AuthActivity::class.java)
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK)
            startActivity(i)
            finishAffinity()
        }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
}
