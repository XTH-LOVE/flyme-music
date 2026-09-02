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
import { useProviderData } from '@/music/musicStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import './pages.css';
import './pages-extra.css';

const PAGE_SIZE = 20;

export function SearchPage() {
  const [source, setSource] = useState<MusicSource>('netease');
  const [keyword, setKeyword] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [items, setItems] = useState<MusicTrack[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const history = useLibraryStore((s) => s.searchHistory);
  const addKeyword = useLibraryStore((s) => s.addSearchKeyword);
  const removeKeyword = useLibraryStore((s) => s.removeSearchKeyword);
  const clearHistory = useLibraryStore((s) => s.clearSearchHistory);
  const { data: hotKeywords } = useProviderData(() => getMusicProvider().getHotKeywords());

  const runSearch = async (kw: string, src: MusicSource, pageNo: number, append: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const provider = getTrackProvider(src);
      const res = await provider.search(kw, pageNo, PAGE_SIZE, controller.signal);
      if (controller.signal.aborted) return;
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
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

  const doSearch = (kw: string, src: MusicSource = source) => {
    const value = kw.trim();
    if (!value) return;
    setKeyword(value);
    if (value) addKeyword(value);
    void runSearch(value, src, 1, false);
  };

  const switchSource = (src: MusicSource) => {
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
        {searchSourceOptions.map((opt) => (
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
      ) : loading && !items.length ? (
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
    </div>
  );
}

function sourceLabel(src: MusicSource): string {
  const opt = searchSourceOptions.find((o) => o.source === src);
  return opt ? opt.label : src;
}
