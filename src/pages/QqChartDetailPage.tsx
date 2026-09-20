import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { TrackListItem } from '@/components/TrackListItem';
import { ProgressiveList } from '@/components/ProgressiveList';
import { ProxyImg } from '@/components/ProxyImg';
import { EmptyState } from '@/design-system/components/EmptyState';
import { Skeleton } from '@/design-system/components/Skeleton';
import { getQqChartDetail, QQ_CHARTS, type QqChartDetail } from '@/music/charts';
import { playerController } from '@/player';
import './pages.css';
import '@/components/charts.css';

/** QQ 音乐官方榜单详情（真实曲目，可直接播放）。 */
export function QqChartDetailPage() {
  const { topId } = useParams();
  const [data, setData] = useState<QqChartDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!topId) return undefined;
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getQqChartDetail(Number(topId), controller.signal)
      .then((d) => {
        if (alive) {
          setData(d);
          setLoading(false);
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
  }, [topId, attempt]);

  if (loading) {
    return (
      <div className="page">
        <div className="chart-hero">
          <Skeleton width={148} height={148} radius="var(--am-radius-xl)" />
          <div style={{ flex: 1 }}>
            <Skeleton width={200} height={26} />
            <Skeleton width={260} height={14} className="mt8" />
          </div>
        </div>
        <Skeleton width="100%" height={300} radius="var(--am-radius-xl)" />
      </div>
    );
  }

  if (error || !data) {
    return <EmptyState title="榜单加载失败" description={error ?? '请检查网络后重试'} action={{ label: '重试', onClick: () => setAttempt((n) => n + 1) }} />;
  }

  const { meta, tracks } = data;
  const cfg = QQ_CHARTS.find((c) => c.topId === meta.topId);
  const palette = cfg?.palette ?? (['#31C270', '#8CE8B8'] as [string, string]);

  return (
    <div className="page">
      <div className="chart-hero">
        <div className="chart-hero__cover">
          {tracks[0]?.picUrl ? (
            <ProxyImg src={tracks[0].picUrl} alt={tracks[0].name} />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'linear-gradient(150deg, ' + palette[0] + ', ' + palette[1] + ')',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <Icon name="flame" size={44} />
            </div>
          )}
        </div>
        <div className="detail-hero__info">
          <div className="detail-hero__tag">QQ音乐官方榜</div>
          <h1 className="detail-hero__title">{meta.title || meta.titleDetail}</h1>
          {meta.period ? <p className="detail-hero__meta">第 {meta.period} 期 · {tracks.length} 首</p> : null}
          {meta.intro ? <p className="detail-hero__desc">{meta.intro}</p> : null}
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
          </div>
        </div>
      </div>
      <div className="song-list">
        <ProgressiveList
          items={tracks}
          resetKey={topId}
          renderItem={(track, i) => (
            <TrackListItem key={track.id + ':' + i} track={track} context={tracks} index={i} />
          )}
        />
      </div>
    </div>
  );
}
