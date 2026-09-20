//! Native audio tag reading, plus NetEase's embedded metadata blob.
//!
//! Why this exists: the local library was built entirely from the *filename*.
//! `parseFileName` splits "Artist - Title.mp3" and everything else - album,
//! genre, year, track number, embedded cover, embedded lyrics - was thrown
//! away, because reading it needs a real container parser and the webview has
//! none. `lofty` is pure Rust and handles ID3v2, Vorbis, MP4/ALAC, FLAC, APE
//! and WAV, so one implementation covers every format the app can import.
//!
//! It also unblocks things that were stuck on this: browsing by genre or year,
//! and matching a local file back to its streaming counterpart.

use std::fs::File;
use std::path::Path;

use base64::Engine as _;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::prelude::{Accessor, ItemKey};
use lofty::probe::Probe;
use serde::Serialize;

/// What we can tell the frontend about one file.
///
/// Every field is optional except `path`. A tag that is not in the file must
/// read as absent rather than as an empty string, so the UI can tell "no album
/// recorded" from "album is literally blank" - and so a merge over an existing
/// library row never overwrites a good value with a blank.
#[derive(Serialize, Default, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AudioTags {
  pub path: String,
  pub title: Option<String>,
  pub artist: Option<String>,
  pub album: Option<String>,
  pub album_artist: Option<String>,
  pub genre: Option<String>,
  pub year: Option<u32>,
  pub track_number: Option<u32>,
  pub disc_number: Option<u32>,
  /// Seconds, from the container. More reliable than probing with an `<audio>`
  /// element, and it is available before the file is ever played.
  pub duration: Option<f64>,
  pub sample_rate: Option<u32>,
  pub bit_depth: Option<u8>,
  pub bitrate: Option<u32>,
  pub channels: Option<u8>,
  /// Container name, e.g. "MPEG-4", "FLAC", "MP3".
  pub format: Option<String>,
  pub has_cover: bool,
  pub cover_mime: Option<String>,
  /// Embedded cover, base64. The frontend already handles base64 images.
  pub cover_base64: Option<String>,
  /// Unsynchronised lyrics embedded in the file.
  pub lyrics: Option<String>,
  /// NetEase's blob, decoded when present. See `netease_key`.
  pub netease: Option<NeteaseKey>,
}

/// NetEase writes a JSON blob into a comment when it downloads a file, so a
/// local copy can be matched back to the streaming track it came from. That is
/// what makes lyrics, cover art and "add to my library" work for a file that
/// only has a filename.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NeteaseKey {
  pub music_id: Option<String>,
  pub album_id: Option<String>,
  pub artist: Option<String>,
  pub album: Option<String>,
}

/// The comment NetEase prefixes its blob with, verbatim including the
/// apostrophe - it is part of the format, not a typo.
const NETEASE_PREFIX: &str = "163 key(Don't modify):";

/// The AES-128 key NetEase uses. Fixed in every client, so it is a constant of
/// the format rather than a secret; it is here to read files the user already
/// owns, not to defeat anything.
const NETEASE_AES_KEY: &[u8; 16] = b"#14ljk_!\\]&0U<('";

