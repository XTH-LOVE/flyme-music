import { useEffect, useMemo, useRef } from 'react';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { buildListeningCalendar, type WeekStart } from '@/utils/listeningCalendar';
import './listening-calendar.css';

/** Sunday-first, matching the contribution-graph convention. */
const WEEK_START: WeekStart = 0;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
/** Only these get a label: seven of them would be a wall of text. */
const LABELLED_WEEKDAYS = new Set([1, 3, 5]);

const WEEKS_DESKTOP = 53;
const WEEKS_MOBILE = 20;

interface ListeningCalendarProps {
  /** Play log; only `ts` is read. */
  entries: readonly { ts: number }[];
  /** Week columns to show. */
  weeks?: number;
  className?: string;
}

/**
 * A year of listening as a contribution graph.
 *
 * The grid scrolls horizontally and opens scrolled to the right, because the
 * interesting end of a calendar is the recent one. The weekday column sits
 * outside the scroller so it stays put while the weeks move.
 *
 * The cells are decorative: the totals below carry the same information for
 * anyone not reading a 371-cell heatmap.
 */
export function ListeningCalendar({ entries, weeks, className }: ListeningCalendarProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const columns = weeks ?? (isDesktop ? WEEKS_DESKTOP : WEEKS_MOBILE);

  const calendar = useMemo(
    () => buildListeningCalendar(entries, { weeks: columns, weekStart: WEEK_START }),
    [entries, columns],
  );

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [columns, calendar.weeks]);

  return (
    <div className={'cal' + (className ? ' ' + className : '')}>
      <div className="cal__main">
        <div className="cal__weekdays" aria-hidden="true">
          {Array.from({ length: 7 }, (_, row) => {
            const weekday = (row + WEEK_START) % 7;
            return (
              <span key={row} className="cal__weekday">
                {LABELLED_WEEKDAYS.has(weekday) ? WEEKDAYS[weekday] : ''}
              </span>
            );
          })}
        </div>

        <div className="cal__scroller" ref={scroller}>
          <div className="cal__inner">
            <div className="cal__months" aria-hidden="true">
              {calendar.months.map((month) => (
                <span
                  key={month.col}
                  className="cal__month"
                  style={{ gridColumnStart: month.col + 1 }}
                >
                  {month.label}
                </span>
              ))}
            </div>
            <div className="cal__grid" aria-hidden="true">
              {calendar.days.map((day) => (
                <span
                  key={day.key}
                  className={
                    'cal__cell cal__cell--l' +
                    day.level +
                    (day.future ? ' cal__cell--future' : '')
                  }
                  title={
                    day.future
                      ? day.key
                      : day.key + ' · ' + (day.count ? day.count + ' 次播放' : '没有播放')
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="cal__foot">
        <div className="cal__stats">
          <span>
            <b>{calendar.total}</b> 次播放
          </span>
          <span>
            <b>{calendar.activeDays}</b> 天有记录
          </span>
          <span>
            <b>{calendar.currentStreak}</b> 天连续
          </span>
          <span>
            <b>{calendar.longestStreak}</b> 天最长连续
          </span>
        </div>
        <div className="cal__legend">
          <span>少</span>
          <span className="cal__cell cal__cell--l0" />
          <span className="cal__cell cal__cell--l1" />
          <span className="cal__cell cal__cell--l2" />
          <span className="cal__cell cal__cell--l3" />
          <span className="cal__cell cal__cell--l4" />
          <span>多</span>
        </div>
      </div>
    </div>
  );
}
