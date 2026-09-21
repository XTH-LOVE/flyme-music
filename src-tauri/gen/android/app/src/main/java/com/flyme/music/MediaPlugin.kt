package com.flyme.music

import android.app.Activity
import android.app.Notification
import android.content.pm.PackageManager
import android.os.Build
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.app.PendingIntent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * The notification-shade / lock-screen player.
 *
 * `navigator.mediaSession` in the WebView creates a MediaSession but never posts
 * a notification - posting one is a browser feature, not a WebView one - so the
 * web build has controls and the packaged app has none. This builds the real
 * thing natively.
 *
 * It deliberately does **not** own playback. The player lives in the WebView and
 * Kotlin cannot reach it, so the transport buttons are forwarded back to JS as
 * an `action` event and the page decides what to do. Metadata flows the other
 * way. That keeps one player and one source of truth.
 */
@TauriPlugin
class MediaPlugin(private val activity: Activity) : Plugin(activity) {

  private companion object {
    const val NOTIFICATION_PERMISSION_REQUEST = 4711
  }

  private var session: MediaSessionCompat? = null

  /** One thread: covers are small and sequential, a pool would be waste. */
  private val coverPool = Executors.newSingleThreadExecutor()

  private var title = ""
  private var artist = ""
  private var playing = false
  private var cover: Bitmap? = null

  /** Args: title, artist, album, cover (url), duration (ms), playing (bool). */
  @Command
  fun updateNowPlaying(invoke: Invoke) {
    val args = invoke.getArgs()
    title = args.optString("title", "")
    artist = args.optString("artist", "")
    playing = args.optBoolean("playing", playing)
    val album = args.optString("album", "")
    val coverUrl = args.optString("cover", "")
    val duration = args.optLong("duration", 0L)

    // The previous track's art must not linger on the new one, so it is cleared
    // here and the notification reposted once the new one has loaded.
    cover = null

    ensureSession()
    session?.setMetadata(
      MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
        .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
        .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration)
        .build(),
    )
    applyPlaybackState()
    publish()

