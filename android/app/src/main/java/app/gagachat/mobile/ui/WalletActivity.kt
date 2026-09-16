package app.gagachat.mobile.ui

import android.graphics.Color
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
import app.gagachat.mobile.ui.Ui.dp
import app.gagachat.mobile.ui.Ui.input
import app.gagachat.mobile.ui.Ui.space
import app.gagachat.mobile.ui.Ui.text
import app.gagachat.mobile.ui.Ui.vertical
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Wallet screen, restyled to the LINE Coins design language: a yellow coin
 * hero with the balance, a Buy action, and Purchase history / Coin usage
 * history tabs over the transaction list.
 */
class WalletActivity : AppCompatActivity() {

    private lateinit var content: LinearLayout
    private var balanceView: TextView? = null
    private var rateView: TextView? = null
    private var historyList: LinearLayout? = null
    private var progressView: android.view.View? = null
    private var tabPurchase: TextView? = null
    private var tabUsage: TextView? = null
    private var activeTab = 0
    private var lastHistory: org.json.JSONArray = org.json.JSONArray()

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
        val root = vertical(this, 0)
        root.setBackgroundColor(Ui.lineBg(this))
        root.addView(Ui.topBar(this, getString(R.string.coins), onBack = { finish() }))
        val body = vertical(this, 0)
        body.setPadding(dp(this, 24), dp(this, 32), dp(this, 24), dp(this, 32))
        body.addView(text(this, getString(R.string.wallet_coming_soon_title), 20f, bold = true,
            color = Ui.lineText(this)))
        body.addView(space(this, 14))
        body.addView(text(this, getString(R.string.wallet_coming_soon_body), 14f,
            color = Ui.lineTextSecondary(this)))
        root.addView(body)
        setContentView(root)
    }

    private fun buildUi() {
        val root = vertical(this, 0)
        root.setBackgroundColor(Ui.lineBg(this))
        root.addView(Ui.topBar(this, getString(R.string.coins), onBack = { finish() }))

        val scroll = ScrollView(this)
        content = vertical(this, 0)
        content.setPadding(0, 0, 0, dp(this, 32))
        scroll.addView(content)
        root.addView(scroll, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        // ---------------- coin hero ----------------
        val hero = vertical(this, 0).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(this@WalletActivity, 24), dp(this@WalletActivity, 28),
                dp(this@WalletActivity, 24), dp(this@WalletActivity, 24))
        }
        hero.addView(Ui.iconCircle(this, R.drawable.ic_coin, Ui.lineCoinYellow(this), 72, Color.WHITE))
        balanceView = text(this, "\u2026", 34f, bold = true, color = Ui.lineText(this)).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(this@WalletActivity, 14), 0, 0)
        }
        hero.addView(balanceView)
        rateView = text(this, "", 12f, color = Ui.lineTextSecondary(this)).apply {
            gravity = Gravity.CENTER
        }
        hero.addView(rateView)

        val buyBtn = Ui.greenButton(this, getString(R.string.buy)) { action("topup") }
        val blp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        blp.topMargin = dp(this, 16)
        hero.addView(buyBtn, blp)
        content.addView(hero)
        content.addView(Ui.divider(this, 0))

        // ---------------- quick actions ----------------
        val actions = Ui.horizontal(this).apply {
            gravity = Gravity.CENTER
            setPadding(dp(this@WalletActivity, 8), dp(this@WalletActivity, 16),
                dp(this@WalletActivity, 8), dp(this@WalletActivity, 16))
        }
        actions.addView(actionCell(R.drawable.ic_card, getString(R.string.wallet_topup)) { action("topup") },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        actions.addView(actionCell(R.drawable.ic_arrow_forward, getString(R.string.wallet_send)) { action("send") },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        actions.addView(actionCell(R.drawable.ic_save, getString(R.string.wallet_withdraw)) { action("withdraw") },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        content.addView(actions)
        content.addView(Ui.divider(this, 0))

        // ---------------- history tabs ----------------
        val tabs = Ui.horizontal(this).apply {
            setPadding(dp(this@WalletActivity, 16), dp(this@WalletActivity, 14),
                dp(this@WalletActivity, 16), dp(this@WalletActivity, 6))
        }
        tabPurchase = tabLabel(getString(R.string.purchase_history), true) { selectTab(0) }
        tabUsage = tabLabel(getString(R.string.coin_usage_history), false) { selectTab(1) }
        tabs.addView(tabPurchase, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        tabs.addView(tabUsage, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        content.addView(tabs)
        content.addView(Ui.divider(this, 0))

        historyList = vertical(this, 0)
        historyList!!.setBackgroundColor(Ui.lineBg(this))
        content.addView(historyList)

        progressView = Ui.progress(this)
        progressView!!.visibility = android.view.View.GONE
        val pvLp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        pvLp.gravity = Gravity.CENTER
        content.addView(progressView, pvLp)
    }

    private fun tabLabel(label: String, active: Boolean, onClick: () -> Unit): TextView =
        text(this, label, 14f, bold = active,
            color = if (active) Ui.lineGreen(this) else Ui.lineTextSecondary(this)).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(this@WalletActivity, 8), 0, dp(this@WalletActivity, 8))
            isClickable = true
            setOnClickListener { onClick() }
        }

    private fun selectTab(idx: Int) {
        activeTab = idx
        tabPurchase?.let {
            it.setTextColor(if (idx == 0) Ui.lineGreen(this) else Ui.lineTextSecondary(this))
            it.setTypeface(it.typeface, if (idx == 0) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)
        }
        tabUsage?.let {
            it.setTextColor(if (idx == 1) Ui.lineGreen(this) else Ui.lineTextSecondary(this))
            it.setTypeface(it.typeface, if (idx == 1) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)
        }
        renderHistory(lastHistory)
    }

    private fun actionCell(iconRes: Int, label: String, onClick: () -> Unit): LinearLayout {
        val col = vertical(this, 0).apply {
            gravity = Gravity.CENTER
            isClickable = true
            setOnClickListener { onClick() }
        }
        col.addView(Ui.iconCircle(this, iconRes, Ui.lineGreenPale(this), 48, Ui.lineGreen(this)))
        col.addView(text(this, label, 12f, color = Ui.lineText(this)).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(this@WalletActivity, 8), 0, 0)
        })
        return col
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
                lastHistory = res.optJSONArray("history") ?: org.json.JSONArray()
                renderHistory(lastHistory)
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
        // filter by active tab: purchase = credits (topup), usage = debits
        val filtered = ArrayList<JSONObject>()
        for (i in 0 until hist.length()) {
            val row = hist.optJSONObject(i) ?: continue
            val kind = row.optString("kind")
            val isCredit = kind == "topup"
            if ((activeTab == 0 && isCredit) || (activeTab == 1 && !isCredit)) filtered.add(row)
        }
        if (filtered.isEmpty()) {
            list.addView(Ui.listRow(this, getString(R.string.wallet_no_history)))
            return
        }
        for ((i, row) in filtered.withIndex()) {
            val kind = row.optString("kind")
            val amount = row.optDouble("amount", 0.0)
            val createdAt = row.optLong("created_at")
            val isCredit = kind == "topup"
            val rowLayout = Ui.horizontal(this).apply {
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(this@WalletActivity, 16), dp(this@WalletActivity, 12),
                    dp(this@WalletActivity, 16), dp(this@WalletActivity, 12))
            }
            rowLayout.addView(Ui.iconCircle(this, if (isCredit) R.drawable.ic_coin else R.drawable.ic_arrow_forward,
                if (isCredit) Ui.lineCoinYellow(this) else Ui.lineGreenPale(this), 38,
                if (isCredit) Color.WHITE else Ui.lineGreen(this)))
            (rowLayout.getChildAt(0).layoutParams as LinearLayout.LayoutParams).rightMargin = dp(this, 14)
            val info = vertical(this, 0)
            info.addView(text(this, kindLabel(kind), 16f, color = Ui.lineText(this)))
            info.addView(text(this, timeAgo(createdAt), 12f, color = Ui.lineTextSecondary(this)))
            rowLayout.addView(info, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            val amtView = text(this,
                if (isCredit) "+%.2f".format(java.util.Locale.US, amount)
                else "-%.2f".format(java.util.Locale.US, amount),
                15f, bold = true,
                color = if (isCredit) Ui.lineGreen(this) else Ui.lineBadgeRed(this))
            rowLayout.addView(amtView)
            list.addView(rowLayout)
            if (i < filtered.size - 1) list.addView(Ui.divider(this, 68))
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
        val field = input(this, getString(R.string.wallet_amount_hint),
            InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
        val sendTo: android.widget.EditText? =
            if (mode == "send") input(this, getString(R.string.wallet_to_hint)) else null

        val wrap = vertical(this, 0)
        val pad = dp(this, 20)
        wrap.setPadding(pad, dp(this, 8), pad, dp(this, 8))
        if (sendTo != null) wrap.addView(sendTo)
        wrap.addView(field)
        wrap.addView(space(this, 4))

        androidx.appcompat.app.AlertDialog.Builder(this)
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
            .show()
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
