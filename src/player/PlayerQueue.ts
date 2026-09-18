import type { MusicTrack } from '@/music/source/types';

/**
 * Pure queue logic: ordering, shuffle bookkeeping and index math.
 * No audio concerns here - the engine owns playback.
 */
export class PlayerQueue {
  private items: MusicTrack[] = [];
  private index = -1;
  private shuffled = false;
  /**
   * Visited indices in shuffle mode, so previous() can actually walk back
   * instead of landing on a random song. Capped to bound long sessions.
   */
  private shuffleHistory: number[] = [];
  private static readonly SHUFFLE_HISTORY_CAP = 100;

  get list(): MusicTrack[] {
    // Snapshots must not retain a mutable reference to the internal queue.
    return [...this.items];
  }

  get currentIndex(): number {
    return this.index;
  }

  get current(): MusicTrack | null {
    return this.index >= 0 && this.index < this.items.length
      ? this.items[this.index]
      : null;
  }

  get isShuffled(): boolean {
    return this.shuffled;
  }

  load(tracks: MusicTrack[], startIndex = 0): void {
    this.items = [...tracks];
    this.index = tracks.length ? Math.min(startIndex, tracks.length - 1) : -1;
    this.shuffleHistory = [];
  }

  /**
   * Swap the current entry for another track, keeping the rest of the queue.
   * Used by the automatic source fallback: the song stays where it was in the
   * queue, only the provider backing it changes.
   */
  replaceCurrent(track: MusicTrack): void {
    if (this.index < 0 || this.index >= this.items.length) return;
    this.items[this.index] = track;
  }

  /** Append tracks to the end of the queue (AI "queue similar" feature). */
  append(tracks: MusicTrack[]): void {
    this.items.push(...tracks);
  }

  /** Insert tracks right after the current song - "play next". */
  insertNext(tracks: MusicTrack[]): void {
    if (!tracks.length) return;
    if (this.index < 0) {
      // Empty queue: the first inserted track becomes the current one.
      this.items.push(...tracks);
      this.index = 0;
      return;
    }
    this.items.splice(this.index + 1, 0, ...tracks);
  }

  jumpTo(i: number): MusicTrack | null {
    if (i < 0 || i >= this.items.length) return null;
    // Record where we came from so shuffle-mode previous() can return here.
    if (this.shuffled && this.index >= 0 && i !== this.index) {
      this.pushHistory(this.index);
    }
    this.index = i;
    return this.items[i];
  }

  next(): MusicTrack | null {
    if (!this.items.length) return null;
    let nextIndex: number;
    if (this.shuffled) {
      const candidates = this.items
        .map((_, i) => i)
        .filter((i) => i !== this.index);
      nextIndex = candidates.length
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : this.index;
      if (nextIndex !== this.index) this.pushHistory(this.index);
    } else {
      nextIndex = (this.index + 1) % this.items.length;
    }
    return this.jumpToWithoutHistory(nextIndex);
  }

  previous(): MusicTrack | null {
    if (!this.items.length) return null;
    if (this.shuffled) {
      const prev = this.shuffleHistory.pop();
      if (prev !== undefined && prev < this.items.length) {
        return this.jumpToWithoutHistory(prev);
      }
      // History exhausted: land on a different song rather than replaying one.
      const candidates = this.items
        .map((_, i) => i)
        .filter((i) => i !== this.index);
      if (!candidates.length) return this.current;
      const fallback = candidates[Math.floor(Math.random() * candidates.length)];
      return this.jumpToWithoutHistory(fallback);
    }
    const prevIndex = (this.index - 1 + this.items.length) % this.items.length;
    return this.jumpToWithoutHistory(prevIndex);
  }

  setShuffled(value: boolean): void {
    if (value !== this.shuffled) this.shuffleHistory = [];
    this.shuffled = value;
  }

  removeAt(i: number): void {
    if (i < 0 || i >= this.items.length) return;
    this.items.splice(i, 1);
    if (i < this.index) this.index -= 1;
    else if (i === this.index && this.index >= this.items.length) {
      this.index = this.items.length - 1;
    }
    // History entries past the removed slot shift up; the removed song drops out.
    this.shuffleHistory = this.shuffleHistory
      .filter((h) => h !== i)
      .map((h) => (h > i ? h - 1 : h));
  }

  /** Reorder without losing the currently playing track. */
  move(from: number, to: number): void {
    if (
      from === to ||
      from < 0 ||
      from >= this.items.length ||
      to < 0 ||
      to >= this.items.length
    ) {
      return;
    }
    const [item] = this.items.splice(from, 1);
    this.items.splice(to, 0, item);
    if (from === this.index) this.index = to;
    else if (from < this.index && to >= this.index) this.index -= 1;
    else if (from > this.index && to <= this.index) this.index += 1;
    // Apply the same index remap to the shuffle history.
    this.shuffleHistory = this.shuffleHistory.map((h) => {
      if (h === from) return to;
      if (from < h && to >= h) return h - 1;
      if (from > h && to <= h) return h + 1;
      return h;
    });
  }

  clear(): void {
    this.items = [];
    this.index = -1;
    this.shuffleHistory = [];
  }

  /**
   * Drop everything queued after the current song, leaving the playing track
   * alone. The queue sheet's clear button sits under "接下来播放", so wiping the
   * song that is actually playing was a surprise.
   */
  clearUpNext(): void {
    if (this.index < 0) return;
    this.items = this.items.slice(0, this.index + 1);
    this.shuffleHistory = this.shuffleHistory.filter((h) => h <= this.index);
  }

  private pushHistory(i: number): void {
    this.shuffleHistory.push(i);
    if (this.shuffleHistory.length > PlayerQueue.SHUFFLE_HISTORY_CAP) {
      this.shuffleHistory.splice(0, this.shuffleHistory.length - PlayerQueue.SHUFFLE_HISTORY_CAP);
    }
  }

  /** Index assignment without recording a history entry (used by next/previous). */
  private jumpToWithoutHistory(i: number): MusicTrack | null {
    if (i < 0 || i >= this.items.length) return null;
    this.index = i;
    return this.items[i];
  }
}
