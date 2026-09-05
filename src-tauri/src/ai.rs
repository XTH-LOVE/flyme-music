use futures_util::StreamExt;
use serde::Serialize;
use tauri::ipc::Channel;

include!(concat!(env!("OUT_DIR"), "/ai_config.rs"));

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiChunk {
  pub delta: Option<String>,
  pub thought: Option<String>,
  pub done: bool,
  pub error: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
  pub configured: bool,
  pub endpoint: String,
  pub model: String,
}

#[tauri::command]
pub fn ai_status() -> AiStatus {
  AiStatus {
    configured: !AI_API_KEY.is_empty(),
    endpoint: AI_ENDPOINT.to_string(),
    model: AI_MODEL.to_string(),
  }
}

#[tauri::command]
pub async fn ai_models() -> Result<Vec<String>, String> {
  if AI_API_KEY.is_empty() {
    return Err("AI server key is not configured".into());
  }
  let res = reqwest::Client::new()
    .get(format!("{}/models", AI_ENDPOINT))
    .header("Authorization", format!("Bearer {}", AI_API_KEY))
    .send()
    .await
    .map_err(|e| e.to_string())?;
  if !res.status().is_success() {
    return Err(format!("模型列表 HTTP {}", res.status().as_u16()));
  }
  let value: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
  let mut ids: Vec<String> = value
    .get("data")
    .and_then(|d| d.as_array())
    .map(|arr| {
      arr
        .iter()
        .filter_map(|m| m.get("id").and_then(|i| i.as_str()).map(String::from))
        .collect()
    })
    .unwrap_or_default();
  ids.sort();
  Ok(ids)
}

/// Streams an OpenAI-compatible completion to the webview over an ipc Channel.
#[tauri::command]
pub async fn ai_chat_completions(body: String, on_chunk: Channel<AiChunk>) -> Result<(), String> {
  if AI_API_KEY.is_empty() {
    return Err("AI server key is not configured".into());
  }
  let res = reqwest::Client::new()
    .post(format!("{}/chat/completions", AI_ENDPOINT))
    .header("Authorization", format!("Bearer {}", AI_API_KEY))
    .header("Content-Type", "application/json")
    .header("User-Agent", "AuroraMusic/0.3")
    .body(body)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !res.status().is_success() {
    let status = res.status().as_u16();
    let text = res.text().await.unwrap_or_default();
    let detail: String = text.chars().take(160).collect();
    return Err(format!("AI HTTP {}: {}", status, detail));
  }

  let mut stream = res.bytes_stream();
  let mut buf: Vec<u8> = Vec::new();
  while let Some(chunk) = stream.next().await {
    let bytes = chunk.map_err(|e| e.to_string())?;
    buf.extend_from_slice(&bytes);
    // Split on newline bytes so multi-byte UTF-8 chars are never cut in half.
    while let Some(pos) = buf.iter().position(|b| *b == b'\n') {
      let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
      let line = String::from_utf8_lossy(&line_bytes).trim().to_string();
      if !line.starts_with("data:") {
        continue;
      }
      let data = line[5..].trim();
      if data == "[DONE]" {
        let _ = on_chunk.send(AiChunk { done: true, ..Default::default() });
        return Ok(());
      }
      if let Ok(value) = serde_json::from_str::<serde_json::Value>(data) {
        let delta = value.pointer("/choices/0/delta");
        let content = delta
          .and_then(|d| d.get("content"))
          .and_then(|c| c.as_str())
          .map(String::from);
        let thought = delta
          .and_then(|d| d.get("reasoning_content").or_else(|| d.get("reasoning")))
          .and_then(|c| c.as_str())
          .map(String::from);
        if content.is_none() && thought.is_none() {
          continue;
        }
        let _ = on_chunk.send(AiChunk { delta: content, thought, done: false, error: None });
      }
    }
  }
  let _ = on_chunk.send(AiChunk { done: true, ..Default::default() });
  Ok(())
}