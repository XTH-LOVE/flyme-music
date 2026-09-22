import { useMemo } from 'react';
import { Icon } from '@/components/Icon';
import { useLibraryStore, type DayLog } from '@/store/useLibraryStore';
import './time-machine.css';

/**
 * A year ago today, as it sounded.
 *
 * The point is not statistics - the stats page already has those. It is that a
 * date is a memory in a way a total never is: "you played 412 songs this month"
 * means nothing, and "on this day last year you were listening to this" means
 * something. So this shows one day, not a range.
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

/** `YYYY-MM-DD` shifted back a year, handling the 29th of February. */
function sameDayLastYear(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const lastYear = year - 1;
  // 2024-02-29 has no counterpart in 2023; the 28th is the honest neighbour.
  if (month === 2 && day === 29) return lastYear + '-02-28';
  return lastYear + '-' + pad(month) + '-' + pad(day);
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
    const target = sameDayLastYear(today());
    // Exact date first, then the nearest earlier one. Later days are not
    // considered: "a year ago" that turns out to be last week is a lie.
    return dayLog.find((d) => d.date === target) ?? dayLog.find((d) => d.date < target) ?? null;
  }, [dayLog]);

  if (!memory) {
    return (
      <div className="tm-card tm-card--empty">
        <Icon name="clock" size={20} />
        <div>
          <div className="tm-card__title">音乐时光机</div>
          <div className="tm-card__sub">
            从今天开始记录。明年今天，这里会告诉你当时在听什么。
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
        <Icon name="clock" size={18} />
        <span className="tm-card__title">{label}</span>
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

      {ago < 365 ? (
        // Being honest about the fallback rather than letting the user believe
        // this is a year ago when it is not.
        <div className="tm-card__note">还没有满一年的记录，这是能找到的最早一天</div>
      ) : null}
    </div>
  );
}
