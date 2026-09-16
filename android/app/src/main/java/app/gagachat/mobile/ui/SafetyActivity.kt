package app.gagachat.mobile.ui

import android.os.Bundle
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.R
import app.gagachat.mobile.net.Api
import kotlinx.coroutines.launch
import org.json.JSONObject

/** User-controlled block list and abuse reporting backed by the production API. */
class SafetyActivity : AppCompatActivity() {
    private lateinit var content: LinearLayout
    private lateinit var username: android.widget.EditText
    private lateinit var details: android.widget.EditText
    private lateinit var blockedList: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val scroll=ScrollView(this)
        content=Ui.vertical(this,0).apply { setPadding(Ui.dp(this@SafetyActivity,20),Ui.dp(this@SafetyActivity,24),Ui.dp(this@SafetyActivity,20),Ui.dp(this@SafetyActivity,32)) }
        scroll.addView(content); setContentView(scroll)
        content.addView(Ui.title(this,getString(R.string.safety_title)))
        content.addView(Ui.subtitle(this,getString(R.string.safety_subtitle)))
        content.addView(Ui.space(this,18))
        username=Ui.input(this,getString(R.string.username_hint)); content.addView(username)
        content.addView(Ui.space(this,8))
        val buttons=Ui.horizontal(this)
        buttons.addView(Ui.button(this,getString(R.string.block_user)){ block() },LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1f))
        buttons.addView(Ui.button(this,getString(R.string.report_user),false){ report() },LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1f))
        content.addView(buttons)
        details=Ui.input(this,getString(R.string.report_details)).apply { setSingleLine(false); minLines=2 }
        content.addView(details); content.addView(Ui.space(this,20))
        content.addView(Ui.text(this,getString(R.string.blocked_users),12f,true,Ui.primaryColor(this)))
        blockedList=Ui.vertical(this,0); content.addView(blockedList)
        loadBlocked()
    }

    private fun normalized()=username.text.toString().trim().removePrefix("@").lowercase()
    private fun block()=runAction {
        if(normalized().isBlank()) throw IllegalArgumentException(getString(R.string.username_hint))
        Api.post("/blocks",JSONObject().put("username",normalized())); loadBlocked()
    }
    private fun report()=runAction {
        if(normalized().isBlank()) throw IllegalArgumentException(getString(R.string.username_hint))
        Api.post("/reports",JSONObject().put("username",normalized()).put("category","other").put("details",details.text.toString().trim()))
    }
    private fun runAction(action:suspend ()->Unit){ lifecycleScope.launch { try { action(); Toast.makeText(this@SafetyActivity,R.string.done,Toast.LENGTH_SHORT).show() } catch(e:Exception){ Toast.makeText(this@SafetyActivity,e.message?:getString(R.string.err_network),Toast.LENGTH_LONG).show() } } }
    private fun loadBlocked(){ lifecycleScope.launch { try {
        val rows=Api.getArray("/blocks"); blockedList.removeAllViews()
        for(i in 0 until rows.length()) { val u=rows.getJSONObject(i); val row=Ui.horizontal(this@SafetyActivity)
            row.addView(Ui.text(this@SafetyActivity,"${u.optString("display_name")}  @${u.optString("username")}",15f),LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1f))
            row.addView(Ui.button(this@SafetyActivity,getString(R.string.unblock),false){ runAction { Api.delete("/blocks/${u.optString("id")}"); loadBlocked() } })
            blockedList.addView(row)
        }
        if(rows.length()==0) blockedList.addView(Ui.subtitle(this@SafetyActivity,getString(R.string.no_blocked_users)))
    } catch(_:Exception){ Toast.makeText(this@SafetyActivity,R.string.err_network,Toast.LENGTH_SHORT).show() } } }
}
