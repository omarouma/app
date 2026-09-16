package app.gagachat.mobile.ui

import android.os.Bundle
import android.view.Gravity
import android.view.View
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
import app.gagachat.mobile.ui.Ui.dp
import app.gagachat.mobile.ui.Ui.input
import app.gagachat.mobile.ui.Ui.space
import app.gagachat.mobile.ui.Ui.text
import app.gagachat.mobile.ui.Ui.vertical
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Settings screen, restyled to the LINE design language: a top app bar, then
 * grouped white list rows with leading icons, trailing chevrons / values and
 * green toggle switches.
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var content: LinearLayout
    private var themeValueView: TextView? = null
    private var langValueView: TextView? = null
    private var bioSwitch: com.google.android.material.materialswitch.MaterialSwitch? = null
    private var serverField: android.widget.EditText? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
    }

    private fun buildUi() {
        val root = vertical(this, 0)
        root.setBackgroundColor(Ui.lineBg(this))

        // ---- top app bar ----
        root.addView(Ui.topBar(this, getString(R.string.settings), onBack = { finish() }))

        val scroll = ScrollView(this)
        content = vertical(this, 0)
        content.setPadding(0, 0, 0, dp(this, 32))
        scroll.addView(content)
        root.addView(scroll, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        // ================= Notifications & general =================
        content.addView(Ui.sectionHeader(this, getString(R.string.notification_settings)))
        val g1 = Ui.listGroup(this)
        g1.addView(Ui.listRow(this, getString(R.string.connection_title),
            iconRes = R.drawable.ic_globe, chevron = true) {
            startActivity(android.content.Intent(this, ConnectionStatusActivity::class.java))
        })
        g1.addView(Ui.divider(this, 54))
        g1.addView(Ui.listRow(this, getString(R.string.notification_settings),
            iconRes = R.drawable.ic_bell, chevron = true) {
            startActivity(android.content.Intent(this, NotificationSettingsActivity::class.java))
        })
        g1.addView(Ui.divider(this, 54))
        g1.addView(Ui.listRow(this, getString(R.string.storage_title),
            iconRes = R.drawable.ic_cloud, chevron = true) {
            startActivity(android.content.Intent(this, StorageActivity::class.java))
        })
        content.addView(g1)

        // ================= Appearance =================
        content.addView(Ui.sectionHeader(this, getString(R.string.settings_appearance)))
        val g2 = Ui.listGroup(this)
        themeValueView = text(this, themeLabel(AppPrefs.theme(this)), 14f, color = Ui.lineTextSecondary(this))
        g2.addView(Ui.listRow(this, getString(R.string.settings_theme),
            iconRes = R.drawable.ic_theme, trailing = themeValueView, chevron = true) { cycleTheme() })
        g2.addView(Ui.divider(this, 54))
        langValueView = text(this, langLabel(AppPrefs.locale(this)), 14f, color = Ui.lineTextSecondary(this))
        g2.addView(Ui.listRow(this, getString(R.string.settings_language),
            iconRes = R.drawable.ic_globe, trailing = langValueView, chevron = true) { pickLanguage() })
        content.addView(g2)

        // ================= Security =================
        content.addView(Ui.sectionHeader(this, getString(R.string.settings_security)))
        val g3 = Ui.listGroup(this)
        g3.addView(Ui.toggleRow(this, getString(R.string.settings_biometric),
            subtitle = getString(R.string.biometric_title),
            iconRes = R.drawable.ic_lock,
            checked = AppPrefs.biometricEnabled(this)) { toggleBiometric() })
        content.addView(g3)

        // ================= Advanced (debug only) =================
        if (BuildConfig.ALLOW_SERVER_OVERRIDE) {
            content.addView(Ui.sectionHeader(this, getString(R.string.settings_advanced)))
            val g4 = Ui.listGroup(this)
            val wrap = vertical(this, 0)
            wrap.setPadding(dp(this, 16), dp(this, 12), dp(this, 16), dp(this, 14))
            wrap.addView(text(this, getString(R.string.server_hint), 16f, color = Ui.lineText(this)))
            serverField = input(this, getString(R.string.server_hint))
            serverField!!.setSingleLine(true)
            serverField!!.setText(AppPrefs.apiBase(this))
            val flp = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            flp.topMargin = dp(this, 8)
            wrap.addView(serverField, flp)
            val note = text(this, getString(R.string.server_note), 12f, color = Ui.lineTextSecondary(this))
            note.setPadding(0, dp(this, 6), 0, 0)
            wrap.addView(note)
            val applyBtn = Ui.greenButton(this, getString(R.string.apply)) { applyServer() }
            val alp = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            alp.topMargin = dp(this, 10)
            wrap.addView(applyBtn, alp)
            g4.addView(wrap)
            content.addView(g4)
        }

        // ================= Privacy & safety =================
        content.addView(Ui.sectionHeader(this, getString(R.string.safety_title)))
        val g5 = Ui.listGroup(this)
        g5.addView(Ui.listRow(this, getString(R.string.safety_title),
            iconRes = R.drawable.ic_shield, chevron = true) {
            startActivity(android.content.Intent(this, SafetyActivity::class.java))
        })
        content.addView(g5)

        // ================= Account =================
        content.addView(Ui.sectionHeader(this, getString(R.string.settings_account)))
        val g6 = Ui.listGroup(this)
        g6.addView(Ui.listRow(this, getString(R.string.export_data),
            iconRes = R.drawable.ic_save, chevron = true) { exportData() })
        g6.addView(Ui.divider(this, 54))
        g6.addView(Ui.listRow(this, getString(R.string.delete_account),
            iconRes = R.drawable.ic_close, chevron = true) { confirmDeleteAccount() })
        content.addView(g6)

        // ---- logout button ----
        val logoutBtn = Ui.greenButton(this, getString(R.string.logout)) { doLogout() }
        val llp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        llp.leftMargin = dp(this, 16); llp.rightMargin = dp(this, 16); llp.topMargin = dp(this, 24)
        content.addView(logoutBtn, llp)
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
        themeValueView?.text = themeLabel(next)
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
            langValueView?.text = langLabel(tag)
            toast(getString(R.string.applied))
        }
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
            bioSwitch?.isChecked = false
            toast(getString(R.string.applied))
            return
        }
        if (bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) !=
            BiometricManager.BIOMETRIC_SUCCESS) {
            toast(getString(R.string.biometric_unavailable))
            bioSwitch?.isChecked = false
            return
        }
        val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    AppPrefs.setBiometric(this@SettingsActivity, true)
                    bioSwitch?.isChecked = true
                    toast(getString(R.string.applied))
                }
                override fun onAuthenticationError(code: Int, msg: CharSequence) {
                    bioSwitch?.isChecked = false
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
                val data = Api.get("/users/me/export").toString(2)
                startActivity(android.content.Intent.createChooser(
                    android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                        type = "application/json"
                        putExtra(android.content.Intent.EXTRA_SUBJECT, getString(R.string.data_export_subject))
                        putExtra(android.content.Intent.EXTRA_TEXT, data)
                    }, getString(R.string.export_data)))
            } catch (e: Exception) { toast(e.message ?: getString(R.string.err_network)) }
        }
    }

    private fun confirmDeleteAccount() {
        val password = input(this, getString(R.string.password_confirm),
            android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD)
        val wrap = android.widget.FrameLayout(this).apply {
            val p = dp(this@SettingsActivity, 20); setPadding(p, p, p, p); addView(password)
        }
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(R.string.delete_account_title).setMessage(R.string.delete_account_body).setView(wrap)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.delete_account) { _, _ -> deleteAccount(password.text.toString()) }.show()
    }

    private fun deleteAccount(password: String) {
        lifecycleScope.launch {
            try {
                Api.post("/users/me/delete", JSONObject().put("password", password))
                GaGaService.stop(this@SettingsActivity); SessionStore.clear(); AppPrefs.setSession(this@SettingsActivity, false)
                startActivity(android.content.Intent(this@SettingsActivity, AuthActivity::class.java)
                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK))
                finishAffinity()
            } catch (e: Exception) { toast(e.message ?: getString(R.string.err_network)) }
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
