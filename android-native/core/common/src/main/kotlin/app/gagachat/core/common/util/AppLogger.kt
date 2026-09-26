package app.gagachat.core.common.util

import android.util.Log
import app.gagachat.core.common.BuildConfig
import javax.inject.Inject

/**
 * Central logging facade.
 *
 * Security baseline (PDF §11): production logging must never contain personal
 * message content, tokens, passwords or OTPs. Callers pass only non-sensitive
 * metadata; [redact] is provided for identifiers that must be partially masked.
 */
interface AppLogger {
    fun d(tag: String, message: String)
    fun i(tag: String, message: String)
    fun w(tag: String, message: String, throwable: Throwable? = null)
    fun e(tag: String, message: String, throwable: Throwable? = null)
}

class AndroidAppLogger @Inject constructor() : AppLogger {
    private val enabled = BuildConfig.DEBUG

    override fun d(tag: String, message: String) {
        if (enabled) Log.d(tag, message)
    }

    override fun i(tag: String, message: String) {
        if (enabled) Log.i(tag, message)
    }

    override fun w(tag: String, message: String, throwable: Throwable?) {
        if (enabled) Log.w(tag, message, throwable)
    }

    override fun e(tag: String, message: String, throwable: Throwable?) {
        // Errors are always logged, but never with sensitive payloads.
        Log.e(tag, message, throwable)
    }
}

/** Masks all but the first 4 characters of an identifier for safe logging. */
fun redact(value: String?): String {
    if (value.isNullOrEmpty()) return "<null>"
    return if (value.length <= 4) "****" else value.take(4) + "****"
}
