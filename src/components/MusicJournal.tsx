import { useMemo } from 'react';
import { Icon } from '@/components/Icon';
import { useLibraryStore, type DayLog } from '@/store/useLibraryStore';
import './music-journal.css';

/**
 * A diary of what was listened to, most recent day first.
 *
 * The stats page answers questions about ranges - this month, this year - and
 * the time machine answers one about a specific date a year back. Neither
 * answers "what have I been listening to lately", which is the question people
 * actually ask themselves, and the one that is worth scrolling.
 *
 * Reads the same per-day rows the time machine does, so a day costs one line
 * and the whole diary is a few dozen.
 */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function todayKey(): string {
  const now = new Date();
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}

/** "今天" / "昨天" / "9 月 21 日 周一" - the recent days deserve a word, not a date. */
function describe(date: string): string {
  const today = todayKey();
  if (date === today) return '今天';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey =
    yesterday.getFullYear() +
    '-' +
    pad(yesterday.getMonth() + 1) +
    '-' +
    pad(yesterday.getDate());
  if (date === yesterdayKey) return '昨天';

  const parsed = new Date(date + 'T00:00:00');
  return (
    parsed.getMonth() +
    1 +
    ' 月 ' +
    parsed.getDate() +
    ' 日 周' +
    WEEKDAYS[parsed.getDay()]
  );
}

export function MusicJournal({ limit = 14 }: { limit?: number }) {
  const dayLog = useLibraryStore((s) => s.dayLog);

  // The store keeps these newest first already, but sorting here means the
  // diary cannot be broken by a caller that rehydrated them another way.
  const days = useMemo<DayLog[]>(
    () => [...dayLog].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit),
    [dayLog, limit],
  );

  if (!days.length) {
    return (
      <div className="journal journal--empty">
        <Icon name="lyric" size={18} />
        <span>还没有记录。听一会儿，这里会长出你的听歌日记。</span>
      </div>
    );
  }

  return (
    <div className="journal">
      <div className="journal__head">
        <Icon name="lyric" size={18} />
        <span className="journal__title">音乐日记</span>
      </div>

      <ol className="journal__list">
        {days.map((day) => (
          <li key={day.date} className="journal__day">
            <div className="journal__when">
              <span className="journal__label">{describe(day.date)}</span>
              <span className="journal__count">{day.plays} 首</span>
            </div>
            <div className="journal__tracks">
              {day.top.map((track) => (
                <span key={track.key} className="journal__track">
                  {track.name}
                  {track.count > 1 ? <em>×{track.count}</em> : null}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
