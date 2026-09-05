use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::StreamExt;
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// Shared client: connection pooling + a hard timeout so a stalled CDN
/// never hangs the download forever. Built once per process.
fn http_client() -> &'static reqwest::Client {
  use std::sync::OnceLock;
  static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
  CLIENT.get_or_init(|| {
    reqwest::Client::builder()
      .user_agent(UA)
      .connect_timeout(Duration::from_secs(15))
      .timeout(Duration::from_secs(180))
      .build()
      .unwrap_or_else(|_| reqwest::Client::new())
  })
}

/// Derive the hotlink Referer a CDN expects (origin + trailing slash),
/// matching the dev media-proxy behaviour.
fn referer_of(url: &str) -> Option<String> {
  reqwest::Url::parse(url)
    .ok()
    .map(|u| format!("{}://{}/", u.scheme(), u.host_str().unwrap_or("")))
}

/// Streams a remote file straight to disk; audio is far too large for ipc bytes.
async fn stream_to(url: &str, target: &PathBuf) -> Result<(), String> {
  let mut req = http_client().get(url).header("User-Agent", UA);
  // QQ/Joox/Netease CDNs reject bare requests with 403; send the origin Referer.
  if let Some(referer) = referer_of(url) {
    req = req.header("Referer", referer);
  }
  let res = req.send().await.map_err(|e| format!("连接失败：{e}"))?;
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

/// Return a guaranteed-writable base dir for the download. Public Downloads is
/// preferred (user-visible) but on scoped-storage Android the plain fs call
/// fails, so we probe it first and fall back to the app-private dir.
#[cfg(mobile)]
fn mobile_base_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  use tauri::Manager;
  // 1) Public Downloads, only if actually writable on this device.
  if let Ok(dir) = app.path().download_dir() {
    let probe = dir.join(".aurora_probe");
    if std::fs::create_dir_all(&probe).is_ok() {
      let _ = std::fs::remove_dir(&probe);
      return Ok(dir);
    }
  }
  // 2) App-private data dir: always writable, no permission needed.
  if let Ok(dir) = app.path().app_data_dir() {
    return Ok(dir);
  }
  Err("找不到可写入的下载目录".into())
}

/// Android: prefer a guaranteed-writable dir (public Downloads needs MediaStore
/// / scoped-storage permissions the app does not hold).
#[cfg(mobile)]
fn pick_save_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
  let base = mobile_base_dir(app)?;
  let dir = base.join("AuroraMusic");
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