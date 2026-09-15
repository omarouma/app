package app.gagachat.mobile.ui

import android.Manifest
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.ScrollView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.R
import app.gagachat.mobile.net.Api
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Voice note composer: local recording and playback before an authenticated OSS upload. */
class VoiceNoteActivity : AppCompatActivity() {
    private var recorder: MediaRecorder? = null
    private var player: MediaPlayer? = null
    private var file: File? = null
    private lateinit var status: android.widget.TextView
    private lateinit var recordBtn: View
    private lateinit var sendBtn: View
    private lateinit var previewBtn: View
    private lateinit var discardBtn: View
    private var recording = false
    private var sending = false
    private var noteClientId: String = UUID.randomUUID().toString()

    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startRecording() else toast(getString(R.string.err_permission))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val body = Ui.vertical(this, 20)
        setContentView(ScrollView(this).apply { addView(body) })
        body.addView(Ui.title(this, getString(R.string.voice_note_title)))
        body.addView(Ui.subtitle(this, getString(R.string.voice_note_hint)))
        body.addView(Ui.space(this, 20))
        status = Ui.subtitle(this, getString(R.string.voice_note_ready))
        body.addView(status)
        body.addView(Ui.space(this, 12))
        recordBtn = Ui.button(this, getString(R.string.voice_note_record)) {
            if (recording) stopRecording() else permission.launch(Manifest.permission.RECORD_AUDIO)
        }.also { body.addView(it) }
        previewBtn = Ui.button(this, getString(R.string.voice_note_preview), filled = false) {
            preview()
        }.also { body.addView(it) }
        sendBtn = Ui.button(this, getString(R.string.voice_note_send)) { send() }.also { body.addView(it) }
        discardBtn = Ui.button(this, getString(R.string.voice_note_discard), filled = false) {
            if (recording) stopRecording()
            file?.delete()
            file = null
            status.text = getString(R.string.voice_note_ready)
            updateButtons()
        }.also { body.addView(it) }
        updateButtons()
    }

    private fun updateButtons() {
        recordBtn.isEnabled = !sending
        previewBtn.isEnabled = !recording && !sending && file?.exists() == true
        sendBtn.isEnabled = !recording && !sending && file?.exists() == true
        discardBtn.isEnabled = !sending && file?.exists() == true
        (recordBtn as? android.widget.Button)?.setText(if (recording) R.string.voice_note_stop else R.string.voice_note_record)
    }

    private fun startRecording() {
        player?.release()
        player = null
        file?.delete()
        noteClientId = UUID.randomUUID().toString()
        val output = File(cacheDir, "voice_${System.currentTimeMillis()}.m4a")
        try {
            val r = createRecorder()
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setOutputFile(output.absolutePath)
            r.prepare()
            r.start()
            recorder = r
            file = output
            recording = true
            status.text = getString(R.string.voice_note_recording)
        } catch (e: Exception) {
            recorder?.release()
            recorder = null
            output.delete()
            file = null
            toast(getString(R.string.voice_note_error))
        }
        updateButtons()
    }

    private fun stopRecording() {
        if (!recording) return
        try {
            recorder?.stop()
            status.text = getString(R.string.voice_note_ready_to_send)
        } catch (e: Exception) {
            file?.delete()
            file = null
            status.text = getString(R.string.voice_note_error)
        } finally {
            recorder?.release()
            recorder = null
            recording = false
            updateButtons()
        }
    }

    @Suppress("DEPRECATION")
    private fun createRecorder(): MediaRecorder =
        if (Build.VERSION.SDK_INT >= 31) MediaRecorder(this) else MediaRecorder()

    private fun preview() {
        val audio = file ?: return
        player?.release()
        player = MediaPlayer().apply {
            setDataSource(audio.absolutePath)
            prepare()
            start()
            setOnCompletionListener { it.release(); player = null }
        }
    }

    private fun send() {
        val audio = file ?: return
        val chatId = intent.getStringExtra("chat_id")?.takeIf { it.isNotBlank() } ?: return
        sending = true
        status.text = getString(R.string.uploading)
        updateButtons()
        lifecycleScope.launch {
            try {
                val ticket = Api.uploadFile(audio, "audio/mp4", "audio") { pct ->
                    runOnUiThread { status.text = getString(R.string.upload_progress, pct) }
                }
                val url = ticket.optString("url").takeIf { it.isNotBlank() }
                    ?: throw IllegalStateException("upload missing URL")
                Api.post("/chats/$chatId/messages", JSONObject()
                    .put("attachment_url", url)
                    .put("attachment_type", "audio")
                    .put("client_message_id", noteClientId))
                audio.delete()
                file = null
                setResult(RESULT_OK)
                finish()
            } catch (_: Exception) {
                status.text = getString(R.string.err_upload_failed)
                toast(getString(R.string.err_upload_failed))
            } finally {
                sending = false
                updateButtons()
            }
        }
    }

    override fun onDestroy() {
        if (recording) stopRecording()
        recorder?.release()
        player?.release()
        file?.delete()
        super.onDestroy()
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