/// Reads tags from an audio file.
///
/// Returns `Ok` with whatever it could read; a file with no tags yields a
/// struct of `None`s rather than an error, because "an untagged file" is a
/// normal outcome and the caller should still get its duration and format.
/// Only an unreadable or unrecognised file is an error.
pub fn read_tags(path: &str) -> Result<AudioTags, String> {
  let file = File::open(path).map_err(|e| format!("cannot open {}: {}", path, e))?;
  let reader = std::io::BufReader::new(file);

  let tagged = Probe::new(reader)
    .guess_file_type()
    .map_err(|e| format!("cannot read {}: {}", path, e))?
    .read()
    .map_err(|e| format!("cannot parse tags in {}: {}", path, e))?;

  let mut out = AudioTags {
    path: path.to_string(),
    format: Some(format!("{:?}", tagged.file_type())),
    ..Default::default()
  };

  let properties = tagged.properties();
  let duration = properties.duration().as_secs_f64();
  if duration > 0.0 {
    out.duration = Some(duration);
  }
  out.sample_rate = properties.sample_rate();
  out.bit_depth = properties.bit_depth();
  out.channels = properties.channels();

  // The nominal bitrate is in kbps. It is absent for some lossless containers
  // and zero for others; both mean "unknown" rather than "zero", and reporting
  // a 0 kbps bitrate would make the UI show a nonsense figure.
  if let Some(bitrate) = properties.audio_bitrate() {
    if bitrate > 0 {
      out.bitrate = Some(bitrate);
    }
  }

  // `primary_tag` prefers the tag matching the container (ID3v2 in MP3, Vorbis
  // in FLAC); `first_tag` is the fallback for a file whose tag does not match.
  let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) else {
    return Ok(out);
  };

  let text = |key: ItemKey| tag.get_string(&key).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

  out.title = text(ItemKey::TrackTitle);
  out.artist = text(ItemKey::TrackArtist);
  out.album = text(ItemKey::AlbumTitle);
  out.album_artist = text(ItemKey::AlbumArtist);
  out.genre = text(ItemKey::Genre);
  out.year = tag.year();
  out.track_number = tag.track();
  out.disc_number = tag.disk();

  // A file can carry both an unsynchronised lyrics frame and a plain comment;
  // the dedicated lyrics item is the one to trust.
  out.lyrics = tag
    .get_string(&ItemKey::Lyrics)
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  if let Some(picture) = tag
    .pictures()
    .iter()
    .find(|p| p.pic_type() == PictureType::CoverFront)
    .or_else(|| tag.pictures().first())
  {
    out.has_cover = true;
    out.cover_mime = Some(picture.mime_type().map(|m| m.to_string()).unwrap_or_else(|| "image/jpeg".into()));
    out.cover_base64 = Some(base64::engine::general_purpose::STANDARD.encode(picture.data()));
  }

  // The NetEase blob lives in a comment. Writers disagree about which half of
  // the frame carries the marker: some put `163 key(Don't modify):<base64>` in
  // the value, some put the marker in the description and the base64 in the
  // value. Both halves are therefore checked.
  //
  // lofty 0.22 exposes comments as ordinary items rather than a dedicated
  // collection, so the values come from `get_strings` and the descriptions from
  // `get_items` - there is no `ItemValue` -> `&str` accessor that would let one
  // pass cover both.
  let mut candidates: Vec<&str> = tag.get_strings(&ItemKey::Comment).collect();
  candidates.extend(tag.get_items(&ItemKey::Comment).map(|item| item.description()));

  for candidate in candidates {
    let Some(rest) = candidate.trim().strip_prefix(NETEASE_PREFIX) else {
      continue;
    };
    if let Some(decoded) = netease_key(rest.trim()) {
      out.netease = Some(decoded);
      break;
    }
  }

  Ok(out)
}

/// Decodes a NetEase `163 key` payload: base64 of an AES-128-ECB ciphertext
/// whose plaintext is `music:{json}`.
///
/// Returns `None` for anything that does not decode cleanly. A malformed blob
/// is not an error worth surfacing - the file is still perfectly playable, and
/// the metadata is a convenience.
pub fn netease_key(payload: &str) -> Option<NeteaseKey> {
  use aes::cipher::{BlockDecrypt, KeyInit};
  use aes::Aes128;

  let raw = base64::engine::general_purpose::STANDARD
    .decode(payload.trim())
    .ok()?;

  if raw.is_empty() || raw.len() % 16 != 0 {
    return None;
  }

  let cipher = Aes128::new(NETEASE_AES_KEY.into());
  let mut buffer = raw;
  for chunk in buffer.chunks_exact_mut(16) {
    cipher.decrypt_block(chunk.into());
  }

  // The plaintext is PKCS#7-padded, and starts with the literal `music:`.
  let unpadded = strip_pkcs7(&buffer)?;
  let text = std::str::from_utf8(unpadded).ok()?;
  let json = text.strip_prefix("music:").unwrap_or(text);

  let value: serde_json::Value = serde_json::from_str(json).ok()?;
  let field = |keys: &[&str]| -> Option<String> {
    for key in keys {
      if let Some(s) = value.get(*key).and_then(|v| v.as_str()) {
        if !s.is_empty() {
          return Some(s.to_string());
        }
      }
      // Some writers use a numeric id.
      if let Some(n) = value.get(*key).and_then(|v| v.as_i64()) {
        return Some(n.to_string());
      }
    }
    None
  };

  Some(NeteaseKey {
    music_id: field(&["musicId", "musicid", "id"]),
    album_id: field(&["albumId", "albumid"]),
    artist: field(&["artist", "artists", "artistName"]),
    album: field(&["album", "albumName"]),
  })
}

