package app.gagachat.mobile.ui

import android.os.Bundle
import android.widget.ScrollView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import app.gagachat.mobile.R
import java.io.File

/** Clears temporary media copies only; messages and the encrypted outbox are preserved. */
class StorageActivity : AppCompatActivity() {
    private val temporaryPrefixes = listOf("attach_", "avatar_", "gaga_img_", "view_")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        render()
    }

    private fun temporaryMedia(): List<File> =
        cacheDir.listFiles()?.filter { file ->
            file.isFile && temporaryPrefixes.any { prefix -> file.name.startsWith(prefix) }
        } ?: emptyList()

    private fun render() {
        val body = Ui.vertical(this, 20)
        setContentView(ScrollView(this).apply { addView(body) })
        body.addView(Ui.title(this, getString(R.string.storage_title)))
        body.addView(Ui.subtitle(this, getString(R.string.storage_hint)))
        body.addView(Ui.space(this, 16))
        val bytes = temporaryMedia().sumOf { it.length() }
        body.addView(Ui.text(this, getString(R.string.storage_media_size, bytes / (1024.0 * 1024.0)), 18f, bold = true))
        body.addView(Ui.space(this, 16))
        body.addView(Ui.button(this, getString(R.string.clear_temp_media), filled = false) {
            AlertDialog.Builder(this).setTitle(R.string.clear_temp_media)
                .setMessage(R.string.clear_temp_media_confirm)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.clear_temp_media) { _, _ ->
                    temporaryMedia().forEach { it.delete() }
                    render()
                }.show()
        })
    }
}
