import type { MusicTrack } from '@/music/source/types';
import { resolveTrackUrl } from '@/music/source/track-resolver';
import { useSettingsStore } from '@/store/useSettingsStore';
import { bitrateForQuality } from '@/music/source/quality';
import { isTauri } from '@/lib/apiTransport';
import { notify } from '@/utils/notify';
import { saveFile } from '@/utils/saveBlob';
import { httpFetch } from '@/lib/apiTransport';
import {
  SNIFF_BYTES,
  detectAudioFormat,
  formatFromMime,
  formatFromUrl,
  type AudioFormat,
} from '@/utils/audioFormat';

/**
 * What the bytes say, or null when they cannot be reached.
 *
 * A small ranged request rather than the whole file: the point is to name the
 * download before it starts, not to fetch it twice.
 */
async function sniffFormat(url: string): Promise<AudioFormat | null> {
  try {
    // httpFetch, not fetch. The packaged app has no origin to be same-site
    // with, so a bare cross-origin fetch is refused by CORS on the CDNs that do
    // not send the header - the sniff returns null, the name falls back to the
    // URL's extension, and a file that is really AAC inside an .mp3 name is
    // written with the wrong one. That is the failure this function exists to
    // prevent, so it has to run through the transport that works there.
    const res = await httpFetch(url, { headers: { Range: 'bytes=0-' + (SNIFF_BYTES - 1) } });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return detectAudioFormat(bytes) ?? formatFromMime(res.headers.get('content-type') ?? '');
  } catch {
    return null;
  }
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * Fetch the remote media bytes.
 * The deployed web (Cloudflare Pages / Vercel) and the dev server both expose
 * /api/media-proxy which streams the CDN response with the hotlink Referer;
 * a plain cross-origin fetch is tried first for CORS-enabled CDNs.
 */
async function fetchMediaBlob(url: string): Promise<Blob> {
  // Direct CORS fetch first: some CDNs (e.g. Netease art/audio) allow it and
  // this skips the proxy round-trip entirely.
  try {
    const direct = await fetch(url, { mode: 'cors' });
    if (direct.ok) return direct.blob();
  } catch {
    /* CORS-blocked or network failure -> use the proxy below */
  }
  const res = await fetch('/api/media-proxy?url=' + encodeURIComponent(url));
  if (!res.ok) throw new Error('下载失败：' + res.status);
  return res.blob();
}

/**
 * Resolve the real stream URL, then save it.
 * Packaged app: Rust streams straight to disk (desktop save dialog, Android
 * download dir). Browser: CORS-free fetch, then Web Share or a[download].
 */
export async function downloadTrack(track: MusicTrack): Promise<void> {
  // Download at the configured quality (default: highest); the resolver
  // falls back to lower bitrates when the quality is unavailable.
  const br = bitrateForQuality(useSettingsStore.getState().quality);
  const url = await resolveTrackUrl(track, br);
  if (!url) throw new Error('无法获取下载地址（可能受版权限制）');

  const base = sanitize(track.artist.join('&') + ' - ' + track.name);

  if (isTauri()) {
    // Sniffed before saving because the name is decided here and the file is
    // written on the other side of the bridge - there is no point at which the
    // bytes could be inspected after the fact.
    const format = (await sniffFormat(url)) ?? formatFromUrl(url);
    const { invoke } = await import('@tauri-apps/api/core');
    const saved = await invoke<string>('download_and_save', {
      url,
      fileName: base + '.' + format,
    });
    notify('已保存到 ' + saved);
    return;
  }

  const blob = await fetchMediaBlob(url);
  // Read the format off the bytes that were actually downloaded, so the name
  // cannot disagree with the contents.
  const head = new Uint8Array(await blob.slice(0, SNIFF_BYTES).arrayBuffer());
  const format =
    detectAudioFormat(head) ?? formatFromMime(blob.type) ?? formatFromUrl(url);
  await saveFile(blob, base + '.' + format);
}