/// Removes PKCS#7 padding, rejecting a padding length that cannot be right.
fn strip_pkcs7(data: &[u8]) -> Option<&[u8]> {
  let last = *data.last()? as usize;
  if last == 0 || last > 16 || last > data.len() {
    return None;
  }
  let (body, padding) = data.split_at(data.len() - last);
  // Every padding byte must equal the padding length, or the block did not
  // decrypt to what we think it did.
  if padding.iter().all(|b| *b as usize == last) {
    Some(body)
  } else {
    None
  }
}

/// Tauri command: read one file's tags.
#[tauri::command]
pub async fn read_audio_tags(path: String) -> Result<AudioTags, String> {
  // Tag parsing is CPU-bound and can be slow on a large FLAC with a cover; keep
  // it off the async runtime's threads so it cannot stall other commands.
  tauri::async_runtime::spawn_blocking(move || read_tags(&path))
    .await
    .map_err(|e| format!("tag reader panicked: {}", e))?
}

/// Tauri command: read many files' tags.
///
/// Batched because the import path picks hundreds of files at once and one IPC
/// round-trip per file would be the slowest part of the import. Failures are
/// reported per file rather than aborting the batch - one corrupt file should
/// not cost the user the other 299.
#[tauri::command]
pub async fn read_audio_tags_batch(paths: Vec<String>) -> Result<Vec<Result<AudioTags, String>>, String> {
  tauri::async_runtime::spawn_blocking(move || paths.into_iter().map(|p| read_tags(&p)).collect())
    .await
    .map_err(|e| format!("tag reader panicked: {}", e))
}

