package app.gagachat.mobile.ui

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.progressindicator.CircularProgressIndicator
import kotlin.math.roundToInt

/**
 * Tiny programmatic-UI toolkit so the app needs zero layout XML files.
 *
 * Restyled to the LINE design language: white surfaces, a single bright green
 * accent, grouped list rows with leading icons + trailing chevrons, green
 * toggle switches, pill search bars and a bottom navigation bar.
 *
 * All colors resolve from Theme.GaGaChat (Material3 attributes) so light/dark
 * both work; the LINE-specific tokens are read from colors.xml.
 */
object Ui {

    // ---------------- metrics ----------------

    fun dp(ctx: Context, v: Int): Int = (v * ctx.resources.displayMetrics.density).roundToInt()

    fun vertical(ctx: Context, paddingDp: Int = 0): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        if (paddingDp > 0) setPadding(dp(ctx, paddingDp), dp(ctx, paddingDp), dp(ctx, paddingDp), dp(ctx, paddingDp))
    }

    fun horizontal(ctx: Context): LinearLayout = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }

    // ---------------- LINE color tokens ----------------

    fun lineGreen(ctx: Context): Int = color(ctx, R_LINE_GREEN)
    fun lineGreenPale(ctx: Context): Int = color(ctx, R_LINE_GREEN_PALE)
    fun lineBg(ctx: Context): Int = color(ctx, R_LINE_BG)
    fun lineBgGrouped(ctx: Context): Int = color(ctx, R_LINE_BG_GROUPED)
    fun lineDivider(ctx: Context): Int = color(ctx, R_LINE_DIVIDER)
    fun lineText(ctx: Context): Int = color(ctx, R_LINE_TEXT)
    fun lineTextSecondary(ctx: Context): Int = color(ctx, R_LINE_TEXT_SECONDARY)
    fun lineTextTertiary(ctx: Context): Int = color(ctx, R_LINE_TEXT_TERTIARY)
    fun lineBadgeRed(ctx: Context): Int = color(ctx, R_LINE_BADGE_RED)
    fun lineCoinYellow(ctx: Context): Int = color(ctx, R_LINE_COIN_YELLOW)
    fun lineIconGray(ctx: Context): Int = color(ctx, R_LINE_ICON_GRAY)
    fun lineLink(ctx: Context): Int = color(ctx, R_LINE_LINK)

    private fun color(ctx: Context, resId: Int): Int = ContextCompat.getColor(ctx, resId)

    // Resource ids resolved lazily to avoid a hard dependency at class-load time.
    private val R_LINE_GREEN = app.gagachat.mobile.R.color.line_green
    private val R_LINE_GREEN_PALE = app.gagachat.mobile.R.color.line_green_pale
    private val R_LINE_BG = app.gagachat.mobile.R.color.line_bg
    private val R_LINE_BG_GROUPED = app.gagachat.mobile.R.color.line_bg_grouped
    private val R_LINE_DIVIDER = app.gagachat.mobile.R.color.line_divider
    private val R_LINE_TEXT = app.gagachat.mobile.R.color.line_text
    private val R_LINE_TEXT_SECONDARY = app.gagachat.mobile.R.color.line_text_secondary
    private val R_LINE_TEXT_TERTIARY = app.gagachat.mobile.R.color.line_text_tertiary
    private val R_LINE_BADGE_RED = app.gagachat.mobile.R.color.line_badge_red
    private val R_LINE_COIN_YELLOW = app.gagachat.mobile.R.color.line_coin_yellow
    private val R_LINE_ICON_GRAY = app.gagachat.mobile.R.color.line_icon_gray
    private val R_LINE_LINK = app.gagachat.mobile.R.color.line_link

    // ---------------- theme-derived colors ----------------

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

    fun surfaceColor(ctx: Context): Int {
        val tv = TypedValue()
        ctx.theme.resolveAttribute(com.google.android.material.R.attr.colorSurface, tv, true)
        return tv.data
    }

    fun isDark(ctx: Context): Boolean {
        val tv = TypedValue()
        ctx.theme.resolveAttribute(com.google.android.material.R.attr.isLightTheme, tv, true)
        return tv.data == 0
    }

    // ---------------- text ----------------

    fun text(ctx: Context, s: String, sizeSp: Float = 16f, bold: Boolean = false, color: Int? = null): TextView =
        TextView(ctx).apply {
            text = s
            setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
            setTypeface(typeface, if (bold) Typeface.BOLD else Typeface.NORMAL)
            color?.let { setTextColor(it) }
        }

    fun title(ctx: Context, s: String): TextView = text(ctx, s, 22f, bold = true)

    fun subtitle(ctx: Context, s: String): TextView = text(ctx, s, 13f, color = secondaryColor(ctx))

    /** LINE-style grouped section header: small, gray, uppercase-ish. */
    fun sectionHeader(ctx: Context, s: String): TextView =
        text(ctx, s, 12f, bold = true, color = lineTextSecondary(ctx)).apply {
            setPadding(dp(ctx, 16), dp(ctx, 18), dp(ctx, 16), dp(ctx, 8))
        }

    // ---------------- surfaces ----------------

    /** Reusable touch surface for Home lists, using the active light/dark theme. */
    fun card(ctx: Context, content: View): MaterialCardView = MaterialCardView(ctx).apply {
        radius = dp(ctx, 18).toFloat()
        cardElevation = dp(ctx, 1).toFloat()
        setCardBackgroundColor(surfaceColor(ctx))
        addView(content)
    }

    /** Flat white LINE list container (no elevation, hairline dividers between rows). */
    fun listGroup(ctx: Context): LinearLayout = vertical(ctx, 0).apply {
        setBackgroundColor(if (isDark(ctx)) color(ctx, app.gagachat.mobile.R.color.line_bg_grouped_dark)
            else lineBg(ctx))
    }

    fun divider(ctx: Context, insetDp: Int = 0): View = View(ctx).apply {
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1).apply {
            leftMargin = dp(ctx, insetDp)
        }
        setBackgroundColor(lineDivider(ctx))
    }

    fun space(ctx: Context, heightDp: Int): View =
        View(ctx).apply { layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(ctx, heightDp)) }

    fun pillBackground(color: Int, radiusDp: Float = 24f): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = radiusDp
            setColor(color)
        }

    /** Circular tinted icon badge (LINE "Services" / settings leading icons). */
    fun iconCircle(ctx: Context, iconRes: Int, bgColor: Int, sizeDp: Int = 40, iconTint: Int? = null): FrameLayout {
        val size = dp(ctx, sizeDp)
        val wrap = FrameLayout(ctx)
        wrap.layoutParams = LinearLayout.LayoutParams(size, size)
        val bg = View(ctx).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(bgColor)
            }
        }
        wrap.addView(bg, FrameLayout.LayoutParams(size, size))
        val iv = ImageView(ctx).apply {
            setImageResource(iconRes)
            setColorFilter(iconTint ?: Color.WHITE)
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        val inner = (sizeDp * 0.55f).roundToInt()
        val lp = FrameLayout.LayoutParams(dp(ctx, inner), dp(ctx, inner))
        lp.gravity = Gravity.CENTER
        wrap.addView(iv, lp)
        return wrap
    }

    fun icon(ctx: Context, iconRes: Int, sizeDp: Int = 24, tint: Int? = null): ImageView =
        ImageView(ctx).apply {
            setImageResource(iconRes)
            tint?.let { setColorFilter(it) }
            scaleType = ImageView.ScaleType.FIT_CENTER
            layoutParams = LinearLayout.LayoutParams(dp(ctx, sizeDp), dp(ctx, sizeDp))
        }

    // ---------------- inputs & buttons ----------------

    fun input(ctx: Context, hint: String, inputType: Int = android.text.InputType.TYPE_CLASS_TEXT): EditText =
        EditText(ctx).apply {
            this.hint = hint
            this.inputType = inputType
            setSingleLine(true)
        }

    /** LINE pill search bar with a leading magnifier and optional trailing QR button. */
    fun searchBar(ctx: Context, hint: String, onQr: (() -> Unit)? = null, onSearch: (() -> Unit)? = null): LinearLayout {
        val row = horizontal(ctx).apply {
            gravity = Gravity.CENTER_VERTICAL
            background = pillBackground(if (isDark(ctx)) color(ctx, app.gagachat.mobile.R.color.line_bg_grouped_dark)
                else color(ctx, app.gagachat.mobile.R.color.line_bg_grouped), 22f)
            setPadding(dp(ctx, 14), dp(ctx, 10), dp(ctx, 10), dp(ctx, 10))
        }
        row.addView(icon(ctx, app.gagachat.mobile.R.drawable.ic_search, 20, lineTextSecondary(ctx)))
        val label = text(ctx, hint, 15f, color = lineTextSecondary(ctx)).apply {
            setPadding(dp(ctx, 10), 0, 0, 0)
        }
        row.addView(label, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        if (onQr != null) {
            row.addView(icon(ctx, app.gagachat.mobile.R.drawable.ic_qr, 22, lineText(ctx)).apply {
                setPadding(dp(ctx, 6), 0, dp(ctx, 6), 0)
                setOnClickListener { onQr() }
            })
        }
        onSearch?.let { row.setOnClickListener { it() } }
        return row
    }

    fun button(ctx: Context, label: String, filled: Boolean = true, onClick: (View) -> Unit): MaterialButton {
        val b = MaterialButton(ctx, null, com.google.android.material.R.attr.materialButtonStyle)
        b.text = label
        if (!filled) {
            val tv = TypedValue()
            ctx.theme.resolveAttribute(com.google.android.material.R.attr.colorPrimaryContainer, tv, true)
            b.backgroundTintList = ColorStateList.valueOf(tv.data)
        }
        b.setOnClickListener(onClick)
        return b
    }

    /** LINE green primary action button. */
    fun greenButton(ctx: Context, label: String, onClick: (View) -> Unit): MaterialButton =
        MaterialButton(ctx, null, com.google.android.material.R.attr.materialButtonStyle).apply {
            text = label
            backgroundTintList = ColorStateList.valueOf(lineGreen(ctx))
            setTextColor(Color.WHITE)
            setOnClickListener(onClick)
        }

    fun spinner(ctx: Context): android.widget.AutoCompleteTextView =
        android.widget.AutoCompleteTextView(ctx).apply {
            setSingleLine(true)
            inputType = android.text.InputType.TYPE_NULL
        }

    fun progress(ctx: Context): CircularProgressIndicator =
        CircularProgressIndicator(ctx).apply { isIndeterminate = true }

    // ---------------- LINE list rows ----------------

    /**
     * LINE settings/list row: optional leading icon (circle or plain), title,
     * optional subtitle, optional trailing chevron / value / custom view.
     */
    fun listRow(
        ctx: Context,
        title: String,
        subtitle: String? = null,
        iconRes: Int? = null,
        iconCircleBg: Int? = null,
        iconTint: Int? = null,
        trailingText: String? = null,
        chevron: Boolean = false,
        trailing: View? = null,
        onClick: (() -> Unit)? = null
    ): LinearLayout {
        val row = horizontal(ctx).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(ctx, 16), dp(ctx, 14), dp(ctx, 16), dp(ctx, 14))
            isClickable = onClick != null
            if (onClick != null) setOnClickListener { onClick() }
        }
        if (iconRes != null) {
            val lead = if (iconCircleBg != null)
                iconCircle(ctx, iconRes, iconCircleBg, 38, iconTint ?: Color.WHITE)
            else icon(ctx, iconRes, 24, iconTint ?: lineIconGray(ctx))
            row.addView(lead)
            (lead.layoutParams as? LinearLayout.LayoutParams)?.rightMargin = dp(ctx, 14)
        }
        val mid = vertical(ctx)
        mid.addView(text(ctx, title, 16f, color = lineText(ctx)))
        if (!subtitle.isNullOrBlank()) {
            mid.addView(text(ctx, subtitle, 12f, color = lineTextSecondary(ctx)).apply {
                setPadding(0, dp(ctx, 2), 0, 0)
            })
        }
        row.addView(mid, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        if (trailingText != null) {
            row.addView(text(ctx, trailingText, 14f, color = lineTextSecondary(ctx)).apply {
                setPadding(dp(ctx, 8), 0, dp(ctx, 6), 0)
            })
        }
        if (trailing != null) row.addView(trailing)
        if (chevron) row.addView(icon(ctx, app.gagachat.mobile.R.drawable.ic_chevron_right, 20, lineTextTertiary(ctx)))
        return row
    }

    /** LINE toggle row: leading icon, title, subtitle, green MaterialSwitch. */
    fun toggleRow(
        ctx: Context,
        title: String,
        subtitle: String? = null,
        iconRes: Int? = null,
        checked: Boolean,
        onToggle: (Boolean) -> Unit
    ): LinearLayout {
        val row = horizontal(ctx).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(ctx, 16), dp(ctx, 12), dp(ctx, 16), dp(ctx, 12))
        }
        if (iconRes != null) {
            row.addView(icon(ctx, iconRes, 24, lineIconGray(ctx)))
            (row.getChildAt(0).layoutParams as LinearLayout.LayoutParams).rightMargin = dp(ctx, 14)
        }
        val mid = vertical(ctx)
        mid.addView(text(ctx, title, 16f, color = lineText(ctx)))
        if (!subtitle.isNullOrBlank()) {
            mid.addView(text(ctx, subtitle, 12f, color = lineTextSecondary(ctx)).apply {
                setPadding(0, dp(ctx, 2), 0, 0)
            })
        }
        row.addView(mid, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val sw = MaterialSwitch(ctx).apply {
            isChecked = checked
            thumbTintList = ColorStateList.valueOf(lineGreen(ctx))
            trackTintList = ColorStateList.valueOf(lineGreenPale(ctx))
            setOnCheckedChangeListener { _, v -> onToggle(v) }
        }
        row.addView(sw)
        return row
    }

    /** LINE bottom navigation item: icon above a small label, green when active. */
    fun bottomNavItem(
        ctx: Context,
        iconRes: Int,
        label: String,
        active: Boolean,
        badgeCount: Int = 0
    ): LinearLayout {
        val col = vertical(ctx).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(ctx, 8), 0, dp(ctx, 6))
        }
        val iconWrap = FrameLayout(ctx)
        val tint = if (active) lineGreen(ctx) else lineTextSecondary(ctx)
        val iv = icon(ctx, iconRes, 24, tint)
        val lp = FrameLayout.LayoutParams(dp(ctx, 24), dp(ctx, 24))
        lp.gravity = Gravity.CENTER
        iconWrap.addView(iv, lp)
        if (badgeCount > 0) {
            val badge = text(ctx, badgeCount.coerceAtMost(99).toString(), 10f, bold = true, color = Color.WHITE).apply {
                background = pillBackground(lineBadgeRed(ctx), 10f)
                val p = dp(ctx, 5)
                setPadding(p, dp(ctx, 1), p, dp(ctx, 1))
            }
            val blp = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            blp.gravity = Gravity.TOP or Gravity.END
            blp.leftMargin = dp(ctx, 14)
            blp.topMargin = -dp(ctx, 4)
            iconWrap.addView(badge, blp)
        }
        col.addView(iconWrap, LinearLayout.LayoutParams(dp(ctx, 40), dp(ctx, 26)))
        col.addView(text(ctx, label, 11f, bold = active, color = tint).apply {
            setPadding(0, dp(ctx, 3), 0, 0)
        })
        return col
    }

    /** Small red/green count badge. */
    fun badge(ctx: Context, count: Int, color: Int? = null): TextView =
        text(ctx, count.coerceAtMost(99).toString(), 11f, bold = true, color = Color.WHITE).apply {
            background = pillBackground(color ?: lineBadgeRed(ctx), 11f)
            val p = dp(ctx, 6)
            setPadding(p, dp(ctx, 2), p, dp(ctx, 2))
        }

    /** LINE top app bar: optional back arrow, centered title, optional actions. */
    fun topBar(
        ctx: Context,
        title: String,
        onBack: (() -> Unit)? = null,
        actions: List<View> = emptyList()
    ): LinearLayout {
        val bar = horizontal(ctx).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(ctx, 8), dp(ctx, 10), dp(ctx, 8), dp(ctx, 10))
            setBackgroundColor(if (isDark(ctx)) color(ctx, app.gagachat.mobile.R.color.line_bg_grouped_dark)
                else lineBg(ctx))
        }
        if (onBack != null) {
            bar.addView(icon(ctx, app.gagachat.mobile.R.drawable.ic_back, 24, lineText(ctx)).apply {
                setPadding(dp(ctx, 8), dp(ctx, 8), dp(ctx, 8), dp(ctx, 8))
                setOnClickListener { onBack() }
            })
        } else {
            bar.addView(View(ctx), LinearLayout.LayoutParams(dp(ctx, 40), 1))
        }
        bar.addView(text(ctx, title, 18f, bold = true, color = lineText(ctx)).apply {
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        if (actions.isEmpty()) {
            bar.addView(View(ctx), LinearLayout.LayoutParams(dp(ctx, 40), 1))
        } else {
            val box = horizontal(ctx).apply { gravity = Gravity.CENTER_VERTICAL }
            actions.forEach { box.addView(it) }
            bar.addView(box)
        }
        return bar
    }

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