    if (coverUrl.isNotEmpty()) loadCover(coverUrl)
    ensureNotificationPermission()
    invoke.resolve()
  }

  /**
   * Asks for POST_NOTIFICATIONS on Android 13+, where it is a runtime grant.
   *
   * Asked here rather than at launch: the request only makes sense once the
   * user has started playing something, and without the grant the notification
   * is silently dropped - which looks exactly like the feature being broken.
   */
  private fun ensureNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val granted = ContextCompat.checkSelfPermission(
      activity,
      android.Manifest.permission.POST_NOTIFICATIONS,
    ) == PackageManager.PERMISSION_GRANTED
    if (granted) return
    ActivityCompat.requestPermissions(
      activity,
      arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
      NOTIFICATION_PERMISSION_REQUEST,
    )
  }

  /** Args: playing (bool). */
  @Command
  fun setPlaying(invoke: Invoke) {
    playing = invoke.getArgs().optBoolean("playing", playing)
    applyPlaybackState()
    publish()
    invoke.resolve()
  }

  /** Called when playback stops entirely, so no stale notification is left. */
  @Command
  fun clear(invoke: Invoke) {
    NotificationManagerCompat.from(activity).cancel(PlaybackService.NOTIFICATION_ID)
    session?.isActive = false
    title = ""
    artist = ""
    cover = null
    invoke.resolve()
  }

  /**
   * Releases the session and the cover thread.
   *
   * The parameter is `AppCompatActivity`, not `Activity` - the base class
   * declares it that way, and matching `Activity` silently fails to override
   * anything.
   */
  override fun onDestroy(activity: AppCompatActivity) {
    coverPool.shutdown()
    session?.release()
    session = null
    super.onDestroy(activity)
  }

  private fun ensureSession() {
    if (session != null) return
    val created = MediaSessionCompat(activity, "FlymeMusic")
    // Every button is forwarded to the page rather than acted on here: Kotlin
    // has no handle on the player.
    created.setCallback(object : MediaSessionCompat.Callback() {
      override fun onPlay() = forward("play")
      override fun onPause() = forward("pause")
      override fun onSkipToNext() = forward("next")
      override fun onSkipToPrevious() = forward("previous")
      override fun onStop() = forward("stop")
    })
    created.isActive = true
    session = created

    // Shade buttons arrive as service starts (see the PendingIntent above), so
    // the service needs a way back into the plugin.
    PlaybackService.onMediaAction = { action ->
      when (action) {
        PlaybackStateCompat.ACTION_PLAY -> forward("play")
        PlaybackStateCompat.ACTION_PAUSE -> forward("pause")
        PlaybackStateCompat.ACTION_PLAY_PAUSE -> forward(if (playing) "pause" else "play")
        PlaybackStateCompat.ACTION_SKIP_TO_NEXT -> forward("next")
        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS -> forward("previous")
        PlaybackStateCompat.ACTION_STOP -> forward("stop")
      }
    }
  }

  private fun forward(action: String) {
    val payload = JSObject()
    payload.put("action", action)
    trigger("action", payload)
  }

  private fun applyPlaybackState() {
    val state =
      if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
    session?.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_STOP,
        )
        .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
        .build(),
    )
  }

  /**
   * Hands the notification to the service and shows it.
   *
   * The service is what actually goes foreground; handing it the notification
   * rather than posting a second one is what keeps a single entry in the shade.
   */
  private fun publish() {
    val notification = buildNotification()
    PlaybackService.mediaNotification = notification
    if (PlaybackService.isRunning) {
      NotificationManagerCompat.from(activity)
        .notify(PlaybackService.NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(): Notification {
    val launch = activity.packageManager.getLaunchIntentForPackage(activity.packageName)
    val pending = launch?.let {
      PendingIntent.getActivity(
        activity, 0, it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    val builder = NotificationCompat.Builder(activity, PlaybackService.CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle(title.ifEmpty { "Flyme Music" })
      .setContentText(artist)
      .setContentIntent(pending)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(playing)
      .setSilent(true)
      .setShowWhen(false)
      .addAction(
        android.R.drawable.ic_media_previous,
        "上一首",
        mediaButton(PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS, 1),
      )
      .addAction(
        if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
        if (playing) "暂停" else "播放",
        mediaButton(PlaybackStateCompat.ACTION_PLAY_PAUSE, 2),
      )
      .addAction(
        android.R.drawable.ic_media_next,
        "下一首",
        mediaButton(PlaybackStateCompat.ACTION_SKIP_TO_NEXT, 3),
      )

    cover?.let { builder.setLargeIcon(it) }
    session?.let {
      builder.setStyle(
        androidx.media.app.NotificationCompat.MediaStyle()
          .setMediaSession(it.sessionToken)
          .setShowActionsInCompactView(0, 1, 2),
      )
    }
    return builder.build()
  }

  /** Routes a shade button press into the MediaSession callback above. */
  private fun mediaButton(action: Long, requestCode: Int): PendingIntent {
    val intent = android.content.Intent(activity, PlaybackService::class.java)
      .setAction(PlaybackService.ACTION_MEDIA_BUTTON)
      .putExtra(PlaybackService.EXTRA_MEDIA_ACTION, action)
    return PendingIntent.getService(
      activity, requestCode, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun loadCover(url: String) {
    coverPool.execute {
      val bitmap = runCatching {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
          connectTimeout = 8000
          readTimeout = 8000
          instanceFollowRedirects = true
        }
        connection.inputStream.use { BitmapFactory.decodeStream(it) }
      }.getOrNull() ?: return@execute

      activity.runOnUiThread {
        cover = bitmap
        // Rebuild with the art in place; a metadata-only update would not
        // repaint the large icon.
        session?.setMetadata(
          MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, bitmap)
            .build(),
        )
        publish()
      }
    }
  }
}
