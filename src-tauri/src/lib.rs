mod netease;
mod ai;
mod download;

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
use tauri::{Listener, Manager};

const FS_TOGGLE_EVENT: &str = "am-toggle-fullscreen";

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn toggle_fullscreen(app: &tauri::AppHandle) {
  if let Some(win) = app.get_webview_window("main") {
    let is_fs = win.is_fullscreen().unwrap_or(false);
    let _ = win.set_fullscreen(!is_fs);
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
        .with_shortcuts(["F11"])
        .expect("failed to parse F11 shortcut")
        .with_handler(|app, _shortcut, event| {
          if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
            toggle_fullscreen(app);
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

  builder
    .invoke_handler(tauri::generate_handler![
      netease::netease_post,
      ai::ai_status,
      ai::ai_models,
      ai::ai_chat_completions,
      download::download_and_save,
      download::save_image_base64
    ])
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
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
