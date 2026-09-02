use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::StreamExt;
use std::io::Write;
use std::path::PathBuf;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// Streams a remote file straight to disk; audio is far too large for ipc bytes.
async fn stream_to(url: &str, target: &PathBuf) -> Result<(), String> {
  let res = reqwest::Client::new()
    .get(url)
    .header("User-Agent", UA)
    .send()
    .await
    .map_err(|e| e.to_string())?;
  if !res.status().is_success() {
    return Err(format!("下载失败：HTTP {}", res.status().as_u16()));
  }
  let mut file = std::fs::File::create(target).map_err(|e| e.to_string())?;
  let mut stream = res.bytes_stream();
  while let Some(chunk) = stream.next().await {
    let bytes = chunk.map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
  }
  file.flush().map_err(|e| e.to_string())
}

/// Desktop: native save dialog. Err("cancelled") means the user dismissed it.
#[cfg(desktop)]
async fn pick_save_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
  use tauri_plugin_dialog::DialogExt;
  let (tx, rx) = tokio::sync::oneshot::channel();
  app
    .dialog()
    .file()
    .set_file_name(file_name)
    .save_file(move |picked| {
      let _ = tx.send(picked);
    });
  match rx.await.map_err(|e| e.to_string())? {
    Some(picked) => picked.into_path().map_err(|e| e.to_string()),
    None => Err("cancelled".into()),
  }
}

/// Android: app-scoped Download dir (public Download needs MediaStore).
#[cfg(mobile)]
fn pick_save_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
  use tauri::Manager;
  let base = app
    .path()
    .download_dir()
    .or_else(|_| app.path().app_data_dir())
    .map_err(|e| e.to_string())?;
  let dir = base.join("FlymeMusic");
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join(file_name))
}

#[tauri::command]
pub async fn download_and_save(
  app: tauri::AppHandle,
  url: String,
  file_name: String,
) -> Result<String, String> {
  #[cfg(desktop)]
  let target = pick_save_path(&app, &file_name).await?;
  #[cfg(mobile)]
  let target = pick_save_path(&app, &file_name)?;
  stream_to(&url, &target).await?;
  Ok(target.to_string_lossy().into_owned())
}

/// Lyric share cards are generated in a canvas, so they arrive as a data URL.
#[tauri::command]
pub async fn save_image_base64(
  app: tauri::AppHandle,
  file_name: String,
  data_url: String,
) -> Result<String, String> {
  let payload = data_url.split_once(',').map(|pair| pair.1).unwrap_or(data_url.as_str());
  let bytes = STANDARD.decode(payload).map_err(|e| e.to_string())?;
  #[cfg(desktop)]
  let target = pick_save_path(&app, &file_name).await?;
  #[cfg(mobile)]
  let target = pick_save_path(&app, &file_name)?;
  std::fs::write(&target, bytes).map_err(|e| e.to_string())?;
  Ok(target.to_string_lossy().into_owned())
}