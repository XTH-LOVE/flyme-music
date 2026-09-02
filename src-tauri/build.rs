use std::path::PathBuf;

/// Embeds the AI endpoint/key/model at compile time so the packaged app
/// needs no runtime config and the key never reaches the frontend.
fn write_ai_config() {
  let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
  let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
  let env_path = manifest.join("../.env.local");

  let mut endpoint = String::new();
  let mut key = String::new();
  let mut model = String::new();
  if let Ok(text) = std::fs::read_to_string(&env_path) {
    for line in text.lines() {
      let line = line.trim();
      if let Some(v) = line.strip_prefix("AURORA_AI_ENDPOINT=") {
        endpoint = v.trim().to_string();
      } else if let Some(v) = line.strip_prefix("AURORA_AI_API_KEY=") {
        key = v.trim().to_string();
      } else if let Some(v) = line.strip_prefix("AURORA_AI_MODEL=") {
        model = v.trim().to_string();
      }
    }
  }
  if endpoint.is_empty() {
    endpoint = "https://opencode.ai/zen/v1".to_string();
  }
  let endpoint = endpoint.trim_end_matches('/').to_string();

  let code = format!(
    "pub const AI_ENDPOINT: &str = {:?};\npub const AI_API_KEY: &str = {:?};\npub const AI_MODEL: &str = {:?};\n",
    endpoint, key, model
  );
  std::fs::write(out_dir.join("ai_config.rs"), code).expect("write ai_config.rs");
  println!("cargo:rerun-if-changed=../.env.local");
}

fn main() {
  write_ai_config();
  tauri_build::build()
}