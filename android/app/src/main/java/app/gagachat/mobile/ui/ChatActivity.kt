package app.gagachat.mobile.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import coil.load
import app.gagachat.mobile.R
import app.gagachat.mobile.model.Me
import app.gagachat.mobile.model.Message
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.prefs.SessionStore
import app.gagachat.mobile.realtime.CallBus
import app.gagachat.mobile.realtime.CurrentChat
import app.gagachat.mobile.realtime.GaGaService
import app.gagachat.mobile.realtime.NotifManagerCompat
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * FIX C-08: chat screen with live WS updates, typing indicator, image attachments,
 * read receipts, and voice/video call entry points. No layout XML.
 */
class ChatActivity : AppCompatActivity() {

    private var chatId: String = ""
    private var chatTitle: String = ""
    private var peerId: String? = null
    private var peerName: String? = null
    private var chatType: String = "dm"
    private var myId: String = ""

    private lateinit var list: LinearLayout
    private lateinit var scroller: ScrollView
    private lateinit var input: EditText
    private lateinit var typingView: TextView
    private lateinit var statusView: TextView
    private lateinit var searchHint: TextView
    private var searchQuery: String = ""

    private val messages = mutableListOf<Message>()
    private var sending = false
    private var attachmentSending = false
    private var olderLoading = false
    private var oldestServerTimestamp: Long? = null
    private var oldestServerId: String? = null
    private var typingReset: Runnable? = null

