import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { SectionHeader } from '@/design-system/components/SectionHeader';
import { Skeleton } from '@/design-system/components/Skeleton';
import { EmptyState } from '@/design-system/components/EmptyState';
import { ProxyImg } from '@/components/ProxyImg';
import { getNeteaseToplists, QQ_CHARTS, getQqChartTop, type NetChart, type QqChartTop } from '@/music/charts';
import './pages.css';
import '@/components/charts.css';

/** 榜单封面图：直连失败自动走服务器代理，底下始终有渐变兑底。 */
function ChartTileImg({ src, alt }: { src: string; alt: string }) {
  return <ProxyImg src={src} alt={alt} className="chart-card-tile__img" />;
}

/** 音乐库 = 排行榜：网易云官方榜 + QQ 音乐官方榜（全部真实数据）。 */
export function LibraryPage() {
  const navigate = useNavigate();
  const [netCharts, setNetCharts] = useState<NetChart[] | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  const [qqTops, setQqTops] = useState<Record<number, QqChartTop>>({});

  useEffect(() => {
    let alive = true;
    getNeteaseToplists()
      .then((list) => {
        if (alive) setNetCharts(list);
      })
      .catch((e: unknown) => {
        if (alive) setNetError(e instanceof Error ? e.message : String(e));
      });
    // 每个 QQ 榜单拉取头名封面（轻量请求）
    QQ_CHARTS.forEach((c) => {
      getQqChartTop(c.topId)
        .then((top) => {
          if (alive) setQqTops((prev) => ({ ...prev, [c.topId]: top }));
        })
        .catch(() => undefined);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="page">
      <h1 className="page-title">排行榜</h1>

      <SectionHeader title="网易云官方榜" />
      {!netCharts && !netError ? (
        <div className="chart-grid-cards">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={200} radius="var(--am-radius-xl)" />
          ))}
        </div>
      ) : netError ? (
        <EmptyState icon="flame" title="榜单加载失败" description={netError} />
      ) : (
        <div className="chart-grid-cards">
          {(netCharts ?? []).map((c) => (
            <button key={c.id} className="chart-card-tile" onClick={() => navigate('/chart/netease/' + c.id)}>
              <div className="chart-card-tile__cover">
                <div
                  className="chart-card-tile__grad"
                  style={{ background: 'linear-gradient(150deg, #C8456A, #F2A0B8)' }}
                >
                  <div className="chart-card-tile__grad-icon">
                    <Icon name="music" size={20} />
                  </div>
                </div>
                {(c.firstTrackCoverUrl || c.coverUrl) ? <ChartTileImg src={c.firstTrackCoverUrl || c.coverUrl} alt={c.name} /> : null}
                {c.updateFrequency ? (
                  <span className="chart-card-tile__badge">{c.updateFrequency}</span>
                ) : null}
              </div>
              <div className="chart-card-tile__title">{c.name}</div>
              <div className="chart-card-tile__subtitle">网易云音乐 · 官方榜单</div>
            </button>
          ))}
        </div>
      )}

      <SectionHeader title="QQ音乐官方榜" />
      <div className="chart-grid-cards">
        {QQ_CHARTS.map((c) => {
          const top = qqTops[c.topId];
          return (
            <button key={c.topId} className="chart-card-tile" onClick={() => navigate('/chart/qq/' + c.topId)}>
              <div className="chart-card-tile__cover">
                <div
                  className="chart-card-tile__grad"
                  style={{ background: 'linear-gradient(150deg, ' + c.palette[0] + ', ' + c.palette[1] + ')' }}
                >
                  <div className="chart-card-tile__grad-icon">
                    <Icon name="flame" size={20} />
                  </div>
                </div>
                {top?.cover ? <ChartTileImg src={top.cover} alt={top.topSong} /> : null}
                <span className="chart-card-tile__badge">每日更新</span>
              </div>
              <div className="chart-card-tile__title">{c.name}</div>
              <div className="chart-card-tile__subtitle">
                {top?.topSong ? 'NO.1 ' + top.topSong : c.desc}
              </div>
            </button>
          );
        })}
      </div>

    </div>
  );
}
