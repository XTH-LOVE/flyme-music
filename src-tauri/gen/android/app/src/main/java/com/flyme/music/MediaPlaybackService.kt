package com.flyme.music

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder

/**
 * The player in the notification shade.
 *
 * Written rather than taken from a plugin for one reason: the icons. A plugin
 * decides how the notification looks, and the usual choice is
 * `android.R.drawable.ic_media_*` - the pre-Material glyphs, which read as
 * dated next to the controls Android draws for itself. Owning this file is what
 * makes `R.drawable.ic_play` possible.
 *
 * Buttons are routed as plain service intents with our own action strings, not
 * through MediaButtonReceiver or a plugin channel: the service is already here,
 * and a direct call has fewer places to break silently.
 */
class MediaPlaybackService : Service() {

    private lateinit var session: MediaSession
    private lateinit var notifications: NotificationManager

    private var title = ""
    private var artist = ""
    private var playing = false
    private var positionMs = 0L
    private var durationMs = 0L
    private var foreground = false

    companion object {
        const val ACTION_UPDATE = "com.flyme.music.UPDATE"
        const val ACTION_PREV = "com.flyme.music.PREV"
        const val ACTION_TOGGLE = "com.flyme.music.TOGGLE"
        const val ACTION_NEXT = "com.flyme.music.NEXT"
        const val ACTION_STOP = "com.flyme.music.STOP"

        const val EXTRA_TITLE = "title"
        const val EXTRA_ARTIST = "artist"
        const val EXTRA_PLAYING = "playing"
        const val EXTRA_POSITION = "position"
        const val EXTRA_DURATION = "duration"

        private const val CHANNEL_ID = "flyme_playback"
        private const val NOTIFICATION_ID = 1001
    }

    override fun onCreate() {
        super.onCreate()
        notifications = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        notifications.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "播放控制", NotificationManager.IMPORTANCE_LOW).apply {
                description = "在通知栏显示当前播放并控制播放"
                setShowBadge(false)
                // No sound or vibration: this is a status display, and a
                // channel that buzzes on every track change is one people mute.
                enableVibration(false)
                setSound(null, null)
            }
        )
        session = MediaSession(this, "FlymeMusicSession").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() = forward("play")
                override fun onPause() = forward("pause")
                override fun onSkipToNext() = forward("next")
                override fun onSkipToPrevious() = forward("previous")
                override fun onSeekTo(pos: Long) = forward("seek:" + pos / 1000)
            })
            isActive = true
        }
    }

    /** Hands the press to the page; the player lives there, not here. */
    private fun forward(action: String) {
        MainActivity.instance?.get()?.sendToJs(action)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_UPDATE -> {
                title = intent.getStringExtra(EXTRA_TITLE) ?: title
                artist = intent.getStringExtra(EXTRA_ARTIST) ?: artist
                playing = intent.getBooleanExtra(EXTRA_PLAYING, playing)
                positionMs = intent.getLongExtra(EXTRA_POSITION, positionMs)
                durationMs = intent.getLongExtra(EXTRA_DURATION, durationMs)
            }
            ACTION_PREV -> forward("previous")
            ACTION_NEXT -> forward("next")
            ACTION_TOGGLE -> forward(if (playing) "pause" else "play")
            ACTION_STOP -> {
                forward("stop")
                stopSelf()
                return START_NOT_STICKY
            }
        }

        syncSession()
        val notification = build()
        if (foreground) {
            notifications.notify(NOTIFICATION_ID, notification)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            foreground = true
        } else {
            startForeground(NOTIFICATION_ID, notification)
            foreground = true
        }
        // Sticky so a low-memory kill during playback leaves the controls
        // reachable; the page re-publishes state when it comes back.
        return START_STICKY
    }

    private fun syncSession() {
        session.setMetadata(
            MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs)
                .build()
        )
        session.setPlaybackState(
            PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or
                        PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackState.ACTION_SEEK_TO
                )
                .setState(
                    if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
                    positionMs,
                    1f
                )
                .build()
        )
    }

    private fun action(action: String, requestCode: Int): PendingIntent =
        PendingIntent.getService(
            this,
            requestCode,
            Intent(this, MediaPlaybackService::class.java).apply { this.action = action },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    private fun build(): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            packageManager.getLaunchIntentForPackage(packageName)?.apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // One toggle button rather than separate play and pause, because the
        // icon is redrawn with each state - unlike the system's fixed pair,
        // there is nothing to keep in sync, and the label always matches what
        // the button will do.
        val toggle = Notification.Action.Builder(
            Icon.createWithResource(this, if (playing) R.drawable.ic_pause else R.drawable.ic_play),
            if (playing) "暂停" else "播放",
            action(ACTION_TOGGLE, 2)
        ).build()

        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_note)
            .setContentTitle(title.ifEmpty { "Flyme Music" })
            .setContentText(artist)
            .setContentIntent(open)
            .setOngoing(playing)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setStyle(
                Notification.MediaStyle()
                    .setMediaSession(session.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(this, R.drawable.ic_prev), "上一首", action(ACTION_PREV, 1)
                ).build()
            )
            .addAction(toggle)
            .addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(this, R.drawable.ic_next), "下一首", action(ACTION_NEXT, 3)
                ).build()
            )
            .build()
    }

    override fun onDestroy() {
        session.release()
        foreground = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
