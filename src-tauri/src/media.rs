//! The notification-shade / lock-screen player.
//!
//! The Android half lives in `MediaPlugin.kt`. This exists only to register it:
//! Tauri's Kotlin plugins are discovered by reflection from the Rust side, so a
//! plugin with no Rust counterpart is never instantiated.
//!
//! On every other platform this is a no-op. The web build already gets controls
//! from `navigator.mediaSession`, and desktop windows have no shade to post to.

use tauri::{
  plugin::{Builder, TauriPlugin},
  Runtime,
};

/// Handle to the Android plugin, kept so Rust could call into it later.
#[cfg(target_os = "android")]
pub struct MediaPluginHandle<R: Runtime>(pub tauri::plugin::PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("media")
    .setup(|app, api| {
      #[cfg(target_os = "android")]
      {
        let handle = api.register_android_plugin("com.flyme.music", "MediaPlugin")?;
        app.manage(MediaPluginHandle(handle));
      }
      // Silence the unused-variable warning on desktop, where neither binding
      // is touched but the closure still receives them.
      #[cfg(not(target_os = "android"))]
      {
        let _ = app;
        let _ = api;
      }
      Ok(())
    })
    .build()
}
