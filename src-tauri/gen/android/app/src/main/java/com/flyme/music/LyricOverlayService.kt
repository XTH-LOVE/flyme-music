package com.flyme.music

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView

/**
 * Desktop lyrics: the current line, floating over whatever else is on screen.
 *
 * The view is built in code rather than inflated from a layout - it is one
 * TextView, and a layout file would be a second place for the same thing to be
 * described.
 *
 * Two things here are not optional. `FLAG_NOT_FOCUSABLE` is what keeps the
 * overlay from stealing the keyboard from whatever is underneath it, which
 * makes the feature unusable rather than merely wrong. And the white text has a
 * shadow because a plain white line is invisible against a light wallpaper -
 * the most common complaint about desktop lyrics in general.
 */
class LyricOverlayService : Service() {

    private lateinit var windows: WindowManager
    private var line: TextView? = null
    private var params: WindowManager.LayoutParams? = null

    companion object {
        const val ACTION_SHOW = "com.flyme.music.LYRIC_SHOW"
        const val ACTION_UPDATE = "com.flyme.music.LYRIC_UPDATE"
        const val ACTION_HIDE = "com.flyme.music.LYRIC_HIDE"
        const val EXTRA_TEXT = "text"
        const val EXTRA_LOCKED = "locked"

        /**
         * Whether the user has granted "display over other apps".
         *
         * Checked before starting rather than after: without the grant the
         * window is never added and nothing at all happens, which reads as the
         * toggle being broken.
         */
        fun canDraw(context: Context): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SHOW -> {
                ensureView()
                update(intent.getStringExtra(EXTRA_TEXT) ?: "", intent.getBooleanExtra(EXTRA_LOCKED, false))
            }
            ACTION_UPDATE -> update(
                intent.getStringExtra(EXTRA_TEXT) ?: "",
                intent.getBooleanExtra(EXTRA_LOCKED, false)
            )
            ACTION_HIDE -> {
                remove()
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun ensureView() {
        if (line != null) return
        windows = getSystemService(WINDOW_SERVICE) as WindowManager

        val view = TextView(this).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(dp(20), dp(10), dp(20), dp(10))
            // Invisible against a light wallpaper without it.
            setShadowLayer(6f, 0f, 1f, Color.argb(200, 0, 0, 0))
            // A single line that ellipsises: a lyric that wraps to three lines
            // covers the screen it is supposed to sit over.
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        line = view

        val layout = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
            // NOT_FOCUSABLE is what stops the overlay taking the keyboard.
            // LAYOUT_NO_LIMITS lets it sit under the status bar area.
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            // Sits clear of the status bar by default; the user can drag it.
            y = dp(120)
        }
        params = layout
        attachDrag(view, layout)

        runCatching { windows.addView(view, layout) }
    }

    /** Drag to reposition. A long press locks it so it is not moved by accident. */
    private fun attachDrag(view: View, layout: WindowManager.LayoutParams) {
        var startX = 0
        var startY = 0
        var touchX = 0f
        var touchY = 0f

        view.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = layout.x
                    startY = layout.y
                    touchX = event.rawX
                    touchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    if (locked) return@setOnTouchListener true
                    layout.x = startX + (event.rawX - touchX).toInt()
                    layout.y = startY + (event.rawY - touchY).toInt()
                    runCatching { windows.updateViewLayout(view, layout) }
                    true
                }
                else -> false
            }
        }
    }

    private var locked = false

    private fun update(text: String, lock: Boolean) {
        locked = lock
        // The drag handle is only useful while unlocked, so the overlay stops
        // swallowing touches once the position is settled.
        params?.let {
            it.flags = if (lock) {
                it.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
            } else {
                it.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
            }
            line?.let { view -> runCatching { windows.updateViewLayout(view, it) } }
        }
        line?.text = text
    }

    private fun remove() {
        line?.let { view -> runCatching { windows.removeView(view) } }
        line = null
        params = null
    }

    override fun onDestroy() {
        remove()
        super.onDestroy()
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()
}
