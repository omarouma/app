package app.gagachat.mobile.ui

import android.content.Intent
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

class SearchActivity:AppCompatActivity(){
    private lateinit var results:LinearLayout
    override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);val root=Ui.vertical(this,16);setContentView(root)
        root.addView(Ui.title(this,getString(R.string.search)));val row=Ui.horizontal(this);val q=Ui.input(this,getString(R.string.search_hint));row.addView(q,LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1f));row.addView(Ui.button(this,getString(R.string.search)){search(q.text.toString())});root.addView(row)
        val scroll=ScrollView(this);results=Ui.vertical(this,4);scroll.addView(results);root.addView(scroll,LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1f))}
    private fun search(q:String){lifecycleScope.launch{try{val data=Api.get("/search?q=${android.net.Uri.encode(q.trim())}");results.removeAllViews()
        results.addView(Ui.text(this@SearchActivity,getString(R.string.people),14f,true,Ui.primaryColor(this@SearchActivity)));val users=data.optJSONArray("users")
        if(users!=null)for(i in 0 until users.length()){val u=users.getJSONObject(i);val line=Ui.text(this@SearchActivity,"${u.optString("display_name")}  @${u.optString("username")}",16f);results.addView(line)}
        results.addView(Ui.space(this@SearchActivity,12));results.addView(Ui.text(this@SearchActivity,getString(R.string.messages),14f,true,Ui.primaryColor(this@SearchActivity)));val messages=data.optJSONArray("messages")
        if(messages!=null)for(i in 0 until messages.length()){val m=messages.getJSONObject(i);val line=Ui.text(this@SearchActivity,m.optString("text"),15f);line.setOnClickListener{startActivity(Intent(this@SearchActivity,ChatActivity::class.java).putExtra("chat_id",m.optString("chat_id")).putExtra("title",m.optString("title",getString(R.string.chat))).putExtra("type",m.optString("type","dm")))};results.addView(line)}
    }catch(e:Exception){Toast.makeText(this@SearchActivity,e.message?:getString(R.string.err_network),Toast.LENGTH_LONG).show()}}}
}
