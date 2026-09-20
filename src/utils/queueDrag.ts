/**
 * Geometry for dragging rows in the play queue.
 *
 * The list is treated as a set of *gaps* rather than rows. Dropping "on" a row
 * is ambiguous - it means something different depending on whether you came
 * from above or below, and it means nothing at all when the row is the one
 * being dragged - which is why every reorderable list in the wild draws its
 * insertion point between items. Keeping the arithmetic here means the awkward
 * half of it can be tested without a DOM.
 */

export interface SlotGeometry {
  /** Top of the list, in the same coordinate space as the pointer. */
  top: number;
  /** Height of one row. */
  rowHeight: number;
  /** Number of rows. */
  count: number;
}

/**
 * The gap nearest `pointerY`, as an index in `0..count`.
 *
 * Rounding rather than flooring puts the switch-over at the middle of a row, so
 * the insertion point flips when the pointer crosses the halfway line instead
 * of when it leaves the row.
 */
export function gapAt(pointerY: number, geometry: SlotGeometry): number {
  const { top, rowHeight, count } = geometry;
  if (count <= 0) return 0;
  if (!(rowHeight > 0)) return 0;
  const raw = Math.round((pointerY - top) / rowHeight);
  return Math.min(count, Math.max(0, raw));
}

/**
 * Where a drag actually lands, given the gap it was released over.
 *
 * A gap sits *between* items, so a gap below the dragged item names the slot
 * one further along once that item has been lifted out of the list. Without
 * this adjustment every downward drag overshoots by one.
 */
export function dropTarget(from: number, gap: number, count: number): number {
  if (count <= 0) return 0;
  const clamped = Math.min(count, Math.max(0, gap));
  const to = clamped > from ? clamped - 1 : clamped;
  return Math.min(count - 1, Math.max(0, to));
}

/**
 * Where each row renders while a drag is in flight, in row units relative to
 * its own slot.
 *
 * The rows between the dragged item and the insertion point each shift by one
 * to close the gap it left. That is what makes the list look like it is making
 * room, rather than just highlighting a line and hoping the user trusts it.
 *
 * `dragged` is the pointer offset for the dragged row itself, in row units.
 */
export function dragShift(
  from: number,
  gap: number,
  count: number,
  dragged: number,
): number[] {
  const target = dropTarget(from, gap, count);
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    if (i === from) return dragged;
    if (from < i && i <= target) return -1;
    if (target <= i && i < from) return 1;
    return 0;
  });
}
