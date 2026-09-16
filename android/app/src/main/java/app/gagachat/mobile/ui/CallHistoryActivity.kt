package app.gagachat.mobile.ui

import android.os.Bundle
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
import java.text.DateFormat
import java.util.Date

class CallHistoryActivity:AppCompatActivity(){override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);val scroll=ScrollView(this);val body=Ui.vertical(this,20);scroll.addView(body);setContentView(scroll);body.addView(Ui.title(this,getString(R.string.call_history)));lifecycleScope.launch{try{val me=runCatching{JSONObject(SessionStore.me?:"{}").optString("id")}.getOrDefault("");val a=Api.getArray("/calls/history");if(a.length()==0)body.addView(Ui.subtitle(this@CallHistoryActivity,getString(R.string.no_call_history)));for(i in 0 until a.length()){val c=a.getJSONObject(i);val direction=if(c.optString("caller_id")==me)getString(R.string.outgoing) else getString(R.string.incoming);val type=if(c.optBoolean("video"))getString(R.string.video_call) else getString(R.string.audio_call);val whenText=DateFormat.getDateTimeInstance(DateFormat.MEDIUM,DateFormat.SHORT).format(Date(c.optLong("created_at")));body.addView(Ui.text(this@CallHistoryActivity,"${c.optString("peer_name")} · $direction · $type",15f,true));body.addView(Ui.subtitle(this@CallHistoryActivity,"$whenText · ${c.optString("status")}"));body.addView(Ui.space(this@CallHistoryActivity,10))}}catch(e:Exception){Toast.makeText(this@CallHistoryActivity,e.message?:getString(R.string.err_network),Toast.LENGTH_LONG).show()}}}}