/// True when the path looks like audio we can tag-read. Used by the scanner to
/// skip the probe for files it would only reject.
pub fn is_supported_extension(path: &str) -> bool {
  const SUPPORTED: [&str; 11] = ["mp3", "m4a", "aac", "alac", "flac", "wav", "ogg", "opus", "ape", "wv", "aiff"];
  Path::new(path)
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| SUPPORTED.contains(&e.to_ascii_lowercase().as_str()))
    .unwrap_or(false)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn supported_extensions_are_case_insensitive() {
    assert!(is_supported_extension("a.mp3"));
    assert!(is_supported_extension("a.MP3"));
    assert!(is_supported_extension("/x/y/song.Flac"));
    assert!(!is_supported_extension("a.txt"));
    assert!(!is_supported_extension("noextension"));
  }

  #[test]
  fn pkcs7_strips_valid_padding() {
    // The last byte is the padding length, and every padding byte must equal it.
    assert_eq!(strip_pkcs7(&[1, 2, 3, 3, 3]).unwrap(), &[1, 2]);
    assert_eq!(strip_pkcs7(&[1, 2, 3, 4, 4, 4, 4]).unwrap(), &[1, 2, 3]);
    // A full block of padding is legal and leaves an empty body.
    assert_eq!(strip_pkcs7(&[16u8; 16]).unwrap(), &[] as &[u8]);
  }

  #[test]
  fn pkcs7_rejects_impossible_padding() {
    // A padding length of 0, or larger than the block, means the decryption did
    // not produce what we expected - accepting it would yield garbage metadata.
    assert!(strip_pkcs7(&[]).is_none());
    assert!(strip_pkcs7(&[1, 2, 0]).is_none());
    assert!(strip_pkcs7(&[1, 2, 200]).is_none());
    // Padding bytes that disagree with the length.
    assert!(strip_pkcs7(&[1, 2, 3, 2]).is_none());
  }

  #[test]
  fn netease_key_rejects_junk() {
    assert!(netease_key("").is_none());
    assert!(netease_key("not base64 !!!").is_none());
    // Valid base64 but not a multiple of the AES block size.
    assert!(netease_key(&base64::engine::general_purpose::STANDARD.encode([1u8, 2, 3])).is_none());
  }

  #[test]
  fn netease_key_round_trips_a_real_payload() {
    use aes::cipher::{BlockEncrypt, KeyInit};
    use aes::Aes128;

    // Build the blob the way NetEase's client does, then read it back. This is
    // the only way to test the decoder without shipping a copyrighted file.
    let json = r#"music:{"musicId":12345,"albumId":67890,"artist":"周杰伦","album":"叶惠美"}"#;
    let mut buffer = json.as_bytes().to_vec();
    let pad = 16 - (buffer.len() % 16);
    buffer.extend(std::iter::repeat(pad as u8).take(pad));

    let cipher = Aes128::new(NETEASE_AES_KEY.into());
    for chunk in buffer.chunks_exact_mut(16) {
      cipher.encrypt_block(chunk.into());
    }

    let payload = base64::engine::general_purpose::STANDARD.encode(&buffer);
    let decoded = netease_key(&payload).expect("should decode");

    assert_eq!(decoded.music_id.as_deref(), Some("12345"));
    assert_eq!(decoded.album_id.as_deref(), Some("67890"));
    assert_eq!(decoded.artist.as_deref(), Some("周杰伦"));
    assert_eq!(decoded.album.as_deref(), Some("叶惠美"));
  }

  #[test]
  fn netease_key_tolerates_a_missing_prefix() {
    use aes::cipher::{BlockEncrypt, KeyInit};
    use aes::Aes128;

    // Some writers store the JSON without the `music:` marker.
    let json = r#"{"musicId":7}"#;
    let mut buffer = json.as_bytes().to_vec();
    let pad = 16 - (buffer.len() % 16);
    buffer.extend(std::iter::repeat(pad as u8).take(pad));
    let cipher = Aes128::new(NETEASE_AES_KEY.into());
    for chunk in buffer.chunks_exact_mut(16) {
      cipher.encrypt_block(chunk.into());
    }

    let payload = base64::engine::general_purpose::STANDARD.encode(&buffer);
    assert_eq!(netease_key(&payload).unwrap().music_id.as_deref(), Some("7"));
  }

  #[test]
  fn netease_key_accepts_a_numeric_id_field() {
    use aes::cipher::{BlockEncrypt, KeyInit};
    use aes::Aes128;

    let json = r#"music:{"id":99,"artist":""}"#;
    let mut buffer = json.as_bytes().to_vec();
    let pad = 16 - (buffer.len() % 16);
    buffer.extend(std::iter::repeat(pad as u8).take(pad));
    let cipher = Aes128::new(NETEASE_AES_KEY.into());
    for chunk in buffer.chunks_exact_mut(16) {
      cipher.encrypt_block(chunk.into());
    }

    let payload = base64::engine::general_purpose::STANDARD.encode(&buffer);
    let decoded = netease_key(&payload).unwrap();
    assert_eq!(decoded.music_id.as_deref(), Some("99"));
    // An empty string is absent, not an empty artist.
    assert_eq!(decoded.artist, None);
  }

  #[test]
  fn read_tags_reports_a_missing_file_rather_than_panicking() {
    let error = read_tags("/definitely/not/here.mp3").unwrap_err();
    assert!(error.contains("cannot open"), "got: {}", error);
  }
}
