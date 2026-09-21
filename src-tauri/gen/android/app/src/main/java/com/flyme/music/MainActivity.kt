package com.flyme.music

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // The playback service and the media notification are both provided by
  // tauri-plugin-media-session now, so this activity has nothing to do beyond
  // starting the app. It used to start and stop a foreground service here, and
  // before that a hand-written MediaSession plugin lived alongside it.
}
