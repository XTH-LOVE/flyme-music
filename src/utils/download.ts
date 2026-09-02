import type { MusicTrack } from '@/music/source/types';
import { resolveTrackUrl } from '@/music/source/track-resolver';
import { useSettingsStore } from '@/store/useSettingsStore';

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
 * Resolve the real stream URL, fetch it through the dev media proxy
 * (bypasses CORS) and trigger a browser download.
 */
export async function downloadTrack(track: MusicTrack): Promise<void> {
  // Download at the configured quality (default: highest), resolver falls
  // back to lower bitrates when the quality is unavailable.
  const quality = useSettingsStore.getState().quality;
  const br = quality === 'lossless' ? 999 : quality === 'high' ? 320 : 192;
  const url = await resolveTrackUrl(track, br);
  if (!url) throw new Error('无法获取下载地址（可能受版权限制）');

  const res = await fetch('/api/media-proxy?url=' + encodeURIComponent(url));
  if (!res.ok) throw new Error('下载失败：' + res.status);
  const blob = await res.blob();

  const fileName =
    sanitize(track.artist.join('&') + ' - ' + track.name) + '.' + extOf(url);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
