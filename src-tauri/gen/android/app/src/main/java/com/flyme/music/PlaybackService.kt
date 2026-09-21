package com.flyme.music

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.support.v4.media.session.MediaButtonReceiver
import android.support.v4.media.session.MediaSessionCompat
import androidx.core.app.NotificationCompat

/**
 * Keeps the process alive while the app is in the background.
 *
 * Android suspends a WebView when its activity leaves the foreground, which
 * stops the `<audio>` element the player runs on - so playback dies the moment
 * the user switches away. A foreground service is the only supported way to
 * prevent that: the system will not reclaim a process that has one.
 *
 * The service does not own the player. The audio stays in the WebView, and this
 * only asks the system not to suspend it. It also does not build the media
 * notification - `MediaPlugin` does that, because it is the side that knows the
 * track, and hands it here via [mediaNotification] so the shade shows one entry
 * rather than two.
 */
class PlaybackService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // A transport button arrives as a service start. It goes through the
    // official receiver rather than being read out of the extras by hand: the
    // session's callback is what knows which action was requested, and it is
    // the same path the lockscreen and a headset button take.
    if (intent?.action == android.content.Intent.ACTION_MEDIA_BUTTON) {
      mediaSession?.let { MediaButtonReceiver.handleIntent(it, intent) }
      return START_NOT_STICKY
    }

    isRunning = true
    startForeground(NOTIFICATION_ID, mediaNotification ?: buildIdleNotification())
    // Not sticky: if the system kills the process there is no playback left to
    // protect, and restarting would leave a notification for a silent app.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    isRunning = false
    super.onDestroy()
  }

  /**
   * Shown before any track has been loaded.
   *
   * Deliberately plain: `MediaPlugin` replaces it as soon as it has metadata, so
   * this only covers the window between going background and the first update.
   */
  private fun buildIdleNotification(): Notification {
    ensureChannel()
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launch?.let {
      PendingIntent.getActivity(
        this, 0, it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Flyme Music")
      .setContentText("正在后台运行")
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentIntent(pending)
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  /**
   * Android 8+ refuses to show a notification from a channel that does not
   * exist, and creating it twice is harmless - the system ignores a duplicate
   * id - so it is created on every start rather than tracked.
   */
  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "播放控制",
      // LOW: the controls must be visible, but starting playback should not buzz.
      NotificationManager.IMPORTANCE_LOW,
    )
    channel.description = "播放期间显示的控制与信息"
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  companion object {
    /** Shared with `MediaPlugin`, which posts into the same slot. */
    const val CHANNEL_ID = "flyme-music-playback"
    const val NOTIFICATION_ID = 1

    /**
     * The live session, set by `MediaPlugin`.
     *
     * Held here so the service can hand a media button to it. `MediaButtonReceiver`
     * needs the session itself; there is no way to route the intent without it.
     */
    @Volatile
    var mediaSession: MediaSessionCompat? = null

    @Volatile
    var isRunning = false

    /**
     * The media notification, built by `MediaPlugin`.
     *
     * Held here so the service can post the real one when it goes foreground,
     * instead of a generic "running in the background" that would then need
     * replacing - and so there is only ever one notification in the shade.
     */
    @Volatile
    var mediaNotification: Notification? = null

    /** Starts the service, tolerating the platform differences in the call. */
    fun start(context: Context) {
      val intent = Intent(context, PlaybackService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, PlaybackService::class.java))
    }
  }
}
