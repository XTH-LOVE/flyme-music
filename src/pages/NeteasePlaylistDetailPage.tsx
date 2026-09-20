import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { LocatableTrackList } from '@/components/LocatableTrackList';
import { ProxyImg } from '@/components/ProxyImg';
import { ExpandableText } from '@/components/ExpandableText';
import { coverTransitionName } from '@/lib/coverTransition';
import { EmptyState } from '@/design-system/components/EmptyState';
import { Skeleton } from '@/design-system/components/Skeleton';
import { useNeteasePlaylistDetail } from '@/music/netease/useNetease';
import { playerController } from '@/player';
import { usePlaylistStore } from '@/store/usePlaylistStore';
import { useNeteaseCollections } from '@/store/useNeteaseCollections';
import { notify } from '@/utils/notify';
import { formatPlays } from '@/utils/format';
import './pages.css';

/** Real Netease playlist detail - online tracks, directly playable. */
export function NeteasePlaylistDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useNeteasePlaylistDetail(id);
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
  const addBatch = usePlaylistStore((s) => s.addBatch);
  const collections = useNeteaseCollections((s) => s.items);
  const toggleCollection = useNeteaseCollections((s) => s.toggle);
  const [importing, setImporting] = useState(false);

  if (loading) {
    return (
      <div className="page">
        <div className="detail-hero">
          <Skeleton width={180} height={180} radius="var(--am-radius-xl)" />
          <div className="detail-hero__info">
            <Skeleton width={220} height={26} />
            <Skeleton width={280} height={14} className="mt8" />
          </div>
        </div>
        <Skeleton width="100%" height={280} radius="var(--am-radius-xl)" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        title="歌单加载失败"
        description={error ?? '请检查网络后重试（真实歌单需要 dev 代理在线）'}
      />
    );
  }

  const { meta, tracks } = data;
  // Shared-element target: only one element per page carries the name, so
  // leaving it applied across re-renders is safe and keeps the morph stable.
  const vtName = coverTransitionName(String(id));
  const subscribed = collections.some((c) => c.id === String(id));

  const importAsMine = () => {
    if (importing || !tracks.length) return;
    setImporting(true);
    try {
      const pid = createPlaylist(meta.name);
      addBatch(pid, tracks);
      notify('已导入 ' + tracks.length + ' 首到「' + meta.name + '」');
      navigate('/my-playlist/' + pid);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-hero__cover" style={{ viewTransitionName: vtName }}>
          <div className="detail-hero__cover-fallback" aria-hidden="true">
            <Icon name="music" size={42} />
          </div>
          {meta.coverUrl ? (
            <ProxyImg src={meta.coverUrl.replace('400y400', '600y600')} alt={meta.name} />
          ) : null}
        </div>
        <div className="detail-hero__info">
          <div className="detail-hero__tag">网易云歌单</div>
          <h1 className="detail-hero__title">{meta.name}</h1>
          {meta.creator ? <p className="detail-hero__meta">by {meta.creator}</p> : null}
          {meta.description ? <ExpandableText className="detail-hero__desc" text={meta.description} /> : null}
          <p className="detail-hero__meta">
            {tracks.length} 首 · {formatPlays(meta.playCount)} 次播放
          </p>
          <div className="detail-hero__actions">
            <button
              className="am-btn am-btn--primary am-btn--md"
              disabled={!tracks.length}
              onClick={() => playerController.playTracks(tracks, 0)}
            >
              <Icon name="play" size={16} />
              播放全部
            </button>
            <button
              className="am-btn am-btn--secondary am-btn--md"
              disabled={!tracks.length}
              onClick={() => playerController.playTracks(tracks, Math.floor(Math.random() * tracks.length))}
            >
              <Icon name="shuffle" size={16} />
              随机
            </button>
            <button
              className="am-btn am-btn--secondary am-btn--md"
              disabled={!tracks.length || importing}
              onClick={importAsMine}
            >
              <Icon name="queue" size={16} />
              {importing ? '导入中…' : '导入为我的歌单'}
            </button>
            <button
              className="am-btn am-btn--secondary am-btn--md"
              onClick={() =>
                toggleCollection({
                  id: String(id),
                  name: meta.name,
                  coverUrl: meta.coverUrl,
                  creator: meta.creator,
                })
              }
            >
              <Icon name={subscribed ? 'heartFill' : 'heart'} size={16} />
              {subscribed ? '已收藏' : '收藏歌单'}
            </button>
          </div>
        </div>
      </div>
      <LocatableTrackList tracks={tracks} resetKey={id} />
    </div>
  );
}
