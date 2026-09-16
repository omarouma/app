package app.gagachat.mobile.ui

import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.BuildConfig
import app.gagachat.mobile.R
import app.gagachat.mobile.net.Api
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
 * Wallet screen: balance card, quick actions (top-up / send / withdraw),
 * and recent transaction history. All money is GaGa tokens (GAGA).
 */
class WalletActivity : AppCompatActivity() {

    private lateinit var content: LinearLayout
    private var balanceView: TextView? = null
    private var rateView: TextView? = null
    private var historyList: LinearLayout? = null
    private var progressView: android.view.View? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (BuildConfig.WALLET_ENABLED) {
            buildUi()
            loadWallet()
        } else {
            buildComingSoonUi()
        }
    }

    private fun buildComingSoonUi() {
        val scroll = ScrollView(this)
        val body = vertical(this, 0)
        body.setPadding(dp(this, 24), dp(this, 32), dp(this, 24), dp(this, 32))
        body.addView(title(this, getString(R.string.wallet_coming_soon_title)))
        body.addView(space(this, 14))
        body.addView(Ui.subtitle(this, getString(R.string.wallet_coming_soon_body)))
        scroll.addView(body)
        setContentView(scroll)
    }

    private fun buildUi() {
        val scroll = ScrollView(this)
        content = vertical(this, 0)
        content.setPadding(dp(this, 20), dp(this, 24), dp(this, 20), dp(this, 32))
        scroll.addView(content)
        setContentView(scroll)

        // header
        content.addView(title(this, getString(R.string.wallet)))
        content.addView(Ui.subtitle(this, getString(R.string.wallet_subtitle)))
        content.addView(space(this, 16))

        // balance card
        val card = Ui.horizontal(this)
        card.orientation = LinearLayout.VERTICAL
        card.setPadding(dp(this, 20), dp(this, 18), dp(this, 20), dp(this, 18))
        card.background = Ui.pillBackground(Ui.primaryColor(this), 20f)
        balanceView = text(this, "…", 30f, bold = true, color = Ui.onPrimaryColor(this))
        balanceView!!.gravity = Gravity.CENTER
        card.addView(balanceView)
        rateView = text(this, "", 12f, color = Ui.onPrimaryColor(this))
        rateView!!.gravity = Gravity.CENTER
        card.addView(rateView)
        content.addView(card)
        content.addView(space(this, 20))

        // actions
        val actions = Ui.horizontal(this)
        actions.gravity = Gravity.CENTER
        val btnLp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        val spacing = dp(this, 8)
        val topup = button(this, getString(R.string.wallet_topup), filled = true) { action("topup") }
        val send = button(this, getString(R.string.wallet_send), filled = false) { action("send") }
        val wd = button(this, getString(R.string.wallet_withdraw), filled = false) { action("withdraw") }
        topup.layoutParams = btnLp
        send.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = spacing; rightMargin = spacing }
        wd.layoutParams = btnLp
        actions.addView(topup)
        actions.addView(send)
        actions.addView(wd)
        content.addView(actions)
        content.addView(space(this, 24))

        // history
        content.addView(text(this, getString(R.string.wallet_recent), 14f, bold = true))
        content.addView(space(this, 8))
        historyList = vertical(this, 0)
        content.addView(historyList)
        progressView = Ui.progress(this)
        progressView!!.visibility = android.view.View.GONE
        val pvLp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        pvLp.gravity = Gravity.CENTER
        content.addView(progressView, pvLp)
    }

    private fun loadWallet() {
        lifecycleScope.launch {
            progressView?.visibility = android.view.View.VISIBLE
            try {
                val res = Api.get("/wallet")
                val balance = res.optDouble("balance", 0.0)
                val symbol = res.optString("symbol", "GAGA")
                val rate = res.optDouble("rate_usd", 0.0)
                balanceView?.text = String.format(java.util.Locale.US, "%s %.2f", symbol, balance)
                rateView?.text = getString(R.string.wallet_rate, rate)
                val hist = res.optJSONArray("history") ?: org.json.JSONArray()
                renderHistory(hist)
            } catch (e: Exception) {
                toast(friendlyError(e))
            } finally {
                progressView?.visibility = android.view.View.GONE
            }
        }
    }

    private fun renderHistory(hist: org.json.JSONArray) {
        val list = historyList ?: return
        list.removeAllViews()
        if (hist.length() == 0) {
            val empty = text(this, getString(R.string.wallet_no_history), 13f, color = Ui.secondaryColor(this))
            empty.setPadding(0, dp(this, 8), 0, dp(this, 8))
            list.addView(empty)
            return
        }
        for (i in 0 until hist.length()) {
            val row = hist.optJSONObject(i) ?: continue
            val kind = row.optString("kind")
            val amount = row.optDouble("amount", 0.0)
            val createdAt = row.optLong("created_at")
            val rowLayout = Ui.horizontal(this).apply {
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(this@WalletActivity, 10), 0, dp(this@WalletActivity, 10))
            }
            val info = vertical(this, 0)
            info.addView(text(this, kindLabel(kind), 15f))
            info.addView(Ui.subtitle(this, timeAgo(createdAt)))
            rowLayout.addView(info, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            val isCredit = kind == "topup"
            val amtView = text(this, if (isCredit) "+%.2f".format(java.util.Locale.US, amount)
            else "-%.2f".format(java.util.Locale.US, amount), 15f, bold = true,
                color = if (isCredit) 0xFF2E7D32.toInt() else 0xFFC62828.toInt())
            rowLayout.addView(amtView)
            list.addView(rowLayout)
            if (i < hist.length() - 1) {
                val divider = android.view.View(this)
                divider.setBackgroundColor(Ui.secondaryColor(this))
                divider.alpha = 0.15f
                list.addView(divider, LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, 1))
            }
        }
    }

    private fun kindLabel(kind: String): String = when (kind) {
        "topup" -> getString(R.string.wallet_topup)
        "send" -> getString(R.string.wallet_sent)
        "withdraw" -> getString(R.string.wallet_withdrawn)
        else -> kind
    }

    private fun timeAgo(ts: Long): String {
        if (ts <= 0) return ""
        val sec = (System.currentTimeMillis() / 1000 - ts).coerceAtLeast(0)
        return when {
            sec < 60 -> getString(R.string.time_just_now)
            sec < 3600 -> getString(R.string.time_minutes_ago, sec / 60)
            sec < 86400 -> getString(R.string.time_hours_ago, sec / 3600)
            else -> getString(R.string.time_days_ago, sec / 86400)
        }
    }

    // ---------------- actions ----------------

    private fun action(mode: String) {
        if (!BuildConfig.WALLET_ENABLED) {
            toast(getString(R.string.err_service_unavailable))
            return
        }
        val field = input(this, getString(R.string.wallet_amount_hint), InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
        val sendTo: android.widget.EditText? =
            if (mode == "send") input(this, getString(R.string.wallet_to_hint)) else null

        val wrap = vertical(this, 0)
        val pad = dp(this, 20)
        wrap.setPadding(pad, dp(this, 8), pad, dp(this, 8))
        if (sendTo != null) wrap.addView(sendTo)
        wrap.addView(field)
        wrap.addView(space(this, 4))

        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(if (mode == "topup") getString(R.string.wallet_topup)
            else if (mode == "send") getString(R.string.wallet_send)
            else getString(R.string.wallet_withdraw))
            .setView(wrap)
            .setPositiveButton(R.string.ok) { _, _ ->
                val amount = field.text.toString().toDoubleOrNull()
                if (amount == null || amount <= 0) {
                    toast(getString(R.string.err_bad_amount))
                    return@setPositiveButton
                }
                if (mode == "send") {
                    val to = sendTo?.text?.toString()?.trim() ?: ""
                    if (to.isBlank()) {
                        toast(getString(R.string.err_no_such_user))
                        return@setPositiveButton
                    }
                    doSend(amount, to)
                } else {
                    doTopupOrWithdraw(mode, amount)
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .create()
        dialog.show()
    }

    private fun doSend(amount: Double, to: String) {
        lifecycleScope.launch {
            try {
                Api.post("/wallet/send", JSONObject().put("amount", amount).put("to", to))
                toast(getString(R.string.wallet_sent_ok))
                loadWallet()
            } catch (e: Exception) {
                toast(friendlyError(e))
            }
        }
    }

    private fun doTopupOrWithdraw(mode: String, amount: Double) {
        lifecycleScope.launch {
            try {
                Api.post("/wallet/$mode", JSONObject().put("amount", amount))
                toast(getString(R.string.wallet_done))
                loadWallet()
            } catch (e: Exception) {
                toast(friendlyError(e))
            }
        }
    }

    private fun friendlyError(e: Exception): String {
        val msg = (e as? app.gagachat.mobile.net.Api.ApiError)?.message ?: e.message
        return when (msg) {
            "insufficient_funds" -> getString(R.string.err_insufficient_funds)
            "no_such_user" -> getString(R.string.err_no_such_user)
            "bad_amount" -> getString(R.string.err_bad_amount)
            "self_send" -> getString(R.string.err_self_send)
            else -> getString(R.string.err_network)
        }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
}
