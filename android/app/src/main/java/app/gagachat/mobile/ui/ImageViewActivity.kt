package app.gagachat.mobile.ui

import android.Manifest
import android.content.ContentValues
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import app.gagachat.mobile.R
import app.gagachat.mobile.ui.Ui.dp
import app.gagachat.mobile.ui.Ui.text
import coil.imageLoader
import coil.load
import coil.request.ImageRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Full-screen image viewer for chat attachments. Relative URLs are prefixed
 * with Api.baseUrl. Supports saving to the public gallery (MediaStore) with
 * runtime permission on API <= 28.
 */
class ImageViewActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
    }

    private var url: String = ""
    private var fullUrl: String = ""
    private var caption: TextView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        url = intent.getStringExtra(EXTRA_URL) ?: ""
        val t = intent.getStringExtra(EXTRA_TITLE) ?: getString(R.string.photo)
        if (url.isBlank()) { finish(); return }

        // resolve relative uploads (e.g. /files/xxx.jpg)
        fullUrl = if (url.startsWith("http")) url else app.gagachat.mobile.net.Api.baseUrl.trimEnd('/') + url

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)

        // header bar
        val bar = LinearLayout(this)
        bar.orientation = LinearLayout.HORIZONTAL
        bar.gravity = Gravity.CENTER_VERTICAL
        bar.setPadding(dp(this, 8), dp(this, 12), dp(this, 8), dp(this, 8))
        bar.setBackgroundColor(0x66000000)

        val back = text(this, "‹", 26f, bold = true, color = Color.WHITE)
        back.setPadding(dp(this, 10), 0, dp(this, 10), 0)
        back.setOnClickListener { finish() }
        bar.addView(back)

        caption = text(this, t, 16f, color = Color.WHITE)
        caption!!.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        bar.addView(caption)

        val save = text(this, getString(R.string.save), 14f, bold = true, color = Color.WHITE)
        save.setPadding(dp(this, 14), 0, dp(this, 14), 0)
        save.setOnClickListener { requestSave() }
        bar.addView(save)

        root.addView(bar, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))

        // image
        val iv = android.widget.ImageView(this)
        iv.scaleType = android.widget.ImageView.ScaleType.FIT_CENTER
        iv.load(fullUrl) {
            crossfade(true)
            placeholder(android.R.drawable.ic_menu_gallery)
        }
        root.addView(iv, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        setContentView(root)
    }

    // ---------------- save to gallery ----------------

    private fun requestSave() {
        if (Build.VERSION.SDK_INT >= 29) {
            saveImage()
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
            == PackageManager.PERMISSION_GRANTED) {
            saveImage()
        } else {
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), 4401)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 4401) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                saveImage()
            } else {
                Toast.makeText(this, getString(R.string.err_permission), Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun saveImage() {
        lifecycleScope.launch {
            try {
                val request = ImageRequest.Builder(this@ImageViewActivity).data(fullUrl).build()
                val drawable = imageLoader.execute(request).drawable
                    ?: throw IllegalStateException("image not loaded")
                val bmp = (drawable as? android.graphics.drawable.BitmapDrawable)?.bitmap
                    ?: throw IllegalStateException("bitmap unavailable")
                withContext(Dispatchers.IO) { writeToGallery(bmp) }
                Toast.makeText(this@ImageViewActivity, getString(R.string.saved), Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this@ImageViewActivity, getString(R.string.err_network), Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun writeToGallery(bmp: android.graphics.Bitmap) {
        if (Build.VERSION.SDK_INT >= 29) {
            val values = ContentValues().apply {
                put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, "gagachat_${System.currentTimeMillis()}.jpg")
                put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/GaGaChat")
            }
            val uri = contentResolver.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("cannot insert")
            contentResolver.openOutputStream(uri)?.use { out ->
                bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 92, out)
            }
        } else {
            @Suppress("DEPRECATION")
            val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
            val folder = File(dir, "GaGaChat")
            if (!folder.exists()) folder.mkdirs()
            val f = File(folder, "gagachat_${System.currentTimeMillis()}.jpg")
            f.outputStream().use { out -> bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 92, out) }
            val values = ContentValues().apply {
                put(android.provider.MediaStore.Images.Media.DATA, f.absolutePath)
            }
            contentResolver.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
        }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
}
