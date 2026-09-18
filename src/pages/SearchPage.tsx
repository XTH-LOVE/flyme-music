import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { TrackListItem } from '@/components/TrackListItem';
import { SearchBar } from '@/design-system/components/SearchBar';
import { SectionHeader } from '@/design-system/components/SectionHeader';
import { Chip } from '@/design-system/components/Chip';
import { EmptyState } from '@/design-system/components/EmptyState';
import { Skeleton } from '@/design-system/components/Skeleton';
import { getMusicProvider } from '@/music/musicService';
import { getTrackProvider } from '@/music/source/factory';
import { searchSourceOptions } from '@/music/source/types';
import type { MusicSource, MusicTrack } from '@/music/source/types';
import { aggregateSearch, dedupeKey } from '@/ai/musicSearch';
import { useProviderData } from '@/music/musicStore';
import { getNeteaseSearchMeta, type NetSearchMeta } from '@/music/netease/netease-api';
import { useNavigate } from 'react-router-dom';
import { useLibraryStore } from '@/store/useLibraryStore';
import './pages.css';
import './pages-extra.css';

const PAGE_SIZE = 20;

/**
 * 'all' is a UI-only tab, not a MusicSource: it fans out to every provider and
 * merges the results, so it must not leak into the source union (the provider
 * factory would reject it).
 */
type SearchTab = MusicSource | 'all';

const SEARCH_TABS: { source: SearchTab; label: string }[] = [
  { source: 'all', label: '全部' },
  ...searchSourceOptions,
];

export function SearchPage() {
  const navigate = useNavigate();
  // Defaults to the aggregate tab: searching once and seeing every catalogue
  // beats guessing which of five tabs holds the song.
  const [source, setSource] = useState<SearchTab>('all');
  const [keyword, setKeyword] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [items, setItems] = useState<MusicTrack[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [meta, setMeta] = useState<NetSearchMeta | null>(null);
  const metaAbortRef = useRef<AbortController | null>(null);

  const history = useLibraryStore((s) => s.searchHistory);
  const addKeyword = useLibraryStore((s) => s.addSearchKeyword);
  const removeKeyword = useLibraryStore((s) => s.removeSearchKeyword);
  const clearHistory = useLibraryStore((s) => s.clearSearchHistory);
  const { data: hotKeywords } = useProviderData(() => getMusicProvider().getHotKeywords());

  const runSearch = async (kw: string, src: SearchTab, pageNo: number, append: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res =
        src === 'all'
          ? await aggregateSearch(kw, pageNo, PAGE_SIZE, controller.signal)
          : await getTrackProvider(src).search(kw, pageNo, PAGE_SIZE, controller.signal);
      if (controller.signal.aborted) return;
      setItems((prev) => {
        if (!append) return res.items;
        // aggregateSearch dedupes within one page, but page two can surface the
        // same song from a different source that page one already showed.
        const seen = new Set(prev.map(dedupeKey));
        return [...prev, ...res.items.filter((t) => !seen.has(dedupeKey(t)))];
      });
      setHasMore(res.hasMore);
      setPage(pageNo);
      setSubmitted(kw);
    } catch {
      if (!append) setItems([]);
      setHasMore(false);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  };

  const doSearch = (kw: string, src: SearchTab = source) => {
    const value = kw.trim();
    if (!value) return;
    setKeyword(value);
    if (value) addKeyword(value);
    void runSearch(value, src, 1, false);
    // Multi-type discovery runs for EVERY source: artist/album cards come
    // from the netease library even when songs are searched on Joox.
    metaAbortRef.current?.abort();
    const mc = new AbortController();
    metaAbortRef.current = mc;
    setMeta(null);
    getNeteaseSearchMeta(value, mc.signal)
      .then((m) => {
        if (!mc.signal.aborted) setMeta(m);
      })
      .catch(() => undefined);
  };

  const switchSource = (src: SearchTab) => {
    setSource(src);
    if (submitted) void runSearch(submitted, src, 1, false);
  };

  return (
    <div className="page">
      <h1 className="page-title">搜索</h1>
      <SearchBar
        value={keyword}
        placeholder="搜索歌曲、歌手、专辑"
        autoFocus
        onChange={setKeyword}
        onSubmit={(v) => doSearch(v)}
      />

      <div className="source-chips">
        {SEARCH_TABS.map((opt) => (
          <Chip key={opt.source} active={source === opt.source} onClick={() => switchSource(opt.source)}>
            {opt.label}
          </Chip>
        ))}
      </div>

      {!submitted ? (
        <>
          <section>
            <SectionHeader title="热门搜索" />
            <div className="chip-row chip-row--wrap">
              {(hotKeywords ?? []).map((kw) => (
                <Chip key={kw} onClick={() => doSearch(kw)}>
                  {kw}
                </Chip>
              ))}
            </div>
          </section>

          {history.length ? (
            <section>
              <div className="history-header">
                <SectionHeader title="搜索历史" />
                <button className="history-clear" onClick={clearHistory}>
                  <Icon name="trash" size={14} />
                  清空
                </button>
              </div>
              <div className="chip-row chip-row--wrap">
                {history.map((kw) => (
                  <span key={kw} className="history-chip">
                    <Chip onClick={() => doSearch(kw)}>{kw}</Chip>
                    <button className="history-chip__remove" onClick={() => removeKeyword(kw)} aria-label="删除">
                      <Icon name="close" size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <>
          {/* 相关歌手 / 专辑：搜名字想听"这个人/这张专辑"的直接入口 */}
          {meta && (meta.artists.length > 0 || meta.albums.length > 0) ? (
            <section className="search-meta">
              {meta.artists.length ? (
                <>
                  <SectionHeader title="相关歌手" />
                  <div className="search-meta__row">
                    {meta.artists.map((a) => (
                      <button key={a.id} className="search-meta__card" onClick={() => navigate('/ne-artist/' + a.id)}>
                        {a.coverUrl ? <img src={a.coverUrl} alt={a.name} /> : <Icon name="user" size={30} />}
                        <span className="search-meta__name">{a.name}</span>
                        <span className="search-meta__kind">歌手</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              {meta.albums.length ? (
                <>
                  <SectionHeader title="相关专辑" />
                  <div className="search-meta__row">
                    {meta.albums.map((al) => (
                      <button key={al.id} className="search-meta__card" onClick={() => navigate('/ne-album/' + al.id)}>
                        {al.coverUrl ? <img src={al.coverUrl} alt={al.name} /> : <Icon name="album" size={30} />}
                        <span className="search-meta__name">{al.name}</span>
                        <span className="search-meta__kind">{al.artist || '专辑'}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          {loading && !items.length ? (
            <div className="song-list">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={54} radius="var(--am-radius-lg)" />
              ))}
            </div>
          ) : !items.length ? (
            <EmptyState icon="search" title={'没有在「' + sourceLabel(source) + '」找到「' + submitted + '」'} description="换个音源或关键词试试" />
          ) : (
            <section>
              <SectionHeader title={'歌曲 · ' + sourceLabel(source)} />
              <div className="song-list">
                {items.map((track, i) => (
                  <TrackListItem key={track.source + ':' + track.id + ':' + i} track={track} context={items} />
                ))}
              </div>
              {hasMore ? (
                <button className="am-btn am-btn--secondary am-btn--md load-more" disabled={loading} onClick={() => void runSearch(submitted, source, page + 1, true)}>
                  {loading ? '加载中…' : '加载更多'}
                </button>
              ) : null}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function sourceLabel(src: SearchTab): string {
  const opt = SEARCH_TABS.find((o) => o.source === src);
  return opt ? opt.label : src;
}
