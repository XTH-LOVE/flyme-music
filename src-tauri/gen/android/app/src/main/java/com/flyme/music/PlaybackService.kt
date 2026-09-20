package com.flyme.music

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Keeps the process alive while the app is in the background.
 *
 * Android suspends a WebView when its activity leaves the foreground, which
 * stops the `<audio>` element the player runs on - so playback dies the moment
 * the user switches away. A foreground service is the only supported way to
 * prevent that: the system will not reclaim a process that has one.
 *
 * Unlike Halcyon's PlaybackService, this one does **not** own the player. The
 * audio stays in the WebView, and the service only asks the system not to
 * suspend it. That avoids a second playback path that would have to be kept in
 * sync with the first, and there is nothing to tear down when it stops - the
 * WebView keeps playing, it is simply no longer protected.
 *
 * It is started from `onStop` and stopped from `onStart`, so the notification
 * exists only while the app is actually in the background. Doing it that way
 * avoids needing a JS -> Rust -> Kotlin bridge for a play/pause signal: the
 * activity lifecycle already knows exactly when protection is needed.
 */
class PlaybackService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(NOTIFICATION_ID, buildNotification())
    // Not sticky: if the system kills the process there is no playback left to
    // protect, and restarting would leave a notification for a silent app.
    return START_NOT_STICKY
  }

  private fun buildNotification(): Notification {
    ensureChannel()

    // Tapping the notification reopens the app rather than launching a second
    // copy of the activity.
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launch?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Flyme Music")
      .setContentText("正在后台播放")
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentIntent(pending)
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
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
      "后台播放",
      // LOW: the service must be visible, but it should not buzz on every start.
      NotificationManager.IMPORTANCE_LOW,
    )
    channel.description = "播放期间保持应用运行"
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  companion object {
    private const val CHANNEL_ID = "flyme-music-playback"
    private const val NOTIFICATION_ID = 1

    /** Starts the service, tolerating the platform differences in the call. */
    fun start(context: android.content.Context) {
      val intent = Intent(context, PlaybackService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: android.content.Context) {
      context.stopService(Intent(context, PlaybackService::class.java))
    }
  }
}