    private val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let { sendAttachment(it, "image") }
    }
    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let { sendAttachment(it, if((contentResolver.getType(it)?:"").startsWith("audio/")) "audio" else "file") }
    }

    private val chatListener: (JSONObject) -> Unit = { j ->
        val d = j.optJSONObject("data") ?: JSONObject()
        when (j.optString("type")) {
            "message" -> {
                if (d.optString("chat_id") == chatId) {
                    appendMessage(Message.fromJson(d, myId))
                    markRead()
                }
            }
            "typing" -> {
                if (d.optString("chat_id") == chatId) showTyping()
            }
            "receipt" -> {
                if (d.optString("chat_id") == chatId) statusView.text = getString(R.string.read_receipt)
            }
            "message_deleted" -> if(d.optString("chat_id")==chatId) {
                messages.removeAll { it.id==d.optString("message_id") }; renderMessages()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        chatId = intent.getStringExtra("chat_id") ?: ""
        chatTitle = intent.getStringExtra("title") ?: getString(R.string.chat)
        peerId = intent.getStringExtra("peer_id")
        peerName = intent.getStringExtra("title")
        chatType = intent.getStringExtra("type") ?: "dm"
        if (chatId.isBlank()) { finish(); return }

        myId = runCatching { Me.fromJson(JSONObject(SessionStore.me ?: "{}")).id }.getOrDefault("")

        buildUi()
        CurrentChat.id = chatId
        NotifManagerCompat.registerChat(chatId, chatId.hashCode())
        CallBus.register("chat-$chatId", chatListener)

        lifecycleScope.launch {
            loadMessages()
            markRead()
            if (peerId == null) resolvePeer()
        }
    }

    override fun onResume() {
        super.onResume()
        CurrentChat.id = chatId
        lifecycleScope.launch { flushOutbox() }
    }

    override fun onPause() {
        if (::input.isInitialized) {
            runCatching { SessionStore.saveDraft(chatId, input.text.toString()) }
                .onFailure { toast(getString(R.string.err_network)) }
        }
        super.onPause()
        CurrentChat.id = null
    }

    override fun onDestroy() {
        CallBus.unregister("chat-$chatId", chatListener)
        super.onDestroy()
    }

    // ---------------- UI ----------------

    private fun buildUi() {
        val ctx = this
        val root = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }

        val header = Ui.horizontal(ctx).apply {
            setPadding(Ui.dp(ctx, 8), Ui.dp(ctx, 10), Ui.dp(ctx, 8), Ui.dp(ctx, 10))
            gravity = Gravity.CENTER_VERTICAL
        }
        header.addView(Ui.text(ctx, "‹", 26f, bold = true).apply {
            setOnClickListener { finish() }
            val p = Ui.dp(ctx, 10); setPadding(p, 0, p, 0)
        })
        val titleCol = Ui.vertical(ctx)
        val titleView = Ui.text(ctx, chatTitle, 18f, bold = true)
        statusView = Ui.subtitle(ctx, "")
        titleCol.addView(titleView)
        titleCol.addView(statusView)
        val lpT = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        lpT.leftMargin = Ui.dp(ctx, 8)
        titleCol.layoutParams = lpT
        header.addView(titleCol)
        if(chatType=="dm") {
            header.addView(iconBtn("📞") { startCall(false) })
            header.addView(iconBtn("📹") { startCall(true) })
        }
        if(chatType=="group") header.addView(iconBtn("⚙") { startActivity(Intent(this,GroupActivity::class.java).putExtra("chat_id",chatId)) })
        header.addView(iconBtn("⌕") { searchLoadedMessages() })
        root.addView(header)

        searchHint = Ui.subtitle(ctx, "").apply {
            setPadding(Ui.dp(ctx, 16), 0, Ui.dp(ctx, 16), Ui.dp(ctx, 4))
        }
        root.addView(searchHint)
        root.addView(Ui.text(ctx, getString(R.string.load_older_messages), 14f).apply {
            gravity = Gravity.CENTER
            val p = Ui.dp(ctx, 10); setPadding(p, p, p, p)
            setOnClickListener { lifecycleScope.launch { loadOlderMessages() } }
        })

        scroller = ScrollView(ctx)
        list = Ui.vertical(ctx, 12)
        scroller.addView(list)
        root.addView(scroller, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        typingView = Ui.subtitle(ctx, "")
        typingView.setPadding(Ui.dp(ctx, 16), 0, 0, Ui.dp(ctx, 2))
        root.addView(typingView)

        val composer = Ui.horizontal(ctx).apply {
            setPadding(Ui.dp(ctx, 8), Ui.dp(ctx, 6), Ui.dp(ctx, 8), Ui.dp(ctx, 6))
            gravity = Gravity.CENTER_VERTICAL
        }
        composer.addView(iconBtn("📷") { pickImage.launch("image/*") })
        composer.addView(iconBtn("📎") { pickFile.launch("*/*") })
        composer.addView(iconBtn("🎙") {
            startActivity(Intent(this, VoiceNoteActivity::class.java).putExtra("chat_id", chatId))
        })
        input = Ui.input(ctx, getString(R.string.message_hint),
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES)
        input.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        input.setText(SessionStore.draft(chatId))
        input.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                if (!s.isNullOrBlank()) sendTyping()
            }
        })
        composer.addView(input)
        composer.addView(iconBtn("➤") { sendText() })
        root.addView(composer)

        setContentView(root)
    }

    private fun iconBtn(label: String, onClick: () -> Unit): TextView =
        Ui.text(this, label, 22f).apply {
            setOnClickListener { onClick() }
            val p = Ui.dp(this@ChatActivity, 12)
            setPadding(p, 0, p, 0)
        }

    // ---------------- data ----------------

    private suspend fun loadMessages() {
        runCatching {
            val arr = Api.getArray("/chats/$chatId/messages")
            messages.clear()
            for (i in 0 until arr.length()) messages.add(Message.fromJson(arr.getJSONObject(i), myId))
            val oldest = messages.minWithOrNull(compareBy<Message> { it.createdAt }.thenBy { it.id })
            oldestServerTimestamp = oldest?.createdAt
            oldestServerId = oldest?.id
        }.onFailure { toast(getString(R.string.err_network)) }
        messages.filter { it.mine }.forEach { reconcilePendingMessage(it) }
        // Preserve visible pending messages after a server refresh or process restart.
        for (item in SessionStore.pendingTexts(chatId)) {
            val id = item.optString("client_id")
            if (id.isNotBlank() && messages.none { it.id == id }) {
                messages.add(Message(id, chatId, myId, "", item.optString("text"), null, null,
                    item.optLong("created_at"), true))
            }
        }
        renderMessages()
    }

    private suspend fun loadOlderMessages() {
        val before = oldestServerTimestamp ?: return
        if (olderLoading) return
        olderLoading = true
        try {
            val cursorId = oldestServerId ?: return
            val arr = Api.getArray("/chats/$chatId/messages?before=$before&before_id=${Uri.encode(cursorId)}")
            if (arr.length() == 0) {
                toast(getString(R.string.no_older_messages))
                return
            }
            val older = (0 until arr.length()).map { Message.fromJson(arr.getJSONObject(it), myId) }
            val oldest = older.minWith(compareBy<Message> { it.createdAt }.thenBy { it.id })
            oldestServerTimestamp = oldest.createdAt
            oldestServerId = oldest.id
            val ids = messages.map { it.id }.toSet()
            messages.addAll(0, older.filter { it.id !in ids })
            renderMessages()
            scroller.post { scroller.scrollTo(0, 0) }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (_: Exception) { toast(getString(R.string.err_network)) }
        finally { olderLoading = false }
    }

    private suspend fun resolvePeer() {
        runCatching {
            val arr = Api.getArray("/chats")
            for (i in 0 until arr.length()) {
                val c = arr.getJSONObject(i)
                if (c.optString("id") == chatId) {
                    peerId = c.optString("peer_id").takeIf { it.isNotBlank() }
                    break
                }
            }
        }
    }

    private fun markRead() {
        lifecycleScope.launch {
            runCatching { Api.post("/chats/$chatId/read") }
            NotifManagerCompat.cancelForChat(chatId)
        }
    }

    private fun renderMessages() {
        list.removeAllViews()
        val visible = if (searchQuery.isBlank()) messages else messages.filter {
            (it.text ?: "").contains(searchQuery, ignoreCase = true)
        }
        visible.forEach { renderMessage(it) }
        if (visible.isEmpty() && searchQuery.isNotBlank())
            list.addView(Ui.subtitle(this, getString(R.string.search_loaded_empty)))
        searchHint.text = if (searchQuery.isBlank()) "" else getString(R.string.search_loaded_hint, searchQuery)
        if (searchQuery.isBlank()) scrollToBottom() else scroller.post { scroller.scrollTo(0, 0) }
    }

    private fun searchLoadedMessages() {
        val field = Ui.input(this, getString(R.string.search_loaded_title)).apply { setText(searchQuery) }
        val wrap = android.widget.FrameLayout(this).apply {
            val p = Ui.dp(this@ChatActivity, 20)
            setPadding(p, p, p, p)
            addView(field)
        }
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(R.string.search_loaded_title)
            .setView(wrap)
            .setNegativeButton(R.string.clear_search) { _, _ -> searchQuery = ""; renderMessages() }
            .setPositiveButton(R.string.search_loaded_title) { _, _ ->
                searchQuery = field.text.toString().trim()
                renderMessages()
            }.show()
    }

    private fun renderMessage(m: Message) {
        if (m.attachmentUrl != null && m.attachmentType == "image") {
            val iv = ImageView(this)
            iv.layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 220)
            ).apply {
                setMargins(0, 0, 0, Ui.dp(this@ChatActivity, 4))
                gravity = if (m.mine) Gravity.END else Gravity.START
            }
            val attachmentUrl = m.attachmentUrl
            val base = Api.baseUrl
            val full = if (attachmentUrl.startsWith("http")) attachmentUrl else base + attachmentUrl
            iv.load(full) { crossfade(true) }
            iv.setOnClickListener {
                startActivity(Intent(this, ImageViewActivity::class.java).putExtra("url", full))
            }
            list.addView(iv)
            return
        }
        if(m.attachmentUrl!=null) {
            val label=if(m.attachmentType=="audio") getString(R.string.audio_attachment) else getString(R.string.file_attachment)
            val row=Ui.bubble(this,if(m.mine) 0xFFD6F5C8.toInt() else 0xFFEFF1F3.toInt(),m.mine)
            row.text="📎 $label  ${timeOf(m.createdAt)}"
            row.setOnClickListener { openPrivateAttachment(m) }
            if(m.mine) row.setOnLongClickListener{confirmDelete(m);true};list.addView(row);return
        }
        val outColor = 0xFFD6F5C8.toInt()
        val inColor = 0xFFEFF1F3.toInt()
        val bubble = Ui.bubble(this, if (m.mine) outColor else inColor, m.mine)
        val pending = SessionStore.pendingTexts(chatId).any { it.optString("client_id") == m.id }
        bubble.text = (m.text ?: "") + "  " + timeOf(m.createdAt) +
            if (pending) "\n" + getString(R.string.message_pending) else ""
        bubble.setTextColor(if (m.mine) 0xFF1B4620.toInt() else 0xFF202124.toInt())
        if(m.mine) bubble.setOnLongClickListener {
            if (pending) managePendingMessage(m) else confirmDelete(m)
            true
        }
        list.addView(bubble)
    }

    private fun openPrivateAttachment(message: Message) {
        val attachment = message.attachmentUrl ?: return
        val url = if (attachment.startsWith("https://")) attachment else Api.baseUrl + attachment
        val audio = message.attachmentType == "audio"
        val mime = if (audio) "audio/mp4" else "application/octet-stream"
        val extension = if (audio) "m4a" else "bin"
        val target = File(cacheDir, "view_${message.id.hashCode()}.$extension")
        lifecycleScope.launch {
            if (!Api.downloadToFile(url, target)) {
                toast(getString(R.string.err_upload_failed))
                return@launch
            }
            val uri = androidx.core.content.FileProvider.getUriForFile(
                this@ChatActivity, "$packageName.fileprovider", target)
            val open = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            try { startActivity(open) } catch (_: android.content.ActivityNotFoundException) {
                toast(getString(R.string.no_attachment_app))
            }
        }
    }

    private fun reconcilePendingMessage(m: Message) {
        val clientId = m.clientMessageId ?: return
        if (!m.mine || m.chatId != chatId || m.id == clientId) return
        runCatching { SessionStore.removePendingText(clientId) }
            .onFailure { toast(getString(R.string.err_network)) }
    }

    private fun appendMessage(m: Message) {
        reconcilePendingMessage(m)
        val replaced = m.mine && m.clientMessageId != null &&
            messages.removeAll { it.id == m.clientMessageId && it.id != m.id }
        if (replaced) renderMessages()
        if (messages.any { it.id == m.id }) return
        messages.add(m)
        renderMessage(m)
        scrollToBottom()
    }

    private fun scrollToBottom() {
        scroller.post { scroller.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    private fun timeOf(ts: Long): String {
        val millis = if (ts < 10_000_000_000L) ts * 1000 else ts
        return SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(millis))
    }

    // ---------------- actions ----------------

    private fun sendTyping() {
        val to = peerId ?: return
        val payload = JSONObject()
            .put("type", "typing")
            .put("data", JSONObject().put("chat_id", chatId).put("to", to))
        GaGaService.send(this, payload)
    }

    private fun showTyping() {
        typingView.text = getString(R.string.typing)
        typingReset?.let { typingView.removeCallbacks(it) }
        typingReset = Runnable {
            typingView.text = ""
        }.also { typingView.postDelayed(it, 3000) }
    }

    private fun sendText() {
        val text = input.text.toString().trim()
        if (text.isEmpty() || sending) return
        val clientId=UUID.randomUUID().toString()
        // Persist before clearing the composer or starting an interruptible network request.
        try {
            SessionStore.enqueueText(chatId,text,clientId)
        } catch (_: IllegalStateException) {
            toast(getString(R.string.err_network))
            return
        }
        sending = true
        input.setText("")
        lifecycleScope.launch {
            try {
                val res = Api.post("/chats/$chatId/messages", JSONObject()
                    .put("text", text)
                    .put("client_message_id", clientId))
                val msg = res.optJSONObject("message") ?: res
                SessionStore.removePendingText(clientId)
                appendMessage(Message.fromJson(msg, myId))
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                // WebSocket acknowledgement may arrive before the HTTP request times out.
                val acknowledged = messages.firstOrNull {
                    it.mine && it.chatId == chatId && it.clientMessageId == clientId
                }
                if (acknowledged != null) {
                    reconcilePendingMessage(acknowledged)
                    statusView.text = if (SessionStore.pendingTexts(chatId).isEmpty()) ""
                        else getString(R.string.message_queued)
                    return@launch
                }
                if(e is Api.ApiError && e.status in 400..499 && e.status != 408 && e.status != 429) {
                    toast(e.message ?: getString(R.string.err_network))
                } else {
                    app.gagachat.mobile.realtime.MessageOutboxWorker.schedule(this@ChatActivity)
                }
                appendMessage(Message(clientId,chatId,myId,"",text,null,null,System.currentTimeMillis(),true))
                statusView.text=getString(R.string.message_queued)
            } finally {
                sending = false
            }
        }
    }

    private suspend fun flushOutbox() {
        val pending=SessionStore.pendingTexts(chatId)
        if(pending.isEmpty()) return
        for(item in pending) {
            val id=item.optString("client_id"); if(id.isBlank()) continue
            try {
                val res=Api.post("/chats/$chatId/messages",JSONObject().put("text",item.optString("text")).put("client_message_id",id))
                SessionStore.removePendingText(id)
                val optimistic=messages.indexOfFirst { it.id==id }; if(optimistic>=0) messages.removeAt(optimistic)
                appendMessage(Message.fromJson(res.optJSONObject("message")?:res,myId))
            } catch(e:Exception) {
                // A failed request is not a delivery acknowledgement. Retain the queued message.
                if(e is Api.ApiError && e.status in 400..499 && e.status != 408 && e.status != 429) {
                    toast(e.message ?: getString(R.string.err_network))
                } else {
                    app.gagachat.mobile.realtime.MessageOutboxWorker.schedule(this@ChatActivity)
                }
                break
            }
        }
        statusView.text=if(SessionStore.pendingTexts(chatId).isEmpty()) "" else getString(R.string.message_queued)
        renderMessages()
    }

    private fun sendAttachment(uri: Uri, kind: String, clientId: String = UUID.randomUUID().toString()) {
        if (attachmentSending) return
        attachmentSending = true
        statusView.text = getString(R.string.uploading)
        lifecycleScope.launch {
            var file: File? = null
            try {
                file = withContext(Dispatchers.IO) { copyToCache(uri) }
                val mime = contentResolver.getType(uri) ?: if (kind == "image") "image/jpeg" else "application/octet-stream"
                val res = Api.uploadFile(file, mime, kind) { pct ->
                    runOnUiThread { statusView.text = getString(R.string.upload_progress, pct) }
                }
                val url = res.optString("url").takeIf { it.isNotBlank() }
                    ?: throw IllegalStateException("upload missing URL")
                Api.post("/chats/$chatId/messages", JSONObject()
                    .put("attachment_url", url)
                    .put("attachment_type", kind)
                    .put("client_message_id", clientId))
                statusView.text = ""
                loadMessages()
            } catch (e: Exception) {
                statusView.text = getString(R.string.err_upload_failed)
                val message = if (e is Api.ApiError && e.status == 400)
                    getString(R.string.attachment_unsupported) else getString(R.string.err_upload_failed)
                androidx.appcompat.app.AlertDialog.Builder(this@ChatActivity)
                    .setTitle(R.string.err_upload_failed)
                    .setMessage(message)
                    .setNegativeButton(R.string.cancel, null)
                    .setPositiveButton(R.string.retry) { _, _ -> sendAttachment(uri, kind, clientId) }
                    .show()
            } finally {
                withContext(Dispatchers.IO) { file?.delete() }
                attachmentSending = false
            }
        }
    }

    private fun managePendingMessage(message: Message) {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(R.string.message_pending)
            .setMessage(R.string.pending_message_help)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.retry) { _, _ ->
                lifecycleScope.launch { flushOutbox() }
            }
            .setNeutralButton(R.string.remove_local_queue) { _, _ ->
                if (sending) return@setNeutralButton
                try {
                    SessionStore.removePendingText(message.id)
                    messages.removeAll { it.id == message.id }
                    statusView.text = if (SessionStore.pendingTexts(chatId).isEmpty()) ""
                        else getString(R.string.message_queued)
                    renderMessages()
                } catch (_: IllegalStateException) { toast(getString(R.string.err_network)) }
            }.show()
    }

    private fun confirmDelete(message:Message) {
        androidx.appcompat.app.AlertDialog.Builder(this).setTitle(R.string.delete_message)
            .setMessage(R.string.delete_message_confirm).setNegativeButton(R.string.cancel,null)
            .setPositiveButton(R.string.delete_message){_,_->lifecycleScope.launch{try{Api.delete("/chats/$chatId/messages/${message.id}");messages.removeAll{it.id==message.id};renderMessages()}catch(e:Exception){toast(e.message?:getString(R.string.err_network))}}}.show()
    }

    private fun copyToCache(uri: Uri): File {
        val f = File(cacheDir, "attach_${System.currentTimeMillis()}.img")
        val stream = contentResolver.openInputStream(uri)
            ?: throw java.io.IOException("attachment unavailable")
        stream.use { ins ->
            FileOutputStream(f).use { outs -> ins.copyTo(outs) }
        }
        if (f.length() == 0L) { f.delete(); throw java.io.IOException("empty attachment") }
        return f
    }

    private fun startCall(video: Boolean) {
        val callee = peerId
        if (callee.isNullOrBlank()) {
            toast(getString(R.string.err_no_peer))
            return
        }
        lifecycleScope.launch {
            try {
                val res = Api.post("/calls", JSONObject()
                    .put("callee_id", callee)
                    .put("video", video))
                val callId = res.optString("call_id", res.optString("id"))
                val dbId = res.optString("id")
                if (callId.isNotBlank()) {
                    startActivity(Intent(this@ChatActivity, CallActivity::class.java)
                        .putExtra("call_id", callId)
                        .putExtra("call_db_id", dbId)
                        .putExtra("peer_id", callee)
                        .putExtra("peer_name", chatTitle)
                        .putExtra("video", video)
                        .putExtra("caller", true))
                }
            } catch (e: Exception) {
                toast(getString(R.string.err_network))
            }
        }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
}
