import type { MusicTrack } from '@/music/source/types';
import { songToTrack } from '@/music/source/types';
import type { Song } from '@/music/types';
import { resolveTrackUrl } from '@/music/source/track-resolver';
import { useSettingsStore } from '@/store/useSettingsStore';
import { PlayerEngine } from './PlayerEngine';
import { PlayerQueue } from './PlayerQueue';
import type { PlayerListener, PlayerSnapshot, RepeatMode } from './PlayerState';

/**
 * High-level player API used by the whole app.
 * Owns the engine + queue and broadcasts snapshots; UI stores simply mirror them.
 * Stream URLs are resolved lazily per source (Otter-style getUrl).
 */
/** Persisted playback session (queue + preferences). */
const QUEUE_KEY = 'aurora.queue.v1';

class PlayerController {
  private engine = new PlayerEngine();
  private queue = new PlayerQueue();
  private listeners = new Set<PlayerListener>();
  private repeat: RepeatMode = 'off';
  private volume = 0.8;
  /** True once the user manually seeks the current song. */
  private userSeeked = false;
  /** Invalidates URL resolution started for a previous queue selection. */
  private playbackRequestId = 0;

  constructor() {
    this.restorePersisted();
    this.engine.on((event) => {
      if (event === 'ended') this.handleEnded();
      this.broadcast();
    });
  }

  /* ---- commands ---- */

  playTracks(tracks: MusicTrack[], startIndex = 0): void {
    if (!tracks.length) return;
    this.queue.load(tracks, startIndex);
    this.persistQueue();
    void this.startCurrent();
  }

  playTrack(track: MusicTrack, context?: MusicTrack[]): void {
    if (context && context.length) {
      const idx = context.findIndex((t) => t.id === track.id && t.source === track.source);
      this.playTracks(context, idx >= 0 ? idx : 0);
    } else {
      this.playTracks([track], 0);
    }
  }

  /* Legacy Song-based facade for the local library UI. */
  playQueue(songs: Song[], startIndex = 0): void {
    this.playTracks(songs.map(songToTrack), startIndex);
  }

  playSong(song: Song, context?: Song[]): void {
    this.playTrack(songToTrack(song), context ? context.map(songToTrack) : undefined);
  }

  toggle(): void {
    if (!this.queue.current) return;
    if (this.snapshot().status === 'playing') {
      this.engine.pause();
    } else {
      this.engine.play();
      // A simulated clock with no stream attached (fresh session restore,
      // or a previous stream failure) only ticks silently forever - go
      // resolve the real stream URL instead of leaving a fake playback.
      if (this.engine.isSimulated) void this.resolveAndAttach();
    }
    this.broadcast();
  }

  pause(): void {
    this.engine.pause();
    this.broadcast();
  }

  next(): void {
    const track = this.queue.next();
    this.persistQueue();
    if (track) void this.startCurrent();
  }

  previous(): void {
    // Restart-first behaviour like mainstream players.
    if (this.engine.currentTime > 4) {
      this.engine.seek(0);
      this.broadcast();
      return;
    }
    const track = this.queue.previous();
    this.persistQueue();
    if (track) void this.startCurrent();
  }

  seek(time: number): void {
    this.userSeeked = true;
    this.engine.seek(time);
    this.broadcast();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.engine.setVolume(this.volume);
    this.persistQueue();
    this.broadcast();
  }

  setSpeed(rate: number): void {
    this.engine.setRate(rate);
    this.broadcast();
  }

  get speed(): number {
    return this.engine.playbackRate;
  }

  toggleShuffle(): void {
    this.queue.setShuffled(!this.queue.isShuffled);
    this.persistQueue();
    this.broadcast();
  }

  /** Cycle the single transport playback-mode control. */
  cyclePlaybackMode(): void {
    if (!this.queue.isShuffled && this.repeat === 'off') {
      this.queue.setShuffled(true);
    } else if (this.queue.isShuffled) {
      this.queue.setShuffled(false);
      this.repeat = 'all';
    } else if (this.repeat === 'all') {
      this.repeat = 'one';
    } else {
      this.repeat = 'off';
    }
    this.persistQueue();
    this.broadcast();
  }

  cycleRepeat(): void {
    this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
    this.persistQueue();
    this.broadcast();
  }

  jumpToQueueIndex(i: number): void {
    const track = this.queue.jumpTo(i);
    this.persistQueue();
    if (track) void this.startCurrent();
  }

  removeFromQueue(i: number): void {
    const before = this.queue.current;
    const beforeKey = before ? before.source + ':' + before.id + ':' + before.url_id : null;
    this.queue.removeAt(i);
    this.persistQueue();
    const after = this.queue.current;
    const afterKey = after ? after.source + ':' + after.id + ':' + after.url_id : null;
    if (beforeKey !== afterKey) {
      if (after) void this.startCurrent();
      else this.engine.load(0);
    } else {
      this.broadcast();
    }
  }

  moveQueueItem(from: number, to: number): void {
    this.queue.move(from, to);
    this.persistQueue();
    this.broadcast();
  }

  /** Append tracks after the current queue (AI companion feature). */
  addToQueue(tracks: MusicTrack[]): void {
    if (!tracks.length) return;
    if (!this.queue.current) {
      this.playTracks(tracks, 0);
      return;
    }
    this.queue.append(tracks);
    this.persistQueue();
    this.broadcast();
  }

