package app.gagachat.mobile.ui

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
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
 * LINE-style single-activity shell.
 *
 * Bottom navigation: Home · Chats · Calls · Me.
 *  - Home  : profile header, search bar w/ QR, Services row, Groups/Friends
 *  - Chats : search bar + conversation rows (avatar, preview, time, badge)
 *  - Calls : recent voice/video call rows
 *  - Me    : profile list rows (edit profile, QR, wallet, settings)
 *
 * Live updates via CallBus "main" channel. No layout XML (Ui toolkit).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var navItems: List<LinearLayout>
    private lateinit var pages: List<LinearLayout>
    private lateinit var tabScroll: ScrollView

    private lateinit var homeBody: LinearLayout
    private lateinit var chatList: LinearLayout
    private lateinit var callsBody: LinearLayout
    private lateinit var meBody: LinearLayout

    private var homeHeader: LinearLayout? = null
    private var chatsSearch: LinearLayout? = null

    private val chats = mutableListOf<Chat>()
    private val contacts = mutableListOf<Contact>()
    private var wallet: WalletInfo? = null
    private var me: Me? = null
    private var chatsLoadError: String? = null
    private var contactsLoadError: String? = null
    private var callsLoadError: String? = null
    private var recentCalls: List<JSONObject> = emptyList()
    private var currentTab = 0

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

        val frame = FrameLayout(ctx)
        homeBody = Ui.vertical(ctx, 0)
        chatList = Ui.vertical(ctx, 0)
        callsBody = Ui.vertical(ctx, 0)
        meBody = Ui.vertical(ctx, 0)
        pages = listOf(homeBody, chatList, callsBody, meBody)
        tabScroll = ScrollView(ctx).apply { isFillViewport = true }
        frame.addView(tabScroll)
        root.addView(frame, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        // ---- LINE bottom navigation bar ----
        val navBar = Ui.horizontal(ctx).apply {
            gravity = Gravity.CENTER
            setBackgroundColor(Ui.lineBg(ctx))
            setPadding(0, Ui.dp(ctx, 2), 0, Ui.dp(ctx, 2))
        }
        navBar.addView(Ui.divider(ctx), LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 1))
        val navRow = Ui.horizontal(ctx).apply { gravity = Gravity.CENTER }
        val home = Ui.bottomNavItem(ctx, R.drawable.ic_nav_home, getString(R.string.tab_home), true)
        val chat = Ui.bottomNavItem(ctx, R.drawable.ic_nav_chat, getString(R.string.tab_chats), false)
        val call = Ui.bottomNavItem(ctx, R.drawable.ic_nav_call, getString(R.string.tab_calls), false)
        val meItem = Ui.bottomNavItem(ctx, R.drawable.ic_nav_me, getString(R.string.tab_me), false)
        navItems = listOf(home, chat, call, meItem)
        home.setOnClickListener { selectTab(0) }
        chat.setOnClickListener { selectTab(1) }
        call.setOnClickListener { selectTab(2) }
        meItem.setOnClickListener { selectTab(3) }
        for (item in navItems) navRow.addView(item,
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        navBar.addView(navRow)
        root.addView(navBar)

        setContentView(root)
        selectTab(0)
    }

    private fun selectTab(idx: Int) {
        val page = pages.getOrNull(idx) ?: return
        currentTab = idx
        if (tabScroll.getChildAt(0) !== page) {
            tabScroll.removeAllViews()
            tabScroll.addView(page)
            tabScroll.scrollTo(0, 0)
        }
        page.isVisible = true
        // Rebuild nav items so the active tint + badge refresh.
        val navRow = (navItems[0].parent as? LinearLayout) ?: return
        navRow.removeAllViews()
        val unread = chats.sumOf { it.unread }
        val labels = listOf(
            Triple(R.drawable.ic_nav_home, getString(R.string.tab_home), 0),
            Triple(R.drawable.ic_nav_chat, getString(R.string.tab_chats), unread),
            Triple(R.drawable.ic_nav_call, getString(R.string.tab_calls), 0),
            Triple(R.drawable.ic_nav_me, getString(R.string.tab_me), 0)
        )
        val rebuilt = mutableListOf<LinearLayout>()
        labels.forEachIndexed { i, (iconRes, label, badge) ->
            val item = Ui.bottomNavItem(this, iconRes, label, i == idx, badge)
            item.setOnClickListener { selectTab(i) }
            navRow.addView(item, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            rebuilt.add(item)
        }
        navItems = rebuilt
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
            refreshHomeUi()
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
            refreshHomeUi()
        }.onFailure { e ->
            contactsLoadError = e.message ?: getString(R.string.err_network)
            refreshHomeUi()
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

    private suspend fun loadMe() {
        runCatching {
            me = Me.fromJson(Api.get("/users/me"))
            refreshHomeUi()
            refreshMeUi()
        }
    }

    private suspend fun loadWallet() {
        if (!BuildConfig.WALLET_ENABLED) {
            wallet = null
            refreshMeUi()
            return
        }
        runCatching {
            wallet = WalletInfo.fromJson(Api.get("/wallet"))
            refreshMeUi()
        }
    }

    // ---------------- HOME ----------------

    private fun refreshHomeUi() {
        val ctx = this
        homeBody.removeAllViews()

        // ---- profile header ----
        val header = Ui.horizontal(ctx).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(Ui.dp(ctx, 16), Ui.dp(ctx, 14), Ui.dp(ctx, 16), Ui.dp(ctx, 10))
        }
        val m = me
        val avatar = AvatarView(ctx)
        avatar.bind(m?.displayName ?: "?", m?.avatarUrl, 52)
        header.addView(avatar)
        val nameCol = Ui.vertical(ctx).apply { setPadding(Ui.dp(ctx, 12), 0, 0, 0) }
        nameCol.addView(Ui.text(ctx, m?.displayName ?: getString(R.string.tab_me), 18f, bold = true,
            color = Ui.lineText(ctx)))
        nameCol.addView(Ui.text(ctx,
            m?.bio?.takeIf { it.isNotBlank() } ?: getString(R.string.status_message_hint),
            13f, color = Ui.lineTextSecondary(ctx)))
        header.addView(nameCol, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        header.addView(Ui.icon(ctx, R.drawable.ic_bookmark, 22, Ui.lineText(ctx)).apply {
            setPadding(Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8))
        })
        header.addView(Ui.icon(ctx, R.drawable.ic_bell, 22, Ui.lineText(ctx)).apply {
            setPadding(Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8))
            setOnClickListener { startActivity(Intent(this@MainActivity, NotificationSettingsActivity::class.java)) }
        })
        header.addView(Ui.icon(ctx, R.drawable.ic_person_add, 22, Ui.lineText(ctx)).apply {
            setPadding(Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8))
            setOnClickListener { startActivity(Intent(this@MainActivity, AddFriendsActivity::class.java)) }
        })
        header.addView(Ui.icon(ctx, R.drawable.ic_settings, 22, Ui.lineText(ctx)).apply {
            setPadding(Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8))
            setOnClickListener { startActivity(Intent(this@MainActivity, SettingsActivity::class.java)) }
        })
        homeBody.addView(header)

        // ---- search bar with QR ----
        val searchWrap = Ui.horizontal(ctx).apply {
            setPadding(Ui.dp(ctx, 16), Ui.dp(ctx, 4), Ui.dp(ctx, 16), Ui.dp(ctx, 12))
        }
        searchWrap.addView(Ui.searchBar(ctx, getString(R.string.search),
            onQr = { startActivity(Intent(this, AddFriendsActivity::class.java)) },
            onSearch = { startActivity(Intent(this, SearchActivity::class.java)) }),
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        homeBody.addView(searchWrap)

        // ---- Services row ----
        homeBody.addView(servicesRow())

        // ---- Groups ----
        homeBody.addView(Ui.sectionHeader(ctx, getString(R.string.groups)))
        val groupCount = chats.count { it.type == "group" }
        homeBody.addView(Ui.listRow(ctx, getString(R.string.groups),
            subtitle = if (groupCount > 0) getString(R.string.n_items, groupCount) else null,
            iconRes = R.drawable.ic_group, iconCircleBg = Ui.lineGreen(ctx),
            chevron = true) { startActivity(Intent(this, CreateGroupActivity::class.java)) })
        homeBody.addView(Ui.divider(ctx, 16))

        // ---- Friends ----
        homeBody.addView(Ui.sectionHeader(ctx, getString(R.string.friends)))
        homeBody.addView(Ui.listRow(ctx, getString(R.string.official_accounts),
            subtitle = getString(R.string.n_items, contacts.size),
            iconRes = R.drawable.ic_shield, iconCircleBg = Ui.lineGreen(ctx),
            chevron = true) { startActivity(Intent(this, AddFriendsActivity::class.java)) })
        homeBody.addView(Ui.divider(ctx, 16))
        homeBody.addView(Ui.listRow(ctx, getString(R.string.ready_to_add_friends),
            subtitle = getString(R.string.add_friends_by_qr),
            iconRes = R.drawable.ic_person_add, iconCircleBg = Ui.lineGreen(ctx),
            chevron = true) { startActivity(Intent(this, AddFriendsActivity::class.java)) })

        // ---- Add friends CTA ----
        val cta = Ui.vertical(ctx).apply {
            gravity = Gravity.CENTER
            setPadding(Ui.dp(ctx, 24), Ui.dp(ctx, 24), Ui.dp(ctx, 24), Ui.dp(ctx, 24))
        }
        cta.addView(Ui.text(ctx, getString(R.string.try_inviting), 16f, bold = true, color = Ui.lineText(ctx)))
        cta.addView(Ui.text(ctx, getString(R.string.try_inviting_body), 13f,
            color = Ui.lineTextSecondary(ctx)).apply {
            gravity = Gravity.CENTER
            setPadding(0, Ui.dp(ctx, 6), 0, Ui.dp(ctx, 14))
        })
        cta.addView(Ui.greenButton(ctx, getString(R.string.add_friends)) {
            startActivity(Intent(this, AddFriendsActivity::class.java))
        })
        homeBody.addView(cta)
        homeBody.addView(Ui.space(ctx, 24))
    }

    private fun servicesRow(): LinearLayout {
        val ctx = this
        val wrap = Ui.vertical(ctx)
        val head = Ui.horizontal(ctx).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(Ui.dp(ctx, 16), Ui.dp(ctx, 6), Ui.dp(ctx, 16), Ui.dp(ctx, 6))
        }
        head.addView(Ui.text(ctx, getString(R.string.services), 15f, bold = true, color = Ui.lineText(ctx)),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        head.addView(Ui.text(ctx, getString(R.string.see_all), 13f, color = Ui.lineTextSecondary(ctx)))
        wrap.addView(head)
        val row = Ui.horizontal(ctx).apply {
            setPadding(Ui.dp(ctx, 8), Ui.dp(ctx, 6), Ui.dp(ctx, 8), Ui.dp(ctx, 10))
        }
        fun service(iconRes: Int, label: String, onClick: () -> Unit): LinearLayout {
            val col = Ui.vertical(ctx).apply {
                gravity = Gravity.CENTER
                setOnClickListener { onClick() }
            }
            col.addView(Ui.iconCircle(ctx, iconRes, Ui.lineGreen(ctx), 52))
            col.addView(Ui.text(ctx, label, 12f, color = Ui.lineText(ctx)).apply {
                setPadding(0, Ui.dp(ctx, 6), 0, 0)
            })
            return col
        }
        row.addView(service(R.drawable.ic_sticker, getString(R.string.stickers)) {
            startActivity(Intent(this, AddFriendsActivity::class.java))
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        row.addView(service(R.drawable.ic_theme, getString(R.string.themes)) {
            startActivity(Intent(this, SettingsActivity::class.java))
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        row.addView(service(R.drawable.ic_shield, getString(R.string.official_accounts)) {
            startActivity(Intent(this, AddFriendsActivity::class.java))
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        wrap.addView(row)
        wrap.addView(Ui.divider(ctx))
        return wrap
    }

    // ---------------- CHATS ----------------

    private fun refreshChatsUi() {
        val ctx = this
        chatList.removeAllViews()

        val head = Ui.horizontal(ctx).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(Ui.dp(ctx, 16), Ui.dp(ctx, 12), Ui.dp(ctx, 16), Ui.dp(ctx, 8))
        }
        head.addView(Ui.text(ctx, getString(R.string.tab_chats), 20f, bold = true, color = Ui.lineText(ctx)),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        head.addView(Ui.icon(ctx, R.drawable.ic_camera, 22, Ui.lineText(ctx)).apply {
            setPadding(Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8))
        })
        head.addView(Ui.icon(ctx, R.drawable.ic_plus, 22, Ui.lineText(ctx)).apply {
            setPadding(Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8))
            setOnClickListener { startActivity(Intent(this@MainActivity, CreateGroupActivity::class.java)) }
        })
        chatList.addView(head)

        val searchWrap = Ui.horizontal(ctx).apply {
            setPadding(Ui.dp(ctx, 16), 0, Ui.dp(ctx, 16), Ui.dp(ctx, 10))
        }
        searchWrap.addView(Ui.searchBar(ctx, getString(R.string.search),
            onSearch = { startActivity(Intent(this, SearchActivity::class.java)) }),
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        chatList.addView(searchWrap)

        if (chats.isEmpty()) {
            chatList.addView(chatsLoadError?.let { errorPanel(it) }
                ?: emptyHint(getString(R.string.no_chats_hint)))
            return
        }
        chats.sortedByDescending { it.lastMessageAt ?: 0 }.forEach { c ->
            val row = Ui.horizontal(ctx).apply {
                setPadding(Ui.dp(ctx, 16), Ui.dp(ctx, 12), Ui.dp(ctx, 16), Ui.dp(ctx, 12))
                gravity = Gravity.CENTER_VERTICAL
            }
            val avatar = AvatarView(ctx)
            avatar.bind(c.title, c.avatarUrl, 48)
            row.addView(avatar)
            val mid = Ui.vertical(ctx)
            mid.addView(Ui.text(ctx, c.title, 16f, bold = true, color = Ui.lineText(ctx)))
            mid.addView(Ui.text(ctx, c.lastMessage ?: getString(R.string.chat_tap_to_open), 13f,
                color = Ui.lineTextSecondary(ctx)).apply { maxLines = 1 })
            val lpMid = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            lpMid.leftMargin = Ui.dp(ctx, 12)
            mid.layoutParams = lpMid
            row.addView(mid)
            val right = Ui.vertical(ctx).apply { gravity = Gravity.END }
            val ts = c.lastMessageAt ?: 0
            if (ts > 0) right.addView(Ui.text(ctx, shortTime(ts), 11f, color = Ui.lineTextTertiary(ctx)))
            if (c.unread > 0) {
                right.addView(Ui.badge(ctx, c.unread, Ui.lineGreen(ctx)).apply {
                    setPadding(Ui.dp(ctx, 6), Ui.dp(ctx, 2), Ui.dp(ctx, 6), Ui.dp(ctx, 2))
                })
            }
            row.addView(right)
            row.setOnClickListener {
                app.gagachat.mobile.realtime.NotifManagerCompat.cancelForChat(c.id)
                startActivity(Intent(this, ChatActivity::class.java)
                    .putExtra("chat_id", c.id)
                    .putExtra("title", c.title)
                    .putExtra("type", c.type)
                    .putExtra("peer_id", c.peerId))
            }
            chatList.addView(row)
            chatList.addView(Ui.divider(ctx, 76))
        }
    }

    // ---------------- CALLS ----------------

    private fun refreshCallsUi() {
        val ctx = this
        callsBody.removeAllViews()
        val head = Ui.horizontal(ctx).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(Ui.dp(ctx, 16), Ui.dp(ctx, 12), Ui.dp(ctx, 16), Ui.dp(ctx, 8))
        }
        head.addView(Ui.text(ctx, getString(R.string.tab_calls), 20f, bold = true, color = Ui.lineText(ctx)),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        head.addView(Ui.icon(ctx, R.drawable.ic_person_add, 22, Ui.lineText(ctx)).apply {
            setPadding(Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8), Ui.dp(ctx, 8))
            setOnClickListener { startActivity(Intent(this@MainActivity, AddFriendsActivity::class.java)) }
        })
        callsBody.addView(head)
        callsBody.addView(Ui.divider(ctx))

        val error = callsLoadError
        if (error != null) {
            callsBody.addView(errorPanel(error))
            return
        }
        if (recentCalls.isEmpty()) {
            callsBody.addView(emptyHint(getString(R.string.no_call_history)))
            return
        }
        recentCalls.take(30).forEach { call ->
            val video = call.optBoolean("video")
            val name = call.optString("peer_name").ifBlank { getString(R.string.tab_calls) }
            val status = call.optString("status")
            val row = Ui.listRow(ctx, name,
                subtitle = (if (video) getString(R.string.video_call) else getString(R.string.audio_call)) +
                    if (status.isNotBlank()) " · $status" else "",
                iconRes = if (video) R.drawable.ic_camera else R.drawable.ic_nav_call,
                iconCircleBg = Ui.lineGreen(ctx),
                chevron = true) {
                startActivity(Intent(this, CallHistoryActivity::class.java))
            }
            callsBody.addView(row)
            callsBody.addView(Ui.divider(ctx, 68))
        }
    }

    // ---------------- ME ----------------

    private fun refreshMeUi() {
        val ctx = this
        meBody.removeAllViews()
        val m = me

        // teal gradient banner with avatar + name
        val banner = Ui.vertical(ctx).apply {
            gravity = Gravity.CENTER
            setPadding(0, Ui.dp(ctx, 28), 0, Ui.dp(ctx, 24))
            background = GradientBanner.banner(ctx)
        }
        val avatar = AvatarView(ctx)
        avatar.bind(m?.displayName ?: "?", m?.avatarUrl, 84)
        banner.addView(avatar, LinearLayout.LayoutParams(Ui.dp(ctx, 84), Ui.dp(ctx, 84)))
        banner.addView(Ui.text(ctx, m?.displayName ?: getString(R.string.tab_me), 20f, bold = true,
            color = android.graphics.Color.WHITE).apply {
            setPadding(0, Ui.dp(ctx, 12), 0, 0)
        })
        banner.addView(Ui.text(ctx, "@" + (m?.username ?: ""), 13f,
            color = 0xCCFFFFFF.toInt()))
        meBody.addView(banner)

        meBody.addView(Ui.space(ctx, 8))
        meBody.addView(Ui.listRow(ctx, getString(R.string.edit_profile),
            subtitle = getString(R.string.profile_subtitle),
            iconRes = R.drawable.ic_edit, iconCircleBg = Ui.lineGreen(ctx), chevron = true) {
            startActivity(Intent(this, ProfileActivity::class.java))
        })
        meBody.addView(Ui.divider(ctx, 68))
        meBody.addView(Ui.listRow(ctx, getString(R.string.my_qr_title),
            iconRes = R.drawable.ic_qr, iconCircleBg = Ui.lineGreen(ctx), chevron = true) {
            startActivity(Intent(this, AddFriendsActivity::class.java))
        })
        meBody.addView(Ui.divider(ctx, 68))
        meBody.addView(Ui.listRow(ctx, getString(R.string.add_friends),
            iconRes = R.drawable.ic_person_add, iconCircleBg = Ui.lineGreen(ctx), chevron = true) {
            startActivity(Intent(this, AddFriendsActivity::class.java))
        })
        meBody.addView(Ui.divider(ctx, 68))
        meBody.addView(Ui.listRow(ctx, getString(R.string.tab_wallet),
            subtitle = if (BuildConfig.WALLET_ENABLED) getString(R.string.wallet_subtitle)
                else getString(R.string.wallet_coming_soon_title),
            iconRes = R.drawable.ic_coin, iconCircleBg = Ui.lineCoinYellow(ctx), chevron = true) {
            startActivity(Intent(this, WalletActivity::class.java))
        })
        meBody.addView(Ui.divider(ctx, 68))
        meBody.addView(Ui.listRow(ctx, getString(R.string.settings),
            subtitle = getString(R.string.settings_subtitle),
            iconRes = R.drawable.ic_settings, iconCircleBg = Ui.lineGreen(ctx), chevron = true) {
            startActivity(Intent(this, SettingsActivity::class.java))
        })
        meBody.addView(Ui.divider(ctx, 68))
        meBody.addView(Ui.listRow(ctx, getString(R.string.safety_title),
            subtitle = getString(R.string.safety_subtitle),
            iconRes = R.drawable.ic_shield, iconCircleBg = Ui.lineGreen(ctx), chevron = true) {
            startActivity(Intent(this, SafetyActivity::class.java))
        })
        meBody.addView(Ui.space(ctx, 24))
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

    private fun handleDeepLink(intent: Intent) {
        val data = intent.data ?: return
        if (data.scheme == "gaga" && data.host == "u") {
            val username = data.pathSegments.firstOrNull()?.lowercase() ?: return
            if (username.matches(Regex("^[a-z0-9_]{3,24}$"))) {
                startActivity(Intent(this, AddFriendsActivity::class.java).putExtra("username", username))
            }
            return
        }
        if (data.scheme == "gaga" && data.host == "chat") {
            val chatId = data.pathSegments.firstOrNull() ?: return
            startActivity(Intent(this, ChatActivity::class.java)
                .putExtra("chat_id", chatId)
                .putExtra("title", ""))
        }
    }

    private fun shortTime(tsSeconds: Long): String {
        val now = System.currentTimeMillis() / 1000
        val diff = (now - tsSeconds).coerceAtLeast(0)
        return when {
            diff < 86400 -> java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
                .format(java.util.Date(tsSeconds * 1000))
            diff < 86400 * 7 -> java.text.SimpleDateFormat("EEE", java.util.Locale.getDefault())
                .format(java.util.Date(tsSeconds * 1000))
            else -> java.text.SimpleDateFormat("M/d", java.util.Locale.getDefault())
                .format(java.util.Date(tsSeconds * 1000))
        }
    }

    private fun emptyHint(s: String): TextView =
        Ui.text(this, s, 14f, color = Ui.lineTextSecondary(this)).apply {
            gravity = Gravity.CENTER
            val pad = Ui.dp(this@MainActivity, 32)
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

    private fun toast(s: String) =
        android.widget.Toast.makeText(this, s, android.widget.Toast.LENGTH_SHORT).show()
}
