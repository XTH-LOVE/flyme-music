/**
 * Export the play log.
 *
 * The log is the only record of what the user actually listened to, and it
 * lives in `localStorage` on one device. Halcyon ships the same idea (its
 * history can be exported in the Prism Music format); the point is not the
 * format but that the data is the user's to take with them.
 *
 * Two formats, because they answer different questions: CSV opens in a
 * spreadsheet and is what most people want, JSON keeps the source and track
 * identity so a script can rebuild a playlist from it.
 */

/** One row of the log, flattened for export. */
export interface PlayLogRow {
  /** ISO 8601, local time. */
  time: string;
  name: string;
  artist: string;
  album: string;
  source: string;
  /** Track id within its source, when the record carries one. */
  id: string;
}

export interface PlayLogLike {
  key: string;
  name: string;
  artist: string;
  ts: number;
  track?: { id: string; source: string; album?: string };
}

/**
 * Local ISO-ish timestamp, e.g. `2026-09-20 18:55:41`.
 *
 * Built from local fields rather than `toISOString`, which would report UTC and
 * silently shift every evening's listening into the next day for anyone east of
 * Greenwich.
 */
export function localTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes()) +
    ':' +
    pad(d.getSeconds())
  );
}

/** Source id, falling back to the `source:id` prefix older records store. */
function sourceOf(entry: PlayLogLike): string {
  if (entry.track?.source) return entry.track.source;
  const separator = entry.key.indexOf(':');
  return separator > 0 ? entry.key.slice(0, separator) : '';
}

function idOf(entry: PlayLogLike): string {
  if (entry.track?.id) return entry.track.id;
  const separator = entry.key.indexOf(':');
  return separator > 0 ? entry.key.slice(separator + 1) : '';
}

export function toRows(entries: readonly PlayLogLike[]): PlayLogRow[] {
  return entries.map((entry) => ({
    time: localTimestamp(entry.ts),
    name: entry.name,
    artist: entry.artist,
    album: entry.track?.album ?? '',
    source: sourceOf(entry),
    id: idOf(entry),
  }));
}

/** RFC 4180 quoting: wrap in quotes and double any quote inside. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

export const PLAY_LOG_COLUMNS = ['time', 'name', 'artist', 'album', 'source', 'id'] as const;

export function toPlayLogCsv(entries: readonly PlayLogLike[]): string {
  const lines = [PLAY_LOG_COLUMNS.join(',')];
  for (const row of toRows(entries)) {
    lines.push(PLAY_LOG_COLUMNS.map((column) => csvCell(row[column])).join(','));
  }
  // A BOM, or Excel reads the Chinese columns as mojibake on Windows.
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export function toPlayLogJson(entries: readonly PlayLogLike[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: entries.length,
      plays: toRows(entries),
    },
    null,
    2,
  );
}

export function playLogFileName(extension: string, now = Date.now()): string {
  const d = new Date(now);
  const pad = (value: number) => String(value).padStart(2, '0');
  return 'aurora-history-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.' + extension;
}
