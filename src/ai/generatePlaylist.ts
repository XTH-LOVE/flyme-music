import { aggregateSearch } from './musicSearch';
import { chatOnce } from './aiClient';
import { buildPlaylistPrompt, parseRequestedTracks, type PlaylistBrief } from './playlistBrief';
import { usePlaylistStore } from '@/store/usePlaylistStore';
import { useAiStore } from '@/store/useAiStore';
import type { MusicTrack } from '@/music/source/types';

/**
 * Describe a playlist, get a playlist.
 *
 * Three steps, and each one can fail on its own: the model has to name real
 * songs, the search has to find them, and the playlist has to be built from
 * what came back. The result reports all three counts rather than a boolean,
 * because "made a playlist of 12" and "made a playlist of 12 out of the 30 it
 * named" are different things to the person looking at it.
 */

/**
 * How many searches run at once.
 *
 * Each one fans out across several sources, so thirty at once is a hundred
 * requests in a burst - which is how an API decides you are a scraper. Four is
 * enough that the whole thing finishes in a few seconds and few enough to look
 * like a person.
 */
const SEARCH_CONCURRENCY = 4;

export interface GeneratedPlaylist {
  playlistId: string;
  name: string;
  /** Tracks that were found and added. */
  found: MusicTrack[];
  /** Titles the model named that could not be found, for honesty about the gap. */
  missing: string[];
}

/** Runs tasks with a fixed number in flight, preserving the input order. */
async function mapLimited<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Finds the best track for one title/artist pair, or null.
 *
 * The artist is appended to the query rather than used as a filter: a search
 * for the title alone returns covers and karaoke versions first often enough
 * that the artist is worth the extra words, and the results are still ranked by
 * the search layer's own scoring.
 */
async function findTrack(title: string, artist: string): Promise<MusicTrack | null> {
  const query = artist ? title + ' ' + artist : title;
  try {
    const result = await aggregateSearch(query, 1, 10);
    return result.items[0] ?? null;
  } catch {
    // One unfindable song is not a reason to abandon the playlist.
    return null;
  }
}

export async function generatePlaylistFromTheme(
  brief: PlaylistBrief,
  signal?: AbortSignal,
): Promise<GeneratedPlaylist> {
  const model = useAiStore.getState().model;
  if (!model) throw new Error('还没有配置 AI，请先到设置里填写');

  const reply = await chatOnce(
    { model },
    buildPlaylistPrompt(brief),
    signal,
    // Long enough for a list of thirty, short enough that a runaway response
    // does not hold the dialog open.
    { maxTokens: 2000, temperature: 0.8 },
  );

  const requested = parseRequestedTracks(reply);
  if (!requested.length) throw new Error('AI 没有返回可用的歌曲列表，换个说法再试');

  const matches = await mapLimited(requested, SEARCH_CONCURRENCY, (item) =>
    findTrack(item.title, item.artist),
  );

  const found: MusicTrack[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < requested.length; i += 1) {
    const track = matches[i];
    if (!track) {
      missing.push(requested[i].title);
      continue;
    }
    // The model can name the same song twice, and the search can return the
    // same track for two different titles. A playlist with a duplicate in it
    // looks like a bug even when the cause is upstream.
    const key = track.source + ':' + track.id;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(track);
    if (found.length >= brief.size) break;
  }

  if (!found.length) throw new Error('这些歌都没搜到，换个说法再试');

  const name = brief.theme.trim().slice(0, 20) || 'AI 歌单';
  const playlistId = usePlaylistStore.getState().createPlaylist(name);
  usePlaylistStore.getState().addBatch(playlistId, found);

  return { playlistId, name, found, missing };
}
