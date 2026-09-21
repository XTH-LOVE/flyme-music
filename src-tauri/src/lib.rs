mod netease;
mod ai;
mod download;
mod tags;
mod media;

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
use tauri::{Listener, Manager};

const FS_TOGGLE_EVENT: &str = "am-toggle-fullscreen";
/// Emitted to the webview when a global media shortcut fires; the JS side
/// maps it onto the player controller (see src/lib/globalMediaKeys.ts).
const MEDIA_EVENT: &str = "am-media";

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn toggle_fullscreen(app: &tauri::AppHandle) {
  if let Some(win) = app.get_webview_window("main") {
    let is_fs = win.is_fullscreen().unwrap_or(false);
    let _ = win.set_fullscreen(!is_fs);
  }
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn show_main_window(app: &tauri::AppHandle) {
  if let Some(win) = app.get_webview_window("main") {
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
  }
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn emit_media(app: &tauri::AppHandle, command: &str) {
  use tauri::Emitter;
  if let Some(win) = app.get_webview_window("main") {
    let _ = win.emit(MEDIA_EVENT, command);
  }
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn toggle_main_window(app: &tauri::AppHandle) {
  if let Some(win) = app.get_webview_window("main") {
    let visible = win.is_visible().unwrap_or(false);
    if visible {
      let _ = win.hide();
    } else {
      show_main_window(app);
    }
  }
}

/// Semi-transparent fullscreen pill injected into the desktop webview.
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
const INJECT_JS: &str = r##"(function () {
  var add = function () {
    if (document.getElementById("am-fs-btn")) return;
    var b = document.createElement("button");
    b.id = "am-fs-btn";
    b.title = "\u5168\u5c4f / \u7a97\u53e3";
    b.style.cssText = "position:fixed;top:10px;right:10px;z-index:2147483646;width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.6);box-shadow:0 2px 10px rgba(0,0,0,0.15);transition:opacity 160ms ease,transform 120ms ease;opacity:0.75;";
    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    var path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5");
    path.setAttribute("stroke", "#2a2d34");
    path.setAttribute("stroke-width", "2.2");
    path.setAttribute("stroke-linecap", "round");
    svg.appendChild(path);
    b.appendChild(svg);
    b.onmouseenter = function () { b.style.opacity = "1"; };
    b.onmouseleave = function () { b.style.opacity = "0.75"; };
    b.onclick = function (e) {
      e.stopPropagation();
      if (window.__TAURI_INTERNALS__) {
        window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "am-toggle-fullscreen", payload: null }).catch(function () {});
      }
    };
    (document.body || document.documentElement).appendChild(b);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
  else add();
})();
"##;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
  {
    builder = builder.plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_shortcuts(["F11", "CmdOrCtrl+Alt+ArrowRight", "CmdOrCtrl+Alt+ArrowLeft", "CmdOrCtrl+Alt+Space"])
        .expect("failed to register global shortcuts")
        .with_handler(|app, shortcut, event| {
          if event.state != tauri_plugin_global_shortcut::ShortcutState::Pressed {
            return;
          }
          // Match on the key end so platform-normalized modifier spellings
          // (Control/CmdOrCtrl) all land on the same branch.
          let combo = shortcut.into_string();
          if combo == "F11" {
            toggle_fullscreen(app);
          } else if combo.ends_with("ArrowRight") {
            emit_media(app, "next");
          } else if combo.ends_with("ArrowLeft") {
            emit_media(app, "previous");
          } else if combo.ends_with("Space") {
            emit_media(app, "toggle");
          }
        })
        .build(),
    );
  }

  builder = builder.plugin(tauri_plugin_http::init());
  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_dialog::init());
  }

  // Opens external URLs through the OS. Without it a Tauri webview swallows
  // them - clicking an `<a download>` does nothing at all - so the APK
  // download button was inert on Android. Capacitor has this built in as
  // `window.open(url, "_system")`, which is why porting the update UI from
  // an Otter-style codebase looked like it should just work.
  builder = builder.plugin(tauri_plugin_opener::init());

  // The notification-shade player. Android-only in effect: on other platforms
  // this registers a plugin that does nothing.
  builder = builder.plugin(media::init());

  builder
    .invoke_handler(tauri::generate_handler![
      netease::netease_post,
      media::media_update_state,
      media::media_update_timeline,
      media::media_clear,
      ai::ai_status,
      ai::ai_models,
      ai::ai_chat_completions,
      download::download_and_save,
      download::save_image_base64,
      tags::read_audio_tags,
      tags::read_audio_tags_batch
    ])
    .on_window_event(|window, event| {
      // Close hides to the tray so music keeps playing; real exit lives in
      // the tray menu. Desktop only - mobile has no close button concept.
      #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let _ = window.hide();
        api.prevent_close();
      }
      #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
      {
        let _ = (window, event);
      }
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
      {
        if let Some(win) = app.get_webview_window("main") {
          // The webview document may not exist yet right after setup, so
          // retry the injection briefly until it sticks. The snippet itself
          // waits for DOMContentLoaded when the document is still loading.
          let w = win.clone();
          std::thread::spawn(move || {
            for _ in 0..40 {
              if w.eval(INJECT_JS).is_ok() {
                break;
              }
              std::thread::sleep(std::time::Duration::from_millis(150));
            }
          });
        }
        let handle = app.handle().clone();
        app.listen_any(FS_TOGGLE_EVENT, move |_event| {
          toggle_fullscreen(&handle);
        });

        // System tray: left click toggles the window, menu has show/exit.
        use tauri::menu::{Menu, MenuItem};
        use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
        let show_item = MenuItem::with_id(app, "show", "显示 Flyme Music", true, None::<&str>)?;
        let exit_item = MenuItem::with_id(app, "exit", "退出", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&show_item, &exit_item])?;
        let mut tray = TrayIconBuilder::with_id("flyme-tray")
          .menu(&menu)
          .show_menu_on_left_click(false)
          .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "exit" => app.exit(0),
            _ => {}
          })
          .on_tray_icon_event(|tray, event| {
            // tauri 2.x models tray events as an enum; the older
            // `tray::ClickType` / `event.click_type` API no longer exists.
            // Match on button_state Up (release) so one physical click does not
            // toggle twice (once on Down, once on Up).
            if let TrayIconEvent::Click {
              button: MouseButton::Left,
              button_state: MouseButtonState::Up,
              ..
            } = event
            {
              toggle_main_window(tray.app_handle());
            }
          });
        if let Some(icon) = app.default_window_icon() {
          tray = tray.icon(icon.clone());
        }
        tray.build(app)?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
