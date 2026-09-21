package com.flyme.music

import android.graphics.drawable.Icon
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * Play/pause in the quick settings shade.
 *
 * The tile does not decide anything itself - it forwards to the page, which
 * owns the player, and its own state is whatever the page last reported. A tile
 * that toggled its own label optimistically would drift out of step the first
 * time playback changed anywhere else, and a tile that lies about what is
 * playing is worse than no tile.
 */
class PlaybackTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        render(playing = false)
    }

    override fun onClick() {
        super.onClick()
        MainActivity.instance?.get()?.sendToJs("toggle")
    }

    private fun render(playing: Boolean) {
        val tile: Tile = qsTile ?: return
        tile.state = if (playing) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.icon = Icon.createWithResource(
            this,
            if (playing) R.drawable.ic_pause else R.drawable.ic_play
        )
        tile.label = "Flyme Music"
        tile.updateTile()
    }
}
