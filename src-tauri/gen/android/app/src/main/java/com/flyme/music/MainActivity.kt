package com.flyme.music

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  /**
   * Playback protection, tied to the app's own lifecycle.
   *
   * Android suspends the WebView - and with it the `<audio>` element - once the
   * activity is no longer visible, so a foreground service has to be running
   * before that happens. `onStop` is the last callback that runs while the
   * process is still foreground, which makes it the correct place to start it.
   *
   * Doing it here rather than from JS means no bridge is needed: the lifecycle
   * already knows when protection is required, and a signal from the player
   * would only be able to say the same thing less reliably.
   */
  override fun onStop() {
    PlaybackService.start(this)
    super.onStop()
  }

  override fun onStart() {
    super.onStart()
    // Back in the foreground: the WebView runs normally, and an ongoing
    // notification for an app the user is looking at is just noise.
    PlaybackService.stop(this)
  }
}
