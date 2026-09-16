package app.gagachat.mobile.realtime

import android.os.Handler
import android.os.Looper
import app.gagachat.mobile.net.Api
import app.gagachat.mobile.prefs.SessionStore
import kotlinx.coroutines.*
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Single socket, ordered callbacks, refresh on 401/4001 and bounded reconnect backoff. */
class GaGaWs(private val events: (JSONObject) -> Unit) : WebSocketListener() {
    private val main = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var ws: WebSocket? = null
    private var backoffMs = 1_000L
    private var closed = false
    private var refreshing = false
    private var connectedToken: String? = null
    private val reconnect = Runnable { connect() }
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(0, TimeUnit.SECONDS)
        .pingInterval(25, TimeUnit.SECONDS).build()

    fun connect() {
        if (closed || refreshing || !SessionStore.isLoggedIn()) return
        main.removeCallbacks(reconnect)
        ws?.cancel()
        connectedToken = SessionStore.token
        ws = client.newWebSocket(Request.Builder().url(Api.wsUrl())
            .header("User-Agent", "GaGaChat/Android")
            .header("Authorization", "Bearer ${SessionStore.token}").build(), this)
    }

    fun send(json: JSONObject): Boolean = !closed && ws?.send(json.toString()) == true

    fun close(code: Int = 1000, reason: String = "client_close") {
        closed = true
        main.removeCallbacks(reconnect)
        scope.cancel()
        ws?.close(code, reason)
        ws = null
    }

    override fun onOpen(webSocket: WebSocket, response: Response) {
        main.post {
            if (closed || webSocket !== ws) { webSocket.cancel(); return@post }
            backoffMs = 1_000L
            send(JSONObject().put("type", "presence").put("data", JSONObject().put("state", "online")))
        }
    }

    override fun onMessage(webSocket: WebSocket, text: String) {
        main.post {
            if (!closed && webSocket === ws) runCatching {
                val event = JSONObject(text)
                if (event.optString("type") != "pong") events(event)
            }
        }
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        main.post { disconnected(webSocket, response?.code == 401) }
    }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
        webSocket.close(code, reason)
    }

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
        main.post { disconnected(webSocket, code == 4001) }
    }

    private fun disconnected(socket: WebSocket, unauthorized: Boolean) {
        if (closed || socket !== ws) return
        ws = null
        if (unauthorized && !refreshing) {
            refreshing = true
            val failedToken = connectedToken
            scope.launch {
                try {
                    if (Api.refreshTokens(failedToken)) backoffMs = 1_000L
                } finally {
                    refreshing = false
                    scheduleReconnect()
                }
            }
        } else scheduleReconnect()
    }

    private fun scheduleReconnect() {
        if (closed || !SessionStore.isLoggedIn()) return
        main.removeCallbacks(reconnect)
        main.postDelayed(reconnect, backoffMs)
        backoffMs = (backoffMs * 2).coerceAtMost(120_000L)
    }
}
