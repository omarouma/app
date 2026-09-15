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
import app.gagachat.mobile.prefs.SessionStore
import kotlinx.coroutines.launch
import org.json.JSONObject

class GroupActivity:AppCompatActivity(){
    private val chatId by lazy{intent.getStringExtra("chat_id")?:""};private lateinit var body:LinearLayout
    override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);val s=ScrollView(this);body=Ui.vertical(this,20);s.addView(body);setContentView(s);load()}
    private fun load(){lifecycleScope.launch{try{val g=Api.get("/chats/$chatId/group");render(g)}catch(e:Exception){toast(e.message?:getString(R.string.err_network))}}}
    private fun render(g:JSONObject){body.removeAllViews();body.addView(Ui.title(this,g.optString("title",getString(R.string.group_info))))
        val members=g.optJSONArray("members")?:return;val me=runCatching{JSONObject(SessionStore.me?:"{}").optString("id")}.getOrDefault("")
        var owner=false;for(i in 0 until members.length()){val u=members.getJSONObject(i);if(u.optString("id")==me&&u.optString("role")=="owner")owner=true}
        if(owner){val field=Ui.input(this,getString(R.string.username_hint));val row=Ui.horizontal(this);row.addView(field,LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1f));row.addView(Ui.button(this,getString(R.string.add)){action{Api.post("/chats/$chatId/members",JSONObject().put("username",field.text.toString()));load()}});body.addView(row)}
        body.addView(Ui.space(this,12));for(i in 0 until members.length()){val u=members.getJSONObject(i);val row=Ui.horizontal(this);row.addView(Ui.text(this,"${u.optString("display_name")} · ${u.optString("role")}",15f),LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1f));if(owner&&u.optString("role")!="owner")row.addView(Ui.button(this,getString(R.string.remove),false){action{Api.delete("/chats/$chatId/members/${u.optString("id")}");load()}});body.addView(row)}}
    private fun action(x:suspend()->Unit){lifecycleScope.launch{try{x()}catch(e:Exception){toast(e.message?:getString(R.string.err_network))}}};private fun toast(s:String)=Toast.makeText(this,s,Toast.LENGTH_LONG).show()
}
