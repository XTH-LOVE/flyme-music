import { describe, expect, it } from 'vitest';
import { NEAR_ROWS, needsLocating, rowSelector, trackKey, visibleBand } from './locatePlaying';

/** A row 56px tall, the height of a `.song-item`. */
const ROW = 56;
const rowAt = (top: number) => ({ top, bottom: top + ROW });

describe('visibleBand', () => {
  it('is the viewport when the container covers it', () => {
    expect(visibleBand({ top: -400, bottom: 4000 }, 800)).toEqual({ top: 0, bottom: 800 });
  });

  it('is the container when the container is the smaller of the two', () => {
    expect(visibleBand({ top: 120, bottom: 420 }, 800)).toEqual({ top: 120, bottom: 420 });
  });

  it('clamps a container that has scrolled up past the top', () => {
    expect(visibleBand({ top: -180, bottom: 260 }, 800)).toEqual({ top: 0, bottom: 260 });
  });

  it('clamps a container that extends below the fold', () => {
    expect(visibleBand({ top: 500, bottom: 5000 }, 800)).toEqual({ top: 500, bottom: 800 });
  });
});

describe('needsLocating', () => {
  const band = { top: 0, bottom: 800 };
  const slack = ROW * NEAR_ROWS;

  it('is false for a row in the middle of the band', () => {
    expect(needsLocating(rowAt(300), band, ROW)).toBe(false);
  });

  it('is false for a row that is only one nudge off the top', () => {
    expect(needsLocating(rowAt(-ROW), band, ROW)).toBe(false);
  });

  it('is false while the row is still inside the two-row slack', () => {
    // Bottom sits exactly at band.top - slack: the boundary is still "near".
    expect(needsLocating({ top: -slack - ROW, bottom: -slack }, band, ROW)).toBe(false);
  });

  it('is true once the row is more than two rows above the band', () => {
    expect(needsLocating({ top: -slack - ROW - 1, bottom: -slack - 1 }, band, ROW)).toBe(true);
  });

  it('is true once the row is more than two rows below the band', () => {
    expect(needsLocating(rowAt(800 + slack + 1), band, ROW)).toBe(true);
  });

  it('is false while the row is still inside the slack below the band', () => {
    expect(needsLocating(rowAt(800 + slack - ROW), band, ROW)).toBe(false);
  });

  it('scales the slack with the row height', () => {
    const tall = 120;
    const row = { top: 800 + ROW * NEAR_ROWS + 1, bottom: 800 + ROW * NEAR_ROWS + 1 + tall };
    // Inside the tall row's own slack, outside the short one's.
    expect(needsLocating(row, band, ROW)).toBe(true);
    expect(needsLocating(row, band, tall)).toBe(false);
  });

  it('degrades to "off screen at all" when a row has no measured height', () => {
    expect(needsLocating({ top: -1, bottom: -1 }, band, 0)).toBe(true);
    expect(needsLocating({ top: 1, bottom: 1 }, band, 0)).toBe(false);
  });

  it('honours an explicit slack override', () => {
    // Just over one row below the band: hidden at two rows of slack, shown at
    // one, since a single row of slack no longer reaches it.
    const row = rowAt(800 + ROW + 1);
    expect(needsLocating(row, band, ROW, NEAR_ROWS)).toBe(false);
    expect(needsLocating(row, band, ROW, 1)).toBe(true);
    expect(needsLocating(row, band, ROW, 0)).toBe(true);
  });

  it('is false for an empty band that the row sits inside', () => {
    // A container clipped to nothing: nothing is visible, but the row is not
    // outside the band either, so the rule stays quiet rather than flickering.
    const empty = { top: 400, bottom: 400 };
    expect(needsLocating({ top: 400, bottom: 456 }, empty, ROW)).toBe(false);
  });
});

describe('rowSelector', () => {
  it('matches the attribute TrackListItem writes', () => {
    expect(rowSelector(0)).toBe('[data-row-index="0"]');
    expect(rowSelector(137)).toBe('[data-row-index="137"]');
  });
});

describe('trackKey', () => {
  it('separates tracks that share an id across sources', () => {
    expect(trackKey({ id: '123', source: 'netease' })).toBe('netease:123');
    expect(trackKey({ id: '123', source: 'qq' })).not.toBe(trackKey({ id: '123', source: 'netease' }));
  });

  it('matches the key the local source is stored under', () => {
    // `songToTrack` maps a local `Song` onto the mock source.
    expect(trackKey({ id: 's1', source: 'mock' })).toBe('mock:s1');
  });
});
