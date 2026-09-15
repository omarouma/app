package app.gagachat.mobile.ui

import android.os.Bundle
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import androidx.appcompat.app.AppCompatActivity
import app.gagachat.mobile.R
import app.gagachat.mobile.prefs.AppPrefs

/** Controls notification behavior in the Android client, with private previews by default. */
class NotificationSettingsActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val body = Ui.vertical(this, 20)
        val scroll = ScrollView(this).apply { addView(body) }
        setContentView(scroll)

        body.addView(Ui.title(this, getString(R.string.notification_settings)))
        body.addView(Ui.subtitle(this, getString(R.string.notification_settings_hint)))
        body.addView(Ui.space(this, 16))
        addSwitch(body, R.string.message_notifications, AppPrefs.messageNotifications(this)) {
            AppPrefs.setMessageNotifications(this, it)
        }
        addSwitch(body, R.string.message_previews, AppPrefs.messagePreviews(this)) {
            AppPrefs.setMessagePreviews(this, it)
        }
        body.addView(Ui.space(this, 12))
        body.addView(Ui.subtitle(this, getString(R.string.call_notifications_note)))
    }

    private fun addSwitch(body: LinearLayout, label: Int, checked: Boolean, save: (Boolean) -> Unit) {
        val toggle = Switch(this).apply {
            text = getString(label)
            isChecked = checked
            setOnCheckedChangeListener { _, on -> save(on) }
            setPadding(0, Ui.dp(this@NotificationSettingsActivity, 12), 0, Ui.dp(this@NotificationSettingsActivity, 12))
        }
        body.addView(toggle, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }
}
