import { useMemo } from 'react';
import { Icon } from '@/components/Icon';
import { useLibraryStore, type DayLog } from '@/store/useLibraryStore';
import './time-machine.css';

/**
 * A useful listening memory: the user's strongest listening day.
 *
 * Instead of waiting a full year for an exact date, this shows the best recorded
 * day immediately. That makes the card useful from the first week of using the
 * app and gives the user something actionable to remember.
 *
 * When there is no entry for the exact date it falls back to the nearest one
 * before it rather than showing nothing. The first year of use has no "a year
 * ago" to show, and an empty card every day for twelve months would teach
 * people to stop looking.
 */

const pad = (value: number) => String(value).padStart(2, '0');

/** The local date, as `YYYY-MM-DD`. Local, because "today" is a local question. */
function today(): string {
  const now = new Date();
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}

function describe(date: string): string {
  const [year, month, day] = date.split('-');
  return year + ' 年 ' + Number(month) + ' 月 ' + Number(day) + ' 日';
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00').getTime();
  const b = new Date(to + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

export function TimeMachine() {
  const dayLog = useLibraryStore((s) => s.dayLog);

  const memory = useMemo<DayLog | null>(() => {
    if (!dayLog.length) return null;
    return [...dayLog].sort((a, b) => b.plays - a.plays || (a.date < b.date ? 1 : -1))[0] ?? null;
  }, [dayLog]);

  if (!memory) {
    return (
      <div className="tm-card tm-card--empty">
        <Icon name="flame" size={20} />
        <div>
          <div className="tm-card__title">听歌高光</div>
          <div className="tm-card__sub">
            再听几首歌，这里会记录你播放最多的一天。
          </div>
        </div>
      </div>
    );
  }

  const ago = daysBetween(memory.date, today());
  const years = Math.floor(ago / 365);
  const label = years >= 1 ? years + ' 年前的今天' : ago === 0 ? '今天' : ago + ' 天前';

  return (
    <div className="tm-card">
      <div className="tm-card__head">
        <Icon name="flame" size={18} />
        <span className="tm-card__title">你的听歌高光</span>
        <span className="tm-card__date">{describe(memory.date)}</span>
      </div>

      <div className="tm-card__count">
        你听了 <strong>{memory.plays}</strong> 首
      </div>

      <ul className="tm-card__list">
        {memory.top.map((track) => (
          <li key={track.key}>
            <span className="tm-card__name">{track.name}</span>
            {track.count > 1 ? <span className="tm-card__times">×{track.count}</span> : null}
          </li>
        ))}
      </ul>

      <div className="tm-card__note">{label} · 播放最多的一天</div>
    </div>
  );
}
