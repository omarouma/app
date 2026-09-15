package app.gagachat.mobile.ui

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.BuildConfig
import app.gagachat.mobile.R
import app.gagachat.mobile.model.Chat
import app.gagachat.mobile.model.Contact
import app.gagachat.mobile.model.Me
import app.gagachat.mobile.model.WalletInfo
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.prefs.SessionStore
import app.gagachat.mobile.realtime.CallBus
import app.gagachat.mobile.realtime.CurrentChat
import app.gagachat.mobile.realtime.GaGaService
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * FIX M-01/M-05: single-activity container with 4 tabs — Chats, Contacts, Wallet, Me.
 * Live updates via CallBus "main" channel. No layout XML (Ui toolkit).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var tabLabels: List<TextView>
    private lateinit var tabPages: List<LinearLayout>
    private lateinit var tabChatsBtn: TextView
    private lateinit var tabContactsBtn: TextView
    private lateinit var tabCallsBtn: TextView
    private lateinit var tabWalletBtn: TextView
    private lateinit var tabMeBtn: TextView

    private lateinit var chatList: LinearLayout
    private lateinit var contactList: LinearLayout
    private lateinit var callsBody: LinearLayout
    private lateinit var tabScroll: ScrollView
    private var walletBody: LinearLayout? = null
    private var meBody: LinearLayout? = null

    private val chats = mutableListOf<Chat>()
    private val contacts = mutableListOf<Contact>()
    private var wallet: WalletInfo? = null
    private var walletHistory: List<JSONObject> = emptyList()
    private var me: Me? = null
    // Keep network failures visible instead of silently rendering a blank tab.
    private var chatsLoadError: String? = null
    private var contactsLoadError: String? = null
    private var callsLoadError: String? = null
    private var recentCalls: List<JSONObject> = emptyList()

    private val mainListener: (JSONObject) -> Unit = { j ->
        when (j.optString("type")) {
            "message", "receipt", "message_deleted" -> lifecycleScope.launch { refreshChats() }
            "wallet" -> lifecycleScope.launch { loadWallet() }
            "presence" -> lifecycleScope.launch { refreshContacts() }
            "friend_request" -> lifecycleScope.launch { refreshContacts() }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!SessionStore.isLoggedIn()) {
            startActivity(Intent(this, AuthActivity::class.java))
            finish()
            return
        }

        GaGaService.start(this)
        buildUi()
        handleDeepLink(intent)
        CallBus.register("main", mainListener)
        lifecycleScope.launch { loadData() }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    override fun onResume() {
        super.onResume()
        if (!SessionStore.isLoggedIn() || !::tabScroll.isInitialized) return
        CurrentChat.id = null
        lifecycleScope.launch { loadData() }
    }

    override fun onDestroy() {
        CallBus.unregister("main", mainListener)
        super.onDestroy()
    }

    // ---------------- skeleton ----------------

    private fun buildUi() {
        val ctx = this
        val root = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }

        val header = Ui.horizontal(ctx).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(Ui.dp(ctx, 16), Ui.dp(ctx, 12), Ui.dp(ctx, 16), Ui.dp(ctx, 12))
            addView(ImageView(ctx).apply {
                setImageResource(R.drawable.gaga_logo_master)
                contentDescription = getString(R.string.app_name)
                scaleType = ImageView.ScaleType.FIT_CENTER
            }, LinearLayout.LayoutParams(Ui.dp(ctx, 48), Ui.dp(ctx, 48)).apply {
                marginEnd = Ui.dp(ctx, 12)
            })
            addView(Ui.vertical(ctx).apply {
                addView(Ui.title(ctx, getString(R.string.app_name)))
                addView(Ui.subtitle(ctx, getString(R.string.main_subtitle)))
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(Ui.text(ctx,"⌕",28f,true).apply{setPadding(Ui.dp(ctx,10),0,Ui.dp(ctx,10),0);setOnClickListener{startActivity(Intent(this@MainActivity,SearchActivity::class.java))}})
            addView(Ui.text(ctx,"☎",24f,true).apply{setPadding(Ui.dp(ctx,10),0,0,0);setOnClickListener{startActivity(Intent(this@MainActivity,CallHistoryActivity::class.java))}})
        }
        root.addView(header)

        val frame = FrameLayout(ctx)
        chatList = Ui.vertical(ctx, 12)
        contactList = Ui.vertical(ctx, 12)
        callsBody = Ui.vertical(ctx, 16)
        walletBody = Ui.vertical(ctx, 16)
        meBody = Ui.vertical(ctx, 16)
        tabPages = listOf(chatList, callsBody, contactList, walletBody!!, meBody!!)
        tabScroll = ScrollView(ctx).apply { isFillViewport = true }
        frame.addView(tabScroll)
        root.addView(frame, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        val tabRow = Ui.horizontal(ctx).apply {
            gravity = Gravity.CENTER
            setPadding(0, Ui.dp(ctx, 8), 0, Ui.dp(ctx, 8))
        }
        fun tabBtn(labelRes: Int): TextView = Ui.text(ctx, getString(labelRes), 11f, bold = true).apply {
            val pad = Ui.dp(ctx, 6)
            setPadding(pad, Ui.dp(ctx, 8), pad, Ui.dp(ctx, 8))
        }
        tabChatsBtn = tabBtn(R.string.tab_chats)
        tabCallsBtn = tabBtn(R.string.tab_calls)
        tabContactsBtn = tabBtn(R.string.tab_contacts)
        tabWalletBtn = tabBtn(R.string.tab_wallet)
        tabMeBtn = tabBtn(R.string.tab_me)
        tabLabels = listOf(tabChatsBtn, tabCallsBtn, tabContactsBtn, tabWalletBtn, tabMeBtn)
        tabChatsBtn.setOnClickListener { selectTab(0) }
        tabCallsBtn.setOnClickListener { selectTab(1) }
        tabContactsBtn.setOnClickListener { selectTab(2) }
        tabWalletBtn.setOnClickListener { selectTab(3) }
        tabMeBtn.setOnClickListener { selectTab(4) }
        for (tab in tabLabels) tabRow.addView(tab,
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        root.addView(tabRow)

        setContentView(root)
        selectTab(0)
    }

    private fun selectTab(idx: Int) {
        val page = tabPages.getOrNull(idx) ?: return
        // No page has a parent on first launch; the selected page is detached
        // on each switch. Always address the container itself.
        if (tabScroll.getChildAt(0) !== page) {
            tabScroll.removeAllViews()
            tabScroll.addView(page)
            tabScroll.scrollTo(0, 0)
        }
        page.isVisible = true
        tabLabels.forEachIndexed { i, t ->
            t.background = if (i == idx) Ui.pillBackground(Ui.primaryColor(this), 20f) else null
            t.setTextColor(if (i == idx) Ui.onPrimaryColor(this) else Ui.secondaryColor(this))
        }
    }

    // ---------------- data ----------------

    private suspend fun loadData() {
        refreshChats()
        refreshContacts()
        refreshCalls()
        loadMe()
        loadWallet()
    }

    private suspend fun refreshChats() {
        runCatching {
            val arr = Api.getArray("/chats")
            val list = mutableListOf<Chat>()
            for (i in 0 until arr.length()) list.add(Chat.fromJson(arr.getJSONObject(i)))
            chats.clear()
            chats.addAll(list)
            chatsLoadError = null
            refreshChatsUi()
        }.onFailure { e ->
            chatsLoadError = e.message ?: getString(R.string.err_network)
            refreshChatsUi()
        }
    }

    private suspend fun refreshContacts() {
        runCatching {
            val arr = Api.getArray("/contacts")
            val list = mutableListOf<Contact>()
            for (i in 0 until arr.length()) list.add(Contact.fromJson(arr.getJSONObject(i)))
            contacts.clear()
            contacts.addAll(list)
            contactsLoadError = null
            refreshContactsUi()
        }.onFailure { e ->
            contactsLoadError = e.message ?: getString(R.string.err_network)
            refreshContactsUi()
        }
    }

    private suspend fun refreshCalls() {
        runCatching {
            val arr = Api.getArray("/calls/history")
            recentCalls = (0 until arr.length()).map { arr.getJSONObject(it) }
            callsLoadError = null
        }.onFailure { e -> callsLoadError = e.message ?: getString(R.string.err_network) }
        refreshCallsUi()
    }

    private fun refreshCallsUi() {
        callsBody.removeAllViews()
        callsBody.addView(Ui.title(this, getString(R.string.tab_calls)))
        callsBody.addView(Ui.subtitle(this, getString(R.string.calls_subtitle)))
        callsBody.addView(Ui.space(this, 8))
        callsBody.addView(Ui.button(this, getString(R.string.call_history), filled = false) {
            startActivity(Intent(this, CallHistoryActivity::class.java))
        })
        callsBody.addView(Ui.button(this, getString(R.string.add_friends), filled = false) {
            startActivity(Intent(this, AddFriendsActivity::class.java))
        })
        val error = callsLoadError
        if (error != null) {
            callsBody.addView(errorPanel(error))
            return
        }
        if (recentCalls.isEmpty()) {
            callsBody.addView(emptyHint(getString(R.string.no_call_history)))
            return
        }
        recentCalls.take(20).forEach { call ->
            val type = if (call.optBoolean("video")) getString(R.string.video_call) else getString(R.string.audio_call)
            val name = call.optString("peer_name").ifBlank { getString(R.string.tab_calls) }
            val row = Ui.vertical(this, 12).apply {
                addView(Ui.text(this@MainActivity, "$name · $type", 16f, bold = true))
                addView(Ui.subtitle(this@MainActivity, call.optString("status")))
            }
            callsBody.addView(Ui.card(this, row))
            callsBody.addView(Ui.space(this, 8))
        }
    }

    private suspend fun loadMe() {
        runCatching {
            me = Me.fromJson(Api.get("/users/me"))
            refreshMeUi()
        }
    }

    private suspend fun loadWallet() {
        if (!BuildConfig.WALLET_ENABLED) {
            wallet = null
            walletHistory = emptyList()
            refreshWalletUi()
            return
        }
        runCatching {
            val res = Api.get("/wallet")
            wallet = WalletInfo.fromJson(res)
            val hist = res.optJSONArray("history") ?: org.json.JSONArray()
            walletHistory = (0 until hist.length()).map { hist.getJSONObject(it) }
            refreshWalletUi()
        }
    }

    // ---------------- list rendering ----------------

    private fun refreshChatsUi() {
        val ctx = this
        chatList.removeAllViews()
        chatList.addView(Ui.button(ctx,getString(R.string.create_group),filled=false){startActivity(Intent(this,CreateGroupActivity::class.java))})
        chatList.addView(Ui.space(ctx,8))
        if (chats.isEmpty()) {
            chatList.addView(chatsLoadError?.let { errorPanel(it) }
                ?: emptyHint(getString(R.string.no_chats_hint)))
            return
        }
        chats.sortedByDescending { it.lastMessageAt ?: 0 }.forEach { c ->
            val row = Ui.horizontal(ctx).apply {
                setPadding(Ui.dp(ctx, 8), Ui.dp(ctx, 10), Ui.dp(ctx, 8), Ui.dp(ctx, 10))
                gravity = Gravity.CENTER_VERTICAL
            }
            val avatar = AvatarView(ctx)
            avatar.bind(c.title, c.avatarUrl, 44)
            row.addView(avatar)
            val mid = Ui.vertical(ctx)
            mid.addView(Ui.text(ctx, c.title, 16f, bold = true))
            mid.addView(Ui.subtitle(ctx, c.lastMessage ?: getString(R.string.chat_tap_to_open)))
            val lpMid = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            lpMid.leftMargin = Ui.dp(ctx, 12)
            mid.layoutParams = lpMid
            row.addView(mid)
            if (c.unread > 0) {
                val badge = Ui.text(ctx, c.unread.coerceAtMost(99).toString(), 12f, bold = true,
                    color = Ui.onPrimaryColor(this)).apply {
                    background = Ui.pillBackground(Ui.primaryColor(ctx), 12f)
                    val p = Ui.dp(ctx, 7)
                    setPadding(p, Ui.dp(ctx, 2), p, Ui.dp(ctx, 2))
                }
                row.addView(badge)
            }
            row.setOnClickListener {
                NotifManagerCompatForChat(c.id)
                startActivity(Intent(this, ChatActivity::class.java)
                    .putExtra("chat_id", c.id)
                    .putExtra("title", c.title)
                    .putExtra("type",c.type)
                    .putExtra("peer_id",c.peerId))
            }
            chatList.addView(Ui.card(ctx, row))
            chatList.addView(Ui.space(ctx, 8))
        }
    }

    private fun refreshContactsUi() {
        val ctx = this
        contactList.removeAllViews()
        contactList.addView(Ui.text(ctx, getString(R.string.tab_contacts), 18f, bold = true))
        contactList.addView(Ui.button(ctx, getString(R.string.add_friends)) {
            startActivity(Intent(this, AddFriendsActivity::class.java))
        })
        contactList.addView(Ui.space(ctx, 8))
        if (contacts.isEmpty()) {
            contactList.addView(contactsLoadError?.let { errorPanel(it) }
                ?: emptyHint(getString(R.string.no_contacts_hint)))
            return
        }
        contacts.forEach { c ->
            val row = Ui.horizontal(ctx).apply {
                setPadding(Ui.dp(ctx, 8), Ui.dp(ctx, 10), Ui.dp(ctx, 8), Ui.dp(ctx, 10))
                gravity = Gravity.CENTER_VERTICAL
            }
            val avatar = AvatarView(ctx)
            avatar.bind(c.displayName, c.avatarUrl, 40)
            row.addView(avatar)
            val mid = Ui.vertical(ctx)
            mid.addView(Ui.text(ctx, c.displayName, 15f, bold = true))
            mid.addView(Ui.subtitle(ctx, (if (c.online) "● " else "") + "@" + c.username))
            val lpMid = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            lpMid.leftMargin = Ui.dp(ctx, 12)
            mid.layoutParams = lpMid
            row.addView(mid)
            row.setOnClickListener { openDm(c.id, c.displayName) }
            contactList.addView(Ui.card(ctx, row))
            contactList.addView(Ui.space(ctx, 8))
        }
    }

    private fun refreshWalletUi() {
        val ctx = this
        val body = walletBody ?: return
        body.removeAllViews()
        if (!BuildConfig.WALLET_ENABLED) {
            body.addView(Ui.title(ctx, getString(R.string.wallet_coming_soon_title)))
            body.addView(Ui.space(ctx, 14))
            body.addView(Ui.subtitle(ctx, getString(R.string.wallet_coming_soon_body)))
            return
        }
        body.addView(Ui.title(ctx, getString(R.string.tab_wallet)))
        val w = wallet
        if (w != null) {
            val balance = Ui.text(ctx, "${w.symbol} %.2f".format(w.balance), 30f, bold = true,
                color = Ui.primaryColor(ctx))
            body.addView(balance)
            body.addView(Ui.subtitle(ctx, getString(R.string.wallet_rate, w.rateUsd)))
            body.addView(Ui.space(ctx, 12))
            body.addView(Ui.button(ctx, getString(R.string.wallet_open)) {
                startActivity(Intent(this, WalletActivity::class.java))
            })
        }
        body.addView(Ui.space(ctx, 12))
        body.addView(Ui.text(ctx, getString(R.string.wallet_recent), 15f, bold = true))
        walletHistory.take(20).forEach { tx ->
            val kind = tx.optString("kind")
            val amount = tx.optDouble("amount")
            val line = Ui.horizontal(ctx).apply {
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, Ui.dp(ctx, 6), 0, Ui.dp(ctx, 6))
            }
            line.addView(Ui.text(ctx, kind, 14f))
            val amt = Ui.text(ctx, "%+.2f".format(amount), 14f, bold = true,
                color = if (amount >= 0) 0xFF2E7D32.toInt() else 0xFFC62828.toInt())
            val lpAmt = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            lpAmt.gravity = Gravity.END
            amt.layoutParams = lpAmt
            line.addView(amt)
            body.addView(line)
        }
    }

    private fun refreshMeUi() {
        val ctx = this
        val body = meBody ?: return
        body.removeAllViews()
        val m = me
        body.addView(Ui.title(ctx, m?.displayName ?: getString(R.string.tab_me)))
        if (m != null) {
            val avatar = AvatarView(ctx)
            avatar.bind(m.displayName, m.avatarUrl, 64)
            val wrap = Ui.horizontal(ctx).apply { gravity = Gravity.CENTER_VERTICAL }
            wrap.addView(avatar)
            val t = Ui.vertical(ctx)
            t.addView(Ui.text(ctx, "@" + m.username, 15f))
            if (!m.bio.isNullOrBlank()) t.addView(Ui.subtitle(ctx, m.bio))
            val lpT = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            lpT.leftMargin = Ui.dp(ctx, 12)
            t.layoutParams = lpT
            wrap.addView(t)
            body.addView(wrap)
        }
        body.addView(Ui.space(ctx, 16))
        body.addView(Ui.button(ctx, getString(R.string.edit_profile)) {
            startActivity(Intent(this, ProfileActivity::class.java))
        })
        body.addView(Ui.space(ctx, 8))
        body.addView(Ui.button(ctx, getString(R.string.settings), filled = false) {
            startActivity(Intent(this, SettingsActivity::class.java))
        })
        body.addView(Ui.space(ctx, 8))
        body.addView(Ui.button(ctx, getString(R.string.add_friends), filled = false) {
            startActivity(Intent(this, AddFriendsActivity::class.java))
        })
    }

    // ---------------- helpers ----------------

    private fun openDm(peerId: String, title: String) {
        lifecycleScope.launch {
            runCatching {
                val chat = Api.post("/chats/dm", JSONObject().put("user_id", peerId))
                val chatId = chat.optString("id", chat.optString("chat_id"))
                if (chatId.isNotBlank()) {
                    startActivity(Intent(this@MainActivity, ChatActivity::class.java)
                        .putExtra("chat_id", chatId)
                        .putExtra("title", title))
                }
            }.onFailure { toast(getString(R.string.err_network)) }
        }
    }

    private fun NotifManagerCompatForChat(chatId: String) {
        // notification for this chat is cancelled when ChatActivity opens it
        app.gagachat.mobile.realtime.NotifManagerCompat.cancelForChat(chatId)
    }

    private fun handleDeepLink(intent: Intent) {
        val data = intent.data ?: return
        if (data.scheme == "gaga" && data.host == "chat") {
            val chatId = data.pathSegments.firstOrNull() ?: return
            startActivity(Intent(this, ChatActivity::class.java)
                .putExtra("chat_id", chatId)
                .putExtra("title", ""))
        }
    }

    private fun emptyHint(s: String): TextView =
        Ui.subtitle(this, s).apply {
            gravity = Gravity.CENTER
            val pad = Ui.dp(this@MainActivity, 24)
            setPadding(pad, pad, pad, pad)
        }

    private fun errorPanel(message: String): LinearLayout =
        Ui.vertical(this, 10).apply {
            gravity = Gravity.CENTER
            setPadding(Ui.dp(this@MainActivity, 24), Ui.dp(this@MainActivity, 24),
                Ui.dp(this@MainActivity, 24), Ui.dp(this@MainActivity, 24))
            addView(Ui.subtitle(this@MainActivity,
                getString(R.string.data_load_failed, message)))
            addView(Ui.button(this@MainActivity, getString(R.string.retry)) {
                lifecycleScope.launch { loadData() }
            })
        }

    private fun divider(): View =
        View(this).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1)
            setBackgroundColor(Ui.secondaryColor(this@MainActivity))
        }

    private fun toast(s: String) =
        android.widget.Toast.makeText(this, s, android.widget.Toast.LENGTH_SHORT).show()
}
