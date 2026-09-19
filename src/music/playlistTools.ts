import type { MusicTrack } from '@/music/source/types';

/**
 * Playlist housekeeping: sorting, searching, de-duplicating and exporting.
 *
 * All pure functions over the track array, so the behaviour is testable without
 * rendering anything. The playlist page only wires them to buttons.
 */

export type SortField = 'added' | 'title' | 'artist' | 'duration' | 'album';
export type SortDirection = 'asc' | 'desc';

export interface SortOption {
  field: SortField;
  label: string;
  /** Whether ascending is the natural order for this field. */
  defaultDirection: SortDirection;
}

export const SORT_OPTIONS: SortOption[] = [
  { field: 'added', label: '加入顺序', defaultDirection: 'asc' },
  { field: 'title', label: '标题', defaultDirection: 'asc' },
  { field: 'artist', label: '歌手', defaultDirection: 'asc' },
  { field: 'album', label: '专辑', defaultDirection: 'asc' },
  { field: 'duration', label: '时长', defaultDirection: 'asc' },
];

/** Case- and width-insensitive compare so CJK and Latin sort predictably. */
function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'zh-Hans-CN', { sensitivity: 'base', numeric: true });
}

function fieldValue(track: MusicTrack, field: SortField): string | number {
  switch (field) {
    case 'title':
      return track.name;
    case 'artist':
      return track.artist.join(' / ');
    case 'album':
      return track.album ?? '';
    case 'duration':
      return track.duration ?? 0;
    case 'added':
    default:
      return 0;
  }
}

/**
 * Sort a playlist.
 *
 * `added` preserves the original order (and its reverse) rather than sorting on
 * a field: a playlist's own order is meaningful, so "sort by added" must be the
 * identity, not a re-shuffle.
 *
 * Missing durations sort last in both directions - an unknown length is not
 * "zero seconds", and burying it at one end regardless of direction is less
 * surprising than having it jump between ends.
 */
export function sortTracks(
  tracks: MusicTrack[],
  field: SortField,
  direction: SortDirection = 'asc',
): MusicTrack[] {
  if (field === 'added') {
    return direction === 'asc' ? [...tracks] : [...tracks].reverse();
  }

  const sign = direction === 'asc' ? 1 : -1;
  return [...tracks]
    .map((track, index) => ({ track, index }))
    .sort((a, b) => {
      if (field === 'duration') {
        const da = a.track.duration;
        const db = b.track.duration;
        const aMissing = !da || da <= 0;
        const bMissing = !db || db <= 0;
        if (aMissing && bMissing) return a.index - b.index;
        if (aMissing) return 1;
        if (bMissing) return -1;
        const diff = (da as number) - (db as number);
        if (diff !== 0) return sign * diff;
      } else {
        const diff = compareText(String(fieldValue(a.track, field)), String(fieldValue(b.track, field)));
        if (diff !== 0) return sign * diff;
      }
      // Stable: ties keep their original relative order.
      return a.index - b.index;
    })
    .map((entry) => entry.track);
}

/** Filter by title, artist or album. Empty query returns everything. */
export function filterTracks(tracks: MusicTrack[], query: string): MusicTrack[] {
  const q = query.trim().toLowerCase();
  if (!q) return tracks;
  return tracks.filter((track) => {
    const haystack = [track.name, track.artist.join(' '), track.album ?? ''].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * Identity for de-duplication.
 *
 * Name plus artist, not id: the same song added from two sources has different
 * ids and is still the same song to the user.
 */
export function duplicateKey(track: MusicTrack): string {
  return (track.name + '|' + track.artist.join('/'))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export interface DuplicateGroup {
  key: string;
  label: string;
  /** Indices in the original array, in order. */
  indices: number[];
}

/** Groups of tracks that appear more than once. */
export function findDuplicates(tracks: MusicTrack[]): DuplicateGroup[] {
  const groups = new Map<string, number[]>();
  tracks.forEach((track, index) => {
    const key = duplicateKey(track);
    const list = groups.get(key);
    if (list) list.push(index);
    else groups.set(key, [index]);
  });
  return [...groups.entries()]
    .filter(([, indices]) => indices.length > 1)
    .map(([key, indices]) => ({
      key,
      label: tracks[indices[0]].name + ' - ' + tracks[indices[0]].artist.join(' / '),
      indices,
    }));
}

/**
 * Remove duplicates, keeping the first occurrence.
 *
 * Keeps the earliest copy so the playlist order the user built is preserved.
 */
export function dedupeTracks(tracks: MusicTrack[]): MusicTrack[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    const key = duplicateKey(track);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type ExportFormat = 'm3u' | 'txt' | 'json';

export const EXPORT_FORMATS: { format: ExportFormat; label: string; extension: string }[] = [
  { format: 'm3u', label: 'M3U 播放列表', extension: 'm3u' },
  { format: 'txt', label: '文本清单', extension: 'txt' },
  { format: 'json', label: 'JSON（含音源信息）', extension: 'json' },
];

/**
 * M3U keeps only what a player needs to look the track up again: the duration,
 * the display name and, when known, the original stream location.
 */
export function toM3U(tracks: MusicTrack[], playlistName = 'Aurora Music'): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${playlistName}`];
  for (const track of tracks) {
    const seconds = Math.max(0, Math.round(track.duration ?? 0));
    const artist = track.artist.join(' / ');
    lines.push(`#EXTINF:${seconds},${artist ? artist + ' - ' : ''}${track.name}`);
    // Prefer a real URL when the track carries one; otherwise leave a comment so
    // the entry is still identifiable rather than emitting a broken path.
    lines.push(track.picUrl && /^https?:/.test(track.picUrl) ? track.picUrl : `# ${track.source}:${track.id}`);
  }
  return lines.join('\n');
}

export function toText(tracks: MusicTrack[]): string {
  return tracks
    .map((track, index) => {
      const artist = track.artist.join(' / ');
      return `${index + 1}. ${track.name}${artist ? ' - ' + artist : ''}`;
    })
    .join('\n');
}

export function toJson(tracks: MusicTrack[], playlistName = 'Aurora Music'): string {
  return JSON.stringify(
    {
      name: playlistName,
      exportedAt: new Date().toISOString(),
      count: tracks.length,
      tracks: tracks.map((track) => ({
        name: track.name,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        source: track.source,
        id: track.id,
        url_id: track.url_id,
      })),
    },
    null,
    2,
  );
}

export function exportPlaylist(
  tracks: MusicTrack[],
  format: ExportFormat,
  playlistName = 'Aurora Music',
): string {
  if (format === 'm3u') return toM3U(tracks, playlistName);
  if (format === 'json') return toJson(tracks, playlistName);
  return toText(tracks);
}

/** Filesystem-safe file name for the export. */
export function exportFileName(playlistName: string, format: ExportFormat, now = new Date()): string {
  const safe = playlistName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'playlist';
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const extension = EXPORT_FORMATS.find((f) => f.format === format)?.extension ?? 'txt';
  return `${safe}-${stamp}.${extension}`;
}