  /** "Play next": insert tracks right after the current song. */
  playNext(tracks: MusicTrack[]): void {
    if (!tracks.length) return;
    if (!this.queue.current) {
      this.playTracks(tracks, 0);
      return;
    }
    this.queue.insertNext(tracks);
    this.persistQueue();
    this.broadcast();
  }

  clearQueue(): void {
    this.playbackRequestId += 1;
    this.queue.clear();
    this.engine.load(0);
    this.persistQueue();
    this.broadcast();
  }

  /* ---- state ---- */

  snapshot(): PlayerSnapshot {
    const status = !this.queue.current
      ? 'idle'
      : this.engine.isPlaying
        ? 'playing'
        : 'paused';
    return {
      current: this.queue.current,
      status,
      currentTime: this.engine.currentTime,
      duration: this.engine.duration,
      volume: this.volume,
      speed: this.engine.playbackRate,
      queue: this.queue.list,
      queueIndex: this.queue.currentIndex,
      shuffle: this.queue.isShuffled,
      repeat: this.repeat,
      simulated: this.engine.isSimulated,
    };
  }

  subscribe(listener: PlayerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /* ---- internals ---- */

  private async startCurrent(): Promise<void> {
    const track = this.queue.current;
    if (!track) return;
    const requestId = ++this.playbackRequestId;
    const trackKey = track.source + ':' + track.id + ':' + track.url_id;
    this.userSeeked = false;
    // Optimistic start: simulated clock gives instant progress/lyrics,
    // the real stream joins as soon as its URL resolves.
    this.engine.load(track.duration || 200);
    this.engine.setVolume(this.volume);
    this.engine.play();
    this.broadcast();

    const quality = useSettingsStore.getState().quality;
    const br = quality === 'lossless' ? 999 : quality === 'high' ? 320 : 192;
    const url = await resolveTrackUrl(track, br);
    // Compare by source:id - bare ids collide across netease/qq/joox.
    const cur = this.queue.current;
    const stillCurrent =
      requestId === this.playbackRequestId &&
      cur !== null &&
      cur.source + ':' + cur.id + ':' + cur.url_id === trackKey;
    if (url && stillCurrent) {
      // Unless the user already dragged the progress bar, always start
      // the real stream from 0 - otherwise listeners miss the intro while
      // the URL was resolving.
      this.engine.attachSource(url, this.userSeeked ? undefined : 0);
      this.broadcast();
    } else if (!url && stillCurrent && track.source !== 'mock') {
      // Remote providers can be temporarily unavailable. Do not leave a
      // silent simulated playback running after all retries are exhausted.
      this.engine.pause();
      this.broadcast();
    }
  }

  /** Re-resolve the stream for the current track, keeping the position. */
  private async resolveAndAttach(): Promise<void> {
    const track = this.queue.current;
    if (!track || track.source === 'mock') return;
    const requestId = ++this.playbackRequestId;
    const trackKey = track.source + ':' + track.id + ':' + track.url_id;
    const quality = useSettingsStore.getState().quality;
    const br = quality === 'lossless' ? 999 : quality === 'high' ? 320 : 192;
    const url = await resolveTrackUrl(track, br);
    const cur = this.queue.current;
    const stillCurrent =
      requestId === this.playbackRequestId &&
      cur !== null &&
      cur.source + ':' + cur.id + ':' + cur.url_id === trackKey;
    if (url && stillCurrent) {
      this.engine.attachSource(url);
      this.broadcast();
    } else if (!url && stillCurrent) {
      // No stream available: stop the silent simulated clock honestly.
      this.engine.pause();
      this.broadcast();
    }
  }

  private handleEnded(): void {
    if (this.repeat === 'one') {
      this.engine.seek(0);
      this.engine.play();
      return;
    }
    const isLast =
      this.queue.currentIndex === this.queue.list.length - 1 && !this.queue.isShuffled;
    if (isLast && this.repeat === 'off') {
      return;
    }
    if (!useSettingsStore.getState().autoplayNext) {
      this.engine.pause();
      this.broadcast();
      return;
    }
    this.next();
  }

  private broadcast(): void {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }

  /* ---- persistence: the queue survives reloads ---- */

  private persistQueue(): void {
    try {
      localStorage.setItem(
        QUEUE_KEY,
        JSON.stringify({
          queue: this.queue.list,
          index: this.queue.currentIndex,
          shuffle: this.queue.isShuffled,
          repeat: this.repeat,
          volume: this.volume,
        }),
      );
    } catch {
      /* ignore */
    }
  }

  private restorePersisted(): void {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        queue?: MusicTrack[];
        index?: number;
        shuffle?: boolean;
        repeat?: RepeatMode;
        volume?: number;
      };
      if (!Array.isArray(saved.queue) || !saved.queue.length) return;
      this.queue.load(saved.queue, Math.min(saved.index ?? 0, saved.queue.length - 1));
      if (saved.shuffle) this.queue.setShuffled(true);
      if (saved.repeat) this.repeat = saved.repeat;
      if (typeof saved.volume === 'number') {
        this.volume = Math.max(0, Math.min(1, saved.volume));
      }
      // Restored session starts paused; the engine idles in simulated mode.
      this.engine.load(this.queue.current?.duration || 200);
      this.engine.setVolume(this.volume);
    } catch {
      /* ignore */
    }
  }
}

export const playerController = new PlayerController();
