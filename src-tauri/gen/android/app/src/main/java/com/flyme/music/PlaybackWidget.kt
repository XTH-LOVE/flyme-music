package com.flyme.music

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.widget.RemoteViews

/**
 * Home screen widget.
 *
 * The state lives in a static holder rather than being fetched here: the player
 * is in the page, and a widget cannot ask it anything - it can only be told.
 * [MainActivity]'s bridge writes the holder and calls [refresh] whenever
 * playback changes, and this class only renders what it finds.
 *
 * That is also why the buttons forward instead of acting. A widget that decided
 * for itself would be a second player making decisions the page cannot see.
 */
class PlaybackWidget : AppWidgetProvider() {

    companion object {
        const val ACTION_WIDGET = "com.flyme.music.WIDGET"
        const val EXTRA_WIDGET_ACTION = "widget_action"

        /** Written by the bridge; read on every render. */
        @Volatile
        var title: String = ""
        @Volatile
        var artist: String = ""
        @Volatile
        var playing: Boolean = false
        @Volatile
        var cover: Bitmap? = null

        /** Redraws every placed widget. Cheap enough to call on each change. */
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context) ?: return
            val ids = manager.getAppWidgetIds(ComponentName(context, PlaybackWidget::class.java))
            if (ids.isEmpty()) return
            val views = render(context)
            ids.forEach { id -> manager.updateAppWidget(id, views) }
        }

        private fun render(context: Context): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_playback)
            views.setTextViewText(R.id.widget_title, title.ifEmpty { context.getString(R.string.app_name) })
            views.setTextViewText(R.id.widget_artist, artist)
            views.setImageViewResource(
                R.id.widget_toggle,
                if (playing) R.drawable.ic_pause else R.drawable.ic_play
            )
            // Cleared explicitly: RemoteViews reuses the last bitmap otherwise,
            // which shows the previous track's cover under the new title.
            cover?.let { views.setImageViewBitmap(R.id.widget_cover, it) }
                ?: views.setImageViewResource(R.id.widget_cover, R.drawable.ic_note)

            views.setOnClickPendingIntent(R.id.widget_toggle, pending(context, "toggle", 10))
            views.setOnClickPendingIntent(R.id.widget_next, pending(context, "next", 11))
            return views
        }

        private fun pending(context: Context, action: String, code: Int): PendingIntent =
            PendingIntent.getBroadcast(
                context,
                code,
                Intent(context, PlaybackWidget::class.java).apply {
                    this.action = ACTION_WIDGET
                    putExtra(EXTRA_WIDGET_ACTION, action)
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        super.onUpdate(context, manager, ids)
        ids.forEach { id -> manager.updateAppWidget(id, render(context)) }
    }

    /** Button presses arrive here and are handed straight to the page. */
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action != ACTION_WIDGET) return
        val action = intent.getStringExtra(EXTRA_WIDGET_ACTION) ?: return
        MainActivity.instance?.get()?.sendToJs(action)
    }
}
