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

  // onStart deliberately does not stop the service any more.
  //
  // It used to, back when the notification was a generic "running in the
  // background" - a thing worth hiding while the user was looking at the app.
  // The notification is now the media player, so stopping on return would make
  // the controls vanish exactly when the user comes back to use them. The
  // service is stopped by the player instead, when nothing is loaded.
}
