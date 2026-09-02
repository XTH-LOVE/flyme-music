import { useEffect, useMemo, useState } from 'react';
import { getTrackProvider } from '@/music/source/factory';
import type { MusicTrack } from '@/music/source/types';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useAiStore } from '@/store/useAiStore';
import {
  analyzeListening,
  filterCandidates,
  knownTrackKeys,
} from '@/music/dailyPick';

const CACHE_KEY = 'aurora.dailyPick.v1';
const TTL_MS = 24 * 60 * 60 * 1000;

interface CachedDailyPick {
  day: string;
  at: number;
  tracks: MusicTrack[];
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function readCache(now: number): MusicTrack[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedDailyPick;
    if (parsed.day !== dayKey(now) || now - parsed.at > TTL_MS) return null;
    return Array.isArray(parsed.tracks) ? parsed.tracks : null;
  } catch {
    return null;
  }
}

function writeCache(now: number, tracks: MusicTrack[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ day: dayKey(now), at: now, tracks }));
  } catch {
    /* ignore */
  }
}

export interface DailyPickResult {
  tracks: MusicTrack[];
  loading: boolean;
  sourceNames: string[];
  available: boolean;
}

/**
 * Daily recommendation: derive queries from recent listening, search the
 * online sources, filter out disliked/already-played tracks, and cache the
 * result for the day.
 */
export function useDailyPick(): DailyPickResult {
  const playLog = useLibraryStore((s) => s.playLog);
  const dislikes = useAiStore((s) => s.dislikes);
  const [tracks, setTracks] = useState<MusicTrack[]>(() => readCache(Date.now()) ?? []);
  const [loading, setLoading] = useState(true);
  const [sourceNames, setSourceNames] = useState<string[]>([]);

  const signals = useMemo(
    () => analyzeListening({ playLog, favorites: [], dislikes }),
    [playLog, dislikes],
  );

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    const cached = readCache(Date.now());
    if (cached && cached.length) {
      setTracks(cached);
      setLoading(false);
      return () => {
        alive = false;
        controller.abort();
      };
    }

    const run = async () => {
      const known = knownTrackKeys(playLog);
      const collected: MusicTrack[] = [];
      const sources = new Set<string>();
      const existing = new Set<string>();

      // Walk ranked queries; stop once we have enough fresh tracks.
      for (const { query } of signals.queries) {
        if (controller.signal.aborted) return;
        for (const source of ['netease', 'joox'] as const) {
          if (controller.signal.aborted) return;
          try {
            const provider = getTrackProvider(source);
            const res = await provider.search(query, 1, 8, controller.signal);
            const fresh = filterCandidates(res.items, known, dislikes);
            for (const t of fresh) {
              const key = t.source + ':' + t.id;
              if (existing.has(key)) continue;
              existing.add(key);
              collected.push(t);
              sources.add(source);
              if (collected.length >= 10) break;
            }
            if (collected.length >= 10) break;
          } catch {
            /* provider might be down — try the next */
          }
        }
        if (collected.length >= 10) break;
      }

      if (!alive) return;
      setTracks(collected);
      setSourceNames([...sources]);
      setLoading(false);
      if (collected.length) writeCache(Date.now(), collected);
    };

    void run();
    return () => {
      alive = false;
      controller.abort();
    };
    // Recompute when the underlying signal data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals]);

  return { tracks, loading, sourceNames, available: tracks.length > 0 };
}
