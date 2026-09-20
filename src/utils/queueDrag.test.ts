import { describe, expect, it } from 'vitest';
import { dragShift, dropTarget, gapAt } from './queueDrag';

const ROW = 56;
const list = (count: number) => ({ top: 100, rowHeight: ROW, count });

describe('gapAt', () => {
  it('puts the gap at the top of the list above the first row', () => {
    expect(gapAt(100, list(5))).toBe(0);
    expect(gapAt(110, list(5))).toBe(0);
  });

  it('flips at the middle of a row, not at its edge', () => {
    // Row 0 spans 100..156; the switch to gap 1 is at 128.
    expect(gapAt(127, list(5))).toBe(0);
    expect(gapAt(129, list(5))).toBe(1);
  });

  it('walks one gap per row', () => {
    for (let row = 0; row < 5; row += 1) {
      expect(gapAt(100 + row * ROW + ROW / 2 + 1, list(5))).toBe(row + 1);
    }
  });

  it('stops at the last gap, below the final row', () => {
    expect(gapAt(100 + 5 * ROW, list(5))).toBe(5);
    expect(gapAt(100 + 500, list(5))).toBe(5);
  });

  it('clamps above the list rather than going negative', () => {
    expect(gapAt(0, list(5))).toBe(0);
    expect(gapAt(-400, list(5))).toBe(0);
  });

  it('returns 0 for an empty list or a zero row height', () => {
    expect(gapAt(200, list(0))).toBe(0);
    expect(gapAt(200, { top: 100, rowHeight: 0, count: 5 })).toBe(0);
  });
});

describe('dropTarget', () => {
  it('does not move when released over its own position', () => {
    expect(dropTarget(2, 2, 6)).toBe(2);
    // Just below itself is still itself: the item is already lifted out.
    expect(dropTarget(2, 3, 6)).toBe(2);
  });

  it('adjusts for the gap the item left behind when dragging down', () => {
    // Gap 4 is between items 3 and 4; with item 2 lifted out, that slot is 3.
    expect(dropTarget(2, 4, 6)).toBe(3);
  });

  it('needs no adjustment when dragging up', () => {
    expect(dropTarget(4, 1, 6)).toBe(1);
    expect(dropTarget(4, 0, 6)).toBe(0);
  });

  it('reaches the end of the list', () => {
    expect(dropTarget(0, 6, 6)).toBe(5);
  });

  it('reaches the start of the list', () => {
    expect(dropTarget(5, 0, 6)).toBe(0);
  });

  it('never returns an index outside the list', () => {
    for (let from = 0; from < 6; from += 1) {
      for (let gap = -2; gap <= 8; gap += 1) {
        const to = dropTarget(from, gap, 6);
        expect(to).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThan(6);
      }
    }
  });

  it('handles an empty list', () => {
    expect(dropTarget(0, 0, 0)).toBe(0);
  });
});

describe('dragShift', () => {
  it('leaves everything alone when the drop is a no-op', () => {
    expect(dragShift(2, 2, 4, 0)).toEqual([0, 0, 0, 0]);
  });

  it('shifts the rows in between up when dragging down', () => {
    // Dragging item 2 into the gap between 3 and 4: item 3 moves up.
    expect(dragShift(2, 4, 6, 1)).toEqual([0, 0, 1, -1, 0, 0]);
  });

  it('shifts the rows in between down when dragging up', () => {
    // Dragging item 2 up to the gap between 0 and 1: item 1 moves down.
    expect(dragShift(2, 1, 6, -1)).toEqual([0, 1, -1, 0, 0, 0]);
  });

  it('closes the whole list when dragging the first item to the end', () => {
    expect(dragShift(0, 6, 6, 5)).toEqual([5, -1, -1, -1, -1, -1]);
  });

  it('opens the whole list when dragging the last item to the front', () => {
    expect(dragShift(5, 0, 6, -5)).toEqual([1, 1, 1, 1, 1, -5]);
  });

  it('always shifts exactly as many rows as the drop moves', () => {
    for (let from = 0; from < 6; from += 1) {
      for (let gap = 0; gap <= 6; gap += 1) {
        const shift = dragShift(from, gap, 6, 0);
        const moved = Math.abs(dropTarget(from, gap, 6) - from);
        const shifting = shift.filter((value, i) => i !== from && value !== 0).length;
        expect(shifting).toBe(moved);
      }
    }
  });

  it('never shifts a row by more than one slot', () => {
    for (let from = 0; from < 6; from += 1) {
      for (let gap = 0; gap <= 6; gap += 1) {
        dragShift(from, gap, 6, 0).forEach((value, i) => {
          if (i !== from) expect(Math.abs(value)).toBeLessThanOrEqual(1);
        });
      }
    }
  });

  it('handles an empty list', () => {
    expect(dragShift(0, 0, 0, 0)).toEqual([]);
  });
});
