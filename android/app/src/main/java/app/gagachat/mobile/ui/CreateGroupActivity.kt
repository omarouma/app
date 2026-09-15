package app.gagachat.mobile.ui

import android.content.Intent
import android.os.Bundle
import android.widget.ScrollView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.R
import app.gagachat.mobile.net.Api
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class CreateGroupActivity:AppCompatActivity(){
    override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState)
        val body=Ui.vertical(this,20);val scroll=ScrollView(this);scroll.addView(body);setContentView(scroll)
        body.addView(Ui.title(this,getString(R.string.create_group)));body.addView(Ui.subtitle(this,getString(R.string.create_group_hint)))
        body.addView(Ui.space(this,16));val title=Ui.input(this,getString(R.string.group_title));body.addView(title)
        val users=Ui.input(this,getString(R.string.group_members_hint)).apply{setSingleLine(false);minLines=3};body.addView(users)
        body.addView(Ui.button(this,getString(R.string.create_group)){lifecycleScope.launch{try{
            val names=users.text.toString().split(',', '\n').map{it.trim().removePrefix("@").lowercase()}.filter{it.isNotBlank()}
            val a=JSONArray();names.forEach{a.put(it)}
            val group=Api.post("/chats/group",JSONObject().put("title",title.text.toString().trim()).put("usernames",a))
            startActivity(Intent(this@CreateGroupActivity,ChatActivity::class.java).putExtra("chat_id",group.optString("id"))
                .putExtra("title",group.optString("title")).putExtra("type","group"));finish()
        }catch(e:Exception){Toast.makeText(this@CreateGroupActivity,e.message?:getString(R.string.err_network),Toast.LENGTH_LONG).show()}}})
    }
}
