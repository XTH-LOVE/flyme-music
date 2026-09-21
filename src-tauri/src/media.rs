//! The notification-shade / lock-screen player.
//!
//! Thin wrappers over `tauri-plugin-media-session`.
//!
//! This file used to be a hand-written Android plugin: a Kotlin
//! `MediaSessionCompat` implementation, a foreground service, a permission
//! file, and the ACL entries to let the page call it. It never worked, and the
//! reason is worth keeping: the plugin's commands were invoked from JavaScript,
//! which means they passed through Tauri's ACL, which Tauri's own Android
//! plugins never have to because they are only called from Rust. Each call was
//! rejected before it reached Kotlin and the rejection was swallowed by a
//! `catch` in the frontend, so the notification simply never appeared.
//!
//! A maintained plugin already does all of it, including the Android 13
//! notification permission and native artwork download. Using it removes the
//! Kotlin, the service, the permission file and the whole class of failure.
//!
//! The plugin exposes a Rust API rather than Tauri commands, so these
//! wrappers exist to give the page something to call. Commands defined in the
//! application crate are covered by `core:default`, unlike a plugin's.

use tauri::{AppHandle, Runtime};

#[cfg(any(target_os = "android", target_os = "ios"))]
use tauri_plugin_media_session::{MediaSessionExt, MediaState, TimelineUpdate};

/// Publish the current track. Omitted fields keep their previous values.
///
/// Built field by field rather than deserialised: the plugin's `MediaState`
/// derives `Serialize` but not `Deserialize`, because it is only ever meant to
/// travel towards the native side. Reading the JSON here is also what lets the
/// page send camelCase, matching the plugin's own JavaScript convention.
#[tauri::command]
#[allow(unused_variables)]
pub fn media_update_state<R: Runtime>(
  app: AppHandle<R>,
  state: serde_json::Value,
) -> Result<(), String> {
  #[cfg(any(target_os = "android", target_os = "ios"))]
  {
    let str_of = |key: &str| state.get(key).and_then(|v| v.as_str()).map(String::from);
    let num_of = |key: &str| state.get(key).and_then(|v| v.as_f64());
    let bool_of = |key: &str| state.get(key).and_then(|v| v.as_bool());

    return app.media_session().update_state(MediaState {
      title: str_of("title"),
      artist: str_of("artist"),
      album: str_of("album"),
      artwork_url: str_of("artworkUrl"),
      duration: num_of("duration"),
      position: num_of("position"),
      playback_speed: num_of("playbackSpeed"),
      is_playing: bool_of("isPlaying"),
      can_prev: bool_of("canPrev"),
      can_next: bool_of("canNext"),
      can_seek: bool_of("canSeek"),
    });
  }
  // Desktop has no shade to post to; the web build already gets controls from
  // navigator.mediaSession, so doing nothing is the correct behaviour rather
  // than a fallback.
  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  {
    let _ = (app, state);
    Ok(())
  }
}

/// Position and speed only, without rebuilding the notification.
#[tauri::command]
#[allow(unused_variables)]
pub fn media_update_timeline<R: Runtime>(
  app: AppHandle<R>,
  timeline: serde_json::Value,
) -> Result<(), String> {
  #[cfg(any(target_os = "android", target_os = "ios"))]
  {
    return app.media_session().update_timeline(TimelineUpdate {
      position: timeline.get("position").and_then(|v| v.as_f64()),
      duration: timeline.get("duration").and_then(|v| v.as_f64()),
      playback_speed: timeline.get("playbackSpeed").and_then(|v| v.as_f64()),
    });
  }
  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  {
    let _ = (app, timeline);
    Ok(())
  }
}

/// Dismiss the notification when playback stops entirely.
#[tauri::command]
#[allow(unused_variables)]
pub fn media_clear<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
  #[cfg(any(target_os = "android", target_os = "ios"))]
  {
    return app.media_session().clear();
  }
  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  {
    let _ = app;
    Ok(())
  }
}

/// Registers the upstream plugin. No-op on desktop, by its own design.
pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
  tauri_plugin_media_session::init()
}
