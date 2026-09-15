package app.gagachat.mobile.ui

import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.material.button.MaterialButton
import com.google.android.material.progressindicator.CircularProgressIndicator
import kotlin.math.roundToInt

/**
 * Tiny programmatic-UI toolkit so the app needs zero layout XML files.
 * All colors resolve from Theme.GaGaChat (Material3 attributes).
 */
object Ui {

    fun dp(ctx: Context, v: Int): Int = (v * ctx.resources.displayMetrics.density).roundToInt()

    fun vertical(ctx: Context, paddingDp: Int = 0): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        if (paddingDp > 0) setPadding(dp(ctx, paddingDp), dp(ctx, paddingDp), dp(ctx, paddingDp), dp(ctx, paddingDp))
    }

    fun horizontal(ctx: Context): LinearLayout = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }

    fun text(ctx: Context, s: String, sizeSp: Float = 16f, bold: Boolean = false, color: Int? = null): TextView =
        TextView(ctx).apply {
            text = s
            setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
            setTypeface(typeface, if (bold) Typeface.BOLD else Typeface.NORMAL)
            color?.let { setTextColor(it) }
        }

    fun title(ctx: Context, s: String): TextView = text(ctx, s, 22f, bold = true)

    fun subtitle(ctx: Context, s: String): TextView = text(ctx, s, 13f, color = secondaryColor(ctx))

    fun secondaryColor(ctx: Context): Int {
        val tv = TypedValue()
        ctx.theme.resolveAttribute(com.google.android.material.R.attr.colorOnSurfaceVariant, tv, true)
        return tv.data
    }

    fun primaryColor(ctx: Context): Int {
        val tv = TypedValue()
        ctx.theme.resolveAttribute(com.google.android.material.R.attr.colorPrimary, tv, true)
        return tv.data
    }

    fun onPrimaryColor(ctx: Context): Int {
        val tv = TypedValue()
        ctx.theme.resolveAttribute(com.google.android.material.R.attr.colorOnPrimary, tv, true)
        return tv.data
    }

    fun input(ctx: Context, hint: String, inputType: Int = android.text.InputType.TYPE_CLASS_TEXT): EditText =
        EditText(ctx).apply {
            this.hint = hint
            this.inputType = inputType
            setSingleLine(true)
        }

    fun button(ctx: Context, label: String, filled: Boolean = true, onClick: (View) -> Unit): MaterialButton {
        val b = MaterialButton(ctx, null, com.google.android.material.R.attr.materialButtonStyle)
        b.text = label
        if (!filled) {
            // tonal look: primary-container tint (theme attr, always resolvable)
            val tv = TypedValue()
            ctx.theme.resolveAttribute(
                com.google.android.material.R.attr.colorPrimaryContainer, tv, true)
            b.backgroundTintList = android.content.res.ColorStateList.valueOf(tv.data)
        }
        b.setOnClickListener(onClick)
        return b
    }

    fun spinner(ctx: Context): android.widget.AutoCompleteTextView =
        android.widget.AutoCompleteTextView(ctx).apply {
            setSingleLine(true)
            inputType = android.text.InputType.TYPE_NULL
        }

    fun progress(ctx: Context): CircularProgressIndicator =
        CircularProgressIndicator(ctx).apply { isIndeterminate = true }

    fun pillBackground(color: Int, radiusDp: Float = 24f): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = radiusDp
            setColor(color)
        }

    fun space(ctx: Context, heightDp: Int): View =
        View(ctx).apply { layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(ctx, heightDp)) }

    /** Chat bubble TextView with proper gravity for mine/theirs. */
    fun bubble(ctx: Context, color: Int, isMine: Boolean): TextView {
        val t = TextView(ctx)
        t.textSize = 16f
        t.setPadding(dp(ctx, 12), dp(ctx, 8), dp(ctx, 12), dp(ctx, 8))
        t.background = pillBackground(color, 18f)
        val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        lp.gravity = if (isMine) Gravity.END else Gravity.START
        lp.bottomMargin = dp(ctx, 4)
        t.layoutParams = lp
        return t
    }
}
