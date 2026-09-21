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
#[tauri::command]
#[allow(unused_variables)]
pub fn media_update_state<R: Runtime>(app: AppHandle<R>, state: serde_json::Value) -> Result<(), String> {
  #[cfg(any(target_os = "android", target_os = "ios"))]
  {
    let parsed: MediaState = serde_json::from_value(state).map_err(|e| e.to_string())?;
    return app.media_session().update_state(parsed);
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
    let parsed: TimelineUpdate = serde_json::from_value(timeline).map_err(|e| e.to_string())?;
    return app.media_session().update_timeline(parsed);
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
