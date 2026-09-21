package com.flyme.music

import android.app.Notification
import android.app.NotificationChannel
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

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
    private var artworkUrl = ""
    private var artwork: Bitmap? = null
    private val artworkLoader = Executors.newSingleThreadExecutor()
    private lateinit var audio: AudioManager
    private var focusRequest: AudioFocusRequest? = null
    private var noisyReceiver: BroadcastReceiver? = null
    /** Set while another app holds focus, so it is not asked for again on resume. */
    private var ducked = false
    private val main = Handler(Looper.getMainLooper())

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
        const val EXTRA_ARTWORK = "artwork"

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
        audio = getSystemService(AUDIO_SERVICE) as AudioManager

        // Headphones unplugged: pause rather than continue out of the phone's
        // own speaker, which is the loudest possible way to be embarrassing in
        // a quiet room. The system broadcasts this precisely so players can
        // avoid it.
        noisyReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                    forward("pause")
                }
            }
        }
        registerReceiver(
            noisyReceiver,
            IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
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
                loadArtwork(intent.getStringExtra(EXTRA_ARTWORK) ?: "")
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

        if (playing) requestFocus() else if (!ducked) abandonFocus()

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

    /**
     * Fetches the cover natively.
     *
     * It has to be done here rather than in the page: the image lives on the
     * music source's CDN, and a WebView fetch of a cross-origin image that is
     * then handed to native code is exactly the case that fails quietly. From
     * Kotlin there is no origin at all.
     *
     * Only re-fetched when the URL actually changes, and the previous bitmap is
     * dropped first so a slow response cannot show the last track's cover.
     */
    private fun loadArtwork(url: String) {
        if (url == artworkUrl) return
        artworkUrl = url
        artwork = null
        if (url.isEmpty()) return

        artworkLoader.execute {
            val bitmap = try {
                val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 8000
                    readTimeout = 8000
                    instanceFollowRedirects = true
                }
                connection.inputStream.use { BitmapFactory.decodeStream(it) }
            } catch (error: Exception) {
                // A missing cover must never break the notification, and the
                // transport controls are what matter here.
                null
            }
            if (bitmap != null) {
                artwork = bitmap
                main.post {
                    if (foreground) rebuild()
                    // The widget shows the same cover, so it is redrawn from
                    // the same bitmap rather than fetching a second copy.
                    PlaybackWidget.cover = bitmap
                    PlaybackWidget.refresh(this@MediaPlaybackService)
                }
            }
        }
    }

    private fun rebuild() {
        notifications.notify(NOTIFICATION_ID, build())
    }

    /**
     * Asks to become the thing the user is listening to.
     *
     * Without this the app plays over whatever else is playing: a video in
     * another app, a phone call, a podcast. It is not a feature so much as the
     * etiquette every player is expected to observe, and its absence is
     * immediately audible.
     *
     * The three loss cases are handled differently on purpose:
     *  - LOSS        - someone else wants the audio for good; stop.
     *  - LOSS_TRANSIENT - a call or a navigation prompt; pause, and it may come
     *                     back.
     *  - CAN_DUCK    - a short announcement; lower the volume rather than
     *                  stopping, so the listener does not have to restart.
     */
    private fun requestFocus() {
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build()
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(attributes)
            .setOnAudioFocusChangeListener { change -> onFocusChange(change) }
            .build()
        focusRequest = request
        audio.requestAudioFocus(request)
    }

    private fun abandonFocus() {
        focusRequest?.let { audio.abandonAudioFocusRequest(it) }
        focusRequest = null
        ducked = false
    }

    private fun onFocusChange(change: Int) {
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS -> {
                ducked = false
                forward("pause")
                abandonFocus()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                ducked = false
                forward("pause")
            }
            // Ducking is a request to the app, not something the system does
            // for it - hence telling the page rather than touching the session.
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                ducked = true
                forward("duck")
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                if (ducked) {
                    ducked = false
                    forward("unduck")
                }
            }
        }
    }

    private fun syncSession() {
        session.setMetadata(
            MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs)
                .apply { artwork?.let { putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, it) } }
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
            // The cover is what makes this look like a player rather than a
            // status row, so it is set whenever one has arrived.
            .apply { artwork?.let { setLargeIcon(it) } }
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
        noisyReceiver?.let { runCatching { unregisterReceiver(it) } }
        noisyReceiver = null
        abandonFocus()
        artworkLoader.shutdownNow()
        artwork = null
        session.release()
        foreground = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
