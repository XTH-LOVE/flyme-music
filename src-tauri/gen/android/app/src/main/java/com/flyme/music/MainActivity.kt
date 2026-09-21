package com.flyme.music

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import java.lang.ref.WeakReference

/**
 * The shell, and the bridge between the page and the notification.
 *
 * The bridge is deliberately this thin. It used to be a Tauri plugin with a
 * Kotlin MediaSession, a foreground service, a permission file and ACL entries,
 * and it never worked: a plugin's commands are invoked from JavaScript, so they
 * pass through Tauri's ACL, which the framework's own Android plugins never
 * have to because they are only called from Rust. Every call was rejected
 * before reaching Kotlin, and a catch in the frontend swallowed the rejection.
 *
 * `onWebViewCreate` hands over the WebView directly, so both directions are a
 * plain call - `addJavascriptInterface` in, `evaluateJavascript` out. No plugin,
 * no ACL, no command-name matching, no reflection. Fewer places to fail, and
 * the ones that remain fail loudly.
 */
class MainActivity : TauriActivity() {

    private var webView: WeakReference<WebView>? = null

    companion object {
        /** Read by the playback service to reach the page. */
        var instance: WeakReference<MainActivity>? = null
    }

    /** Called by [MediaPlaybackService] when a transport button is pressed. */
    fun sendToJs(action: String) {
        val view = webView?.get() ?: return
        view.post {
            // Guarded on the page side: the service can outlive a reload, and
            // calling into a page that has not defined the handler yet would
            // throw inside the WebView rather than anywhere useful.
            view.evaluateJavascript(
                "window.__flymeMediaAction && window.__flymeMediaAction(${quote(action)})",
                null
            )
        }
    }

    /** Minimal JSON string quoting - the actions are ours, but they are interpolated. */
    private fun quote(value: String): String =
        "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

    override fun onWebViewCreate(view: WebView) {
        super.onWebViewCreate(view)
        webView = WeakReference(view)
        view.addJavascriptInterface(Bridge(), "FlymeMedia")
    }

    /** Exposed to the page as `window.FlymeMedia`. */
    private inner class Bridge {
        @JavascriptInterface
        fun update(
            title: String,
            artist: String,
            playing: Boolean,
            positionSec: Double,
            durationSec: Double,
            artworkUrl: String,
        ) {
            val intent = android.content.Intent(this@MainActivity, MediaPlaybackService::class.java).apply {
                action = MediaPlaybackService.ACTION_UPDATE
                putExtra(MediaPlaybackService.EXTRA_TITLE, title)
                putExtra(MediaPlaybackService.EXTRA_ARTIST, artist)
                putExtra(MediaPlaybackService.EXTRA_PLAYING, playing)
                putExtra(MediaPlaybackService.EXTRA_POSITION, (positionSec * 1000).toLong())
                putExtra(MediaPlaybackService.EXTRA_DURATION, (durationSec * 1000).toLong())
                putExtra(MediaPlaybackService.EXTRA_ARTWORK, artworkUrl)
            }
            // startForegroundService on O+ : the service must be told it is
            // allowed to post, or it is killed for not calling startForeground
            // in time.
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        }

        @JavascriptInterface
        fun stop() {
            startService(
                android.content.Intent(this@MainActivity, MediaPlaybackService::class.java).apply {
                    action = MediaPlaybackService.ACTION_STOP
                }
            )
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        instance = WeakReference(this)
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
    }
}
