import type { MusicTrack } from '@/music/source/types';
import { resolveTrackUrl } from '@/music/source/track-resolver';
import { useSettingsStore } from '@/store/useSettingsStore';
import { bitrateForQuality } from '@/music/source/quality';
import { isTauri } from '@/lib/apiTransport';
import { notify } from '@/utils/notify';
import { saveBlobInBrowser } from '@/utils/saveBlob';

function extOf(url: string): string {
  if (url.includes('.m4a')) return 'm4a';
  if (url.includes('.flac')) return 'flac';
  if (url.includes('.ogg')) return 'ogg';
  return 'mp3';
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

  const fileName = sanitize(track.artist.join('&') + ' - ' + track.name) + '.' + extOf(url);

  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const saved = await invoke<string>('download_and_save', { url, fileName });
    notify('已保存到 ' + saved);
    return;
  }

  const blob = await fetchMediaBlob(url);
  await saveBlobInBrowser(blob, fileName);
}