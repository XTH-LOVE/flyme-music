import { useMemo } from 'react';
import { Icon } from '@/components/Icon';
import { OS3Wallpaper } from '@/components/OS3Wallpaper';
import { TrackCover } from '@/components/TrackCover';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { playerController } from '@/player';
import type { MusicSource, MusicTrack } from '@/music/source/types';
import { fallbackPalette } from '@/utils/palette';
import './stats.css';

interface DayCell {
  key: string;
  count: number;
  label: string;
}

const dayKey = (d: Date) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

const musicSources = new Set<MusicSource>(['netease', 'joox', 'qq', 'mock']);

function legacyTrack(key: string, name: string, artist: string): MusicTrack | undefined {
  const separator = key.indexOf(':');
  const source = key.slice(0, separator) as MusicSource;
  const id = key.slice(separator + 1);
  if (separator < 1 || !id || !musicSources.has(source)) return undefined;
  return {
    id,
    name,
    artist: artist.split('/').map((item) => item.trim()).filter(Boolean),
    album: '',
    pic_id: id,
    url_id: id,
    lyric_id: id,
    source,
  };
}

/** Listening analytics + Halcyon-style listening calendar. */
export function StatsPage() {
  const playLog = useLibraryStore((s) => s.playLog);
  const recentTracks = useLibraryStore((s) => s.recentTracks);
  const favorites = useLibraryStore((s) => s.favoriteSongIds);
  const current = usePlayerStore((s) => s.current);
  const palette = (current?.palette ?? fallbackPalette(current?.id ?? 'stats')) as unknown as string[];

  const stats = useMemo(() => {
    const today = dayKey(new Date());
    let todayCount = 0;
    const recentByKey = new Map(recentTracks.map((track) => [track.source + ':' + track.id, track]));
    const songCount = new Map<string, { count: number; name: string; artist: string; track?: MusicTrack }>();
    const artistCount = new Map<string, number>();
    const dayCount = new Map<string, number>();

    for (const e of playLog) {
      const dk = dayKey(new Date(e.ts));
      if (dk === today) todayCount += 1;
      dayCount.set(dk, (dayCount.get(dk) ?? 0) + 1);
      const s = songCount.get(e.key) ?? {
        count: 0,
        name: e.name,
        artist: e.artist,
        track: e.track ?? recentByKey.get(e.key) ?? legacyTrack(e.key, e.name, e.artist),
      };
      s.count += 1;
      songCount.set(e.key, s);
      for (const a of e.artist.split('/').map((x) => x.trim()).filter(Boolean)) {
        artistCount.set(a, (artistCount.get(a) ?? 0) + 1);
      }
    }

    const topSongs = [...songCount.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8);
    const topArtists = [...artistCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const days: DayCell[] = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      days.push({
        key,
        count: dayCount.get(key) ?? 0,
        label: (d.getMonth() + 1) + '月' + d.getDate() + '日',
      });
    }
    return { total: playLog.length, todayCount, songs: songCount.size, topSongs, topArtists, days };
  }, [playLog, recentTracks]);

  const maxDay = Math.max(1, ...stats.days.map((d) => d.count));
  const level = (c: number) => (c === 0 ? 0 : c / maxDay > 0.66 ? 4 : c / maxDay > 0.4 ? 3 : c / maxDay > 0.15 ? 2 : 1);

  return (
    <div className="stats-page">
      <div className="stats-hero">
        <OS3Wallpaper colors={palette} className="stats-hero__bg" opacity={0.9} />
        <div className="stats-hero__text">
          <div className="stats-hero__title">听歌统计</div>
          <div className="stats-hero__sub">记录每一次与音乐的相遇</div>
        </div>
        <div className="stats-hero__num">
          <span>{stats.total}</span>
          <em>累计播放</em>
        </div>
      </div>

      <div className="stats-cards">
        <div className="stats-card">
          <Icon name="clock" size={20} />
          <div className="stats-card__num">{stats.todayCount}</div>
          <div className="stats-card__label">今日播放</div>
        </div>
        <div className="stats-card">
          <Icon name="music" size={20} />
          <div className="stats-card__num">{stats.songs}</div>
          <div className="stats-card__label">播放歌曲数</div>
        </div>
        <div className="stats-card">
          <Icon name="heartFill" size={20} />
          <div className="stats-card__num">{favorites.length}</div>
          <div className="stats-card__label">喜欢的歌曲</div>
        </div>
        <div className="stats-card">
          <Icon name="flame" size={20} />
          <div className="stats-card__num">{stats.topSongs[0]?.[1].count ?? 0}</div>
          <div className="stats-card__label">单曲最高播放</div>
        </div>
      </div>

      <div className="stats-grid">
        <section className="stats-panel">
          <div className="stats-panel__title">播放排行</div>
          {stats.topSongs.length ? (
            stats.topSongs.map(([key, s], i) => (
              <button
                key={key}
                type="button"
                className={'stats-song stats-song--playable' + (current && key === current.source + ':' + current.id ? ' stats-song--active' : '')}
                disabled={!s.track}
                onClick={() => s.track && playerController.playTrack(s.track)}
                aria-label={'播放《' + s.name + '》'}
              >
                <span className={'stats-song__rank' + (i < 3 ? ' stats-song__rank--top' : '')}>
                  {i + 1}
                </span>
                {s.track ? (
                  <span className="stats-song__cover" aria-hidden="true">
                    <TrackCover track={s.track} bare radius="var(--am-radius-sm)" />
                  </span>
                ) : <span className="stats-song__cover stats-song__cover--empty" aria-hidden="true"><Icon name="music" size={16} /></span>}
                <div className="stats-song__body">
                  <div className="stats-song__name">{s.name}</div>
                  <div className="stats-song__artist">{s.artist}</div>
                </div>
                <span className="stats-song__count">{s.count} 次</span>
                <span className="stats-song__play" aria-hidden="true"><Icon name="play" size={15} /></span>
              </button>
            ))
          ) : (
            <div className="stats-empty">还没有播放记录，先去听几首歌吧</div>
          )}
        </section>

        <section className="stats-panel">
          <div className="stats-panel__title">常听歌手</div>
          {stats.topArtists.length ? (
            stats.topArtists.map(([name, count], i) => (
              <div key={name} className="stats-song">
                <span className={'stats-song__rank' + (i < 3 ? ' stats-song__rank--top' : '')}>
                  {i + 1}
                </span>
                <div className="stats-song__body">
                  <div className="stats-song__name">{name}</div>
                </div>
                <span className="stats-song__count">{count} 次</span>
              </div>
            ))
          ) : (
            <div className="stats-empty">暂无数据</div>
          )}
        </section>
      </div>

      <section className="stats-panel stats-calendar-panel">
        <div className="stats-panel__title">听歌日历 · 最近 12 周</div>
        <div className="stats-calendar">
          {stats.days.map((d) => (
            <div
              key={d.key}
              className={'stats-cal stats-cal--l' + level(d.count)}
              title={d.label + ' · ' + d.count + ' 次播放'}
            />
          ))}
        </div>
        <div className="stats-calendar__legend">
          <span>少</span>
          <div className="stats-cal stats-cal--l0" />
          <div className="stats-cal stats-cal--l1" />
          <div className="stats-cal stats-cal--l2" />
          <div className="stats-cal stats-cal--l3" />
          <div className="stats-cal stats-cal--l4" />
          <span>多</span>
        </div>
      </section>
    </div>
  );
}
