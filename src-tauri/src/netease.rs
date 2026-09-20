use serde::Serialize;

pub const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NeteasePostResult {
  pub body: String,
  pub cookies: Vec<String>,
}

/// Forwards an already-encrypted weapi form. The webview cannot read
/// Set-Cookie, and QR login returns the session only there (code 803).
#[tauri::command]
pub async fn netease_post(path: String, form: String, cookie: String) -> Result<NeteasePostResult, String> {
  if !path.starts_with("/weapi/") {
    return Err("bad path".into());
  }
  let res = reqwest::Client::new()
    .post(format!("https://music.163.com{}", path))
    .header("Content-Type", "application/x-www-form-urlencoded")
    .header("User-Agent", USER_AGENT)
    .header("Referer", "https://music.163.com")
    .header("Origin", "https://music.163.com")
    .header("Cookie", cookie)
    .body(form)
    .send()
    .await
    .map_err(|e| e.to_string())?;
  let cookies: Vec<String> = res
    .headers()
    .get_all("set-cookie")
    .iter()
    .filter_map(|v| v.to_str().ok().map(|s| s.split(';').next().unwrap_or("").trim().to_string()))
    .filter(|s| !s.is_empty())
    .collect();
  let body = res.text().await.map_err(|e| e.to_string())?;
  Ok(NeteasePostResult { body, cookies })
}
