import { useEffect, useState } from 'react';
import {
  getNeteasePlaylistDetail,
  getRecommendPlaylists,
  type NetPlaylistDetail,
  type NetPlaylistSummary,
} from './netease-api';

const RECOMMEND_CACHE_KEY = 'aurora.netease.recommend';
const RECOMMEND_TTL_MS = 60 * 60 * 1000;

interface CachedRecommend {
  at: number;
  items: NetPlaylistSummary[];
}

function readCache(): NetPlaylistSummary[] | null {
  try {
    const raw = localStorage.getItem(RECOMMEND_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRecommend;
    if (Date.now() - parsed.at > RECOMMEND_TTL_MS) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

/** 真实推荐歌单（带 1 小时本地缓存）。 */
export function useNeteaseRecommend(): {
  data: NetPlaylistSummary[] | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<NetPlaylistSummary[] | null>(readCache);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    if (data && data.length) setLoading(false);
    getRecommendPlaylists(controller.signal)
      .then((items) => {
        if (!alive) return;
        setData(items);
        setLoading(false);
        try {
          localStorage.setItem(
            RECOMMEND_CACHE_KEY,
            JSON.stringify({ at: Date.now(), items }),
          );
        } catch {
          /* ignore */
        }
      })
      .catch((e: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error };
}

/** 真实歌单详情。 */
export function useNeteasePlaylistDetail(id: string | undefined): {
  data: NetPlaylistDetail | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<NetPlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getNeteasePlaylistDetail(id, controller.signal)
      .then((detail) => {
        if (!alive) return;
        setData(detail);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [id]);

  return { data, loading, error };
}
