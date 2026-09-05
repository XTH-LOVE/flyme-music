import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NetPlaylistCard } from '@/components/NetPlaylistCard';
import { Chip } from '@/design-system/components/Chip';
import { EmptyState } from '@/design-system/components/EmptyState';
import { Skeleton } from '@/design-system/components/Skeleton';
import { getHighQualityPlaylists, type NetPlaylistSummary } from '@/music/netease/netease-api';
import { useNeteaseCollections } from '@/store/useNeteaseCollections';
import './pages.css';
import './pages-extra.css';

const CATS = [
  '全部', '华语', '欧美', '日语', '韩语', '粤语',
  '流行', '说唱', '摇滚', '电子', '民谣', '轻音乐',
  '古风', 'ACG', '影视原声', '治愈', '学习', '驾车', '夜晚', '怀旧',
];

/** 歌单广场：真实精品歌单，分类可切换，可翻页。 */
export function PlaylistSquarePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const collections = useNeteaseCollections((s) => s.items);
  const cat = searchParams.get('cat') || '全部';
  const [items, setItems] = useState<NetPlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef(0);
  const seqRef = useRef(0);

  const load = useCallback(
    (category: string, append: boolean) => {
      const seq = ++seqRef.current;
      setLoading(true);
      setError(null);
      const lasttime = append ? cursorRef.current : 0;
      getHighQualityPlaylists(category === '全部' ? '全部' : category, lasttime)
        .then((page) => {
          if (seq !== seqRef.current) return;
          cursorRef.current = page.lasttime;
          setItems((prev) => (append ? [...prev, ...page.items] : page.items));
          setHasMore(page.more && page.items.length > 0);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if (seq !== seqRef.current) return;
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        });
    },
    [],
  );

  useEffect(() => {
    cursorRef.current = 0;
    setItems([]);
    load(cat, false);
  }, [cat, load]);

  return (
    <div className="page">
      <h1 className="page-title">歌单广场</h1>
      {collections.length ? (
        <>
          <h2 className="am-section-header">我收藏的歌单</h2>
          <div className="chip-row chip-row--wrap">
            {collections.map((c) => (
              <Chip key={c.id} onClick={() => navigate('/ne-playlist/' + c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </>
      ) : null}
      <div className="chip-row chip-row--wrap" style={{ marginTop: collections.length ? 0 : undefined }}>
        {CATS.map((c) => (
          <Chip
            key={c}
            active={cat === c}
            onClick={() => setSearchParams({ cat: c })}
          >
            {c}
          </Chip>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        {loading && !items.length ? (
          <div className="grid-cards">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} height={180} radius="var(--am-radius-xl)" />
            ))}
          </div>
        ) : error && !items.length ? (
          <EmptyState icon="compass" title="歌单加载失败" description={error} />
        ) : (
          <>
            <div className="grid-cards">
              {items.map((pl) => (
                <NetPlaylistCard key={pl.id} playlist={pl} />
              ))}
            </div>
            {hasMore ? (
              <button
                className="am-btn am-btn--secondary am-btn--md load-more"
                disabled={loading}
                onClick={() => load(cat, true)}
              >
                {loading ? '加载中…' : '加载更多'}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
