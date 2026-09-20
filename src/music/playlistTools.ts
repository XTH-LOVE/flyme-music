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
 *
 * This is only the *first* pass. Two recordings of one title - a studio take
 * and a live one - share a name and an artist too, and treating them as
 * duplicates invites the user to delete one of them. Duration is what separates
 * those, so see `durationClusters`.
 */
export function duplicateKey(track: MusicTrack): string {
  return (track.name + '|' + track.artist.join('/'))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Copies whose durations differ by more than this are different recordings. */
export const DURATION_TOLERANCE = 3;

export type DuplicateKind =
  /** Every copy reports a duration and they agree: the same recording. */
  | 'exact'
  /** A duration is missing, so the match rests on title and artist alone. */
  | 'assumed';

export interface DuplicateGroup {
  key: string;
  label: string;
  kind: DuplicateKind;
  /** Indices in the original array, in order. */
  indices: number[];
  /** Duration of the recording, when the copies agree on one. */
  duration?: number;
}

interface DurationCluster {
  indices: number[];
  duration?: number;
  kind: DuplicateKind;
}

/**
 * Splits copies of one title into recordings, then keeps only the real
 * duplicates.
 *
 * A cluster of one is a different recording rather than a duplicate, so it is
 * dropped here - that is the whole point of looking at duration, and it is what
 * keeps `dedupeTracks` from silently deleting a live version.
 */
function durationClusters(
  entries: readonly { index: number; duration?: number }[],
): DurationCluster[] {
  const known: { index: number; duration: number }[] = [];
  const unknown: number[] = [];
  for (const entry of entries) {
    if (typeof entry.duration === 'number' && entry.duration > 0) {
      known.push({ index: entry.index, duration: entry.duration });
    } else {
      unknown.push(entry.index);
    }
  }
  const knownDurations = new Map(known.map((entry) => [entry.index, entry.duration]));

  const clusters: DurationCluster[] = [];

  // Sorted, then compared against the cluster's *first* duration rather than
  // the previous entry's: anchoring on the previous one would let a chain of
  // near-misses walk arbitrarily far from where it started.
  for (const entry of [...known].sort((a, b) => a.duration - b.duration)) {
    const last = clusters[clusters.length - 1];
    if (last && entry.duration - (last.duration as number) <= DURATION_TOLERANCE) {
      last.indices.push(entry.index);
      continue;
    }
    clusters.push({ indices: [entry.index], duration: entry.duration, kind: 'exact' });
  }

  if (unknown.length) {
    const only = clusters.length <= 1 ? clusters[0] : undefined;
    if (only) {
      // One recording in the group, so a missing duration has nothing to
      // disagree with. Joining it is right; leaving it out would strand a
      // duplicate in the list.
      only.indices.push(...unknown);
    } else {
      // Several recordings and no way to tell which one the unknowns are.
      // Guessing would mean deleting the wrong copy.
      clusters.push({ indices: [...unknown], kind: 'assumed' });
    }
  }

  for (const cluster of clusters) {
    cluster.indices.sort((a, b) => a - b);
    cluster.kind = cluster.indices.every((index) => knownDurations.has(index))
      ? 'exact'
      : 'assumed';
  }
  return clusters.filter((cluster) => cluster.indices.length > 1);
}

/** Groups of tracks that are the same recording more than once. */
export function findDuplicates(tracks: MusicTrack[]): DuplicateGroup[] {
  const byTitle = new Map<string, { index: number; duration?: number }[]>();
  tracks.forEach((track, index) => {
    const key = duplicateKey(track);
    const list = byTitle.get(key);
    if (list) list.push({ index, duration: track.duration });
    else byTitle.set(key, [{ index, duration: track.duration }]);
  });

  const groups: DuplicateGroup[] = [];
  for (const [title, entries] of byTitle) {
    if (entries.length < 2) continue;
    for (const cluster of durationClusters(entries)) {
      const first = tracks[cluster.indices[0]];
      groups.push({
        key: title + '|' + (cluster.duration ?? '?'),
        label: first.name + ' - ' + first.artist.join(' / '),
        kind: cluster.kind,
        indices: cluster.indices,
        duration: cluster.duration,
      });
    }
  }
  return groups;
}

/**
 * Remove duplicates, keeping the first occurrence of each recording.
 *
 * Built on `findDuplicates` rather than on its own key, so what the review
 * panel shows and what this deletes can never drift apart. Keeps the earliest
 * copy so the order the user built is preserved, and keeps different recordings
 * of the same title.
 */
export function dedupeTracks(tracks: MusicTrack[]): MusicTrack[] {
  const drop = new Set<number>();
  for (const group of findDuplicates(tracks)) {
    for (const index of group.indices.slice(1)) drop.add(index);
  }
  return tracks.filter((_, index) => !drop.has(index));
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
export function toM3U(tracks: MusicTrack[], playlistName = 'Flyme Music'): string {
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

export function toJson(tracks: MusicTrack[], playlistName = 'Flyme Music'): string {
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
  playlistName = 'Flyme Music',
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
