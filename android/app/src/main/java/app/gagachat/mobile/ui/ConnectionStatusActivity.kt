package app.gagachat.mobile.ui

import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.R
import app.gagachat.mobile.net.Api
import kotlinx.coroutines.launch
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/** Read-only server check for users when authentication cannot reach the GaGa API. */
class ConnectionStatusActivity : AppCompatActivity() {
    private lateinit var result: TextView
    private lateinit var retry: android.widget.Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val body = Ui.vertical(this, 24)
        setContentView(ScrollView(this).apply { addView(body) })
        body.addView(Ui.title(this, getString(R.string.connection_title)))
        body.addView(Ui.subtitle(this, getString(R.string.connection_hint)))
        body.addView(Ui.space(this, 18))
        result = Ui.text(this, getString(R.string.connection_checking), 16f)
        body.addView(result)
        body.addView(Ui.space(this, 18))
        retry = Ui.button(this, getString(R.string.retry)) { check() }
        body.addView(retry)
        check()
    }

    private fun check() {
        retry.isEnabled = false
        result.text = getString(R.string.connection_checking)
        lifecycleScope.launch {
            try {
                val health = Api.get("/health")
                if (!health.optBoolean("ok")) {
                    result.text = getString(R.string.connection_server_unhealthy)
                    return@launch
                }
                val ready = Api.get("/ready")
                result.text = if (ready.optBoolean("ready"))
                    getString(R.string.connection_ready) else getString(R.string.connection_starting)
            } catch (e: Exception) {
                result.text = when (e) {
                    is UnknownHostException -> getString(R.string.err_server_dns)
                    is SocketTimeoutException, is ConnectException -> getString(R.string.err_server_unreachable)
                    is SSLException -> getString(R.string.err_server_tls)
                    is Api.ApiError -> if (e.status == 503)
                        getString(R.string.connection_starting)
                        else getString(R.string.connection_http_error, e.status)
                    else -> getString(R.string.err_network)
                }
            } finally {
                retry.isEnabled = true
            }
        }
    }
}
