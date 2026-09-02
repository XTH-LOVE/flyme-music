import type { MusicTrack } from '@/music/source/types';

/**
 * Pure queue logic: ordering, shuffle bookkeeping and index math.
 * No audio concerns here - the engine owns playback.
 */
export class PlayerQueue {
  private items: MusicTrack[] = [];
  private index = -1;
  private shuffled = false;

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
    } else {
      nextIndex = (this.index + 1) % this.items.length;
    }
    return this.jumpTo(nextIndex);
  }

  previous(): MusicTrack | null {
    if (!this.items.length) return null;
    const prevIndex = this.shuffled
      ? Math.floor(Math.random() * this.items.length)
      : (this.index - 1 + this.items.length) % this.items.length;
    return this.jumpTo(prevIndex);
  }

  setShuffled(value: boolean): void {
    this.shuffled = value;
  }

  removeAt(i: number): void {
    if (i < 0 || i >= this.items.length) return;
    this.items.splice(i, 1);
    if (i < this.index) this.index -= 1;
    else if (i === this.index && this.index >= this.items.length) {
      this.index = this.items.length - 1;
    }
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
  }

  clear(): void {
    this.items = [];
    this.index = -1;
  }
}
