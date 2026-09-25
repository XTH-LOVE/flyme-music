import type { MusicSource, MusicTrack } from '@/music/source/types';
import { songToTrack, sourceLabels } from '@/music/source/types';
import type { Song } from '@/music/types';
import { resolveTrackUrl } from '@/music/source/track-resolver';
import { bitrateForQuality } from '@/music/source/quality';
import { useSettingsStore } from '@/store/useSettingsStore';
import { notify } from '@/utils/notify';
import { setPlaybackFailure, clearPlaybackFailure } from './playbackFailure';
import { isTauri } from '@/lib/apiTransport';
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
  /**
   * How far to drop while something else is announcing.
   *
   * Low enough to be clearly underneath a navigation prompt, high enough that
   * the track is still recognisable when it comes back - muting entirely reads
   * as a glitch rather than as ducking.
   */
  private static readonly DUCK_FACTOR = 0.3;
  /*
   * A-B repeat.
   *
   * Two marks rather than a start and a duration, because that is how the
   * gesture works: you hear the start of the part you want, you press, you hear
   * the end, you press again. Asking for a length first would make the user
   * convert something they can hear into a number they cannot.
   *
   * Both null means off. A set and B unset means "waiting for the end mark",
   * which the UI shows so the state is never ambiguous.
   */
  private loopA: number | null = null;
  private loopB: number | null = null;

  /** True once the user manually seeks the current song. */
  private userSeeked = false;
  /** Invalidates URL resolution started for a previous queue selection. */
  private playbackRequestId = 0;
  /**
   * Sources already tried for the track currently being started. Guards the
   * automatic fallback against bouncing between two providers that both fail.
   */
  private triedSources = new Set<MusicSource>();
  /** Upper bound on automatic provider hops per track. */
  private static readonly MAX_FALLBACK_SOURCES = 3;
  /**
   * Track that must play next regardless of shuffle. Without this, "play next"
   * is a lie in shuffle mode, where next() otherwise picks at random - and the
   * song the user explicitly queued first would be skipped like any other.
   * Stored as a key rather than an index so queue edits cannot make it point at
   * the wrong song.
   */
  private forcedNextKey: string | null = null;

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
    // A fresh queue supersedes any pending "play next" request.
    this.forcedNextKey = null;
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

  /**
   * Explicit play, as opposed to [toggle].
   *
   * The notification sends `play` and `pause` as separate events, so handling
   * both with `toggle` would make the button do the opposite of what it says
   * the moment the two sides disagree about the current state - which is the
   * exact failure that made the previous single toggle button unusable.
   */
  resume(): void {
    if (!this.queue.current) return;
    if (this.snapshot().status === 'playing') return;
    this.engine.play();
    // A simulated clock with no stream attached (fresh session restore, or a
    // previous stream failure) only ticks silently forever - go resolve the
    // real stream URL instead of leaving a fake playback.
    if (this.engine.isSimulated) void this.resolveAndAttach();
    this.broadcast();
  }

  pause(): void {
    this.engine.pause();
    this.broadcast();
  }

  /** Temporary attenuation for a short announcement; see the audio focus path. */
  setDucked(ducked: boolean): void {
    this.engine.setVolume(ducked ? this.volume * PlayerController.DUCK_FACTOR : this.volume);
  }

  next(): void {
    // An explicit "play next" wins over shuffle's random pick.
    const forced = this.takeForcedNext();
    const track = forced !== null ? this.queue.jumpTo(forced) : this.queue.next();
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

  /**
   * Advances the A-B marks: none -> A -> A and B -> none.
   *
   * Cycling back to none on the third press means the control never needs a
   * separate way to cancel, which on a phone is worth more than the extra
   * state.
   */
  markLoopPoint(): void {
    const now = this.engine.currentTime;
    if (this.loopA === null) {
      this.loopA = now;
    } else if (this.loopB === null && now > this.loopA + 0.5) {
      this.loopB = now;
    } else {
      this.loopA = null;
      this.loopB = null;
    }
    this.broadcast();
  }

  clearLoop(): void {
    this.loopA = null;
    this.loopB = null;
    this.broadcast();
  }

  /** Wraps back to A once B is reached. Cheap enough to run on every tick. */
  private applyLoop(): void {
    if (this.loopA === null || this.loopB === null) return;
    if (this.engine.currentTime >= this.loopB) this.engine.seek(this.loopA);
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
    // Picking a song by hand supersedes a pending "play next".
    this.forcedNextKey = null;
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
    // Remember the first inserted track so next() honours it even in shuffle.
    const first = this.queue.list[this.queue.currentIndex + 1];
    this.forcedNextKey = first ? first.source + ':' + first.id : null;
    this.persistQueue();
    this.broadcast();
  }

  /** Resolve and consume the pending "play next" request, if still present. */
  private takeForcedNext(): number | null {
    if (!this.forcedNextKey) return null;
    const key = this.forcedNextKey;
    this.forcedNextKey = null;
    // Searched from the current position forward, not from the top. A queue can
    // hold the same track twice, and a plain findIndex returns the first match -
    // which, when that copy sits earlier in the queue, sends "next" backwards.
    const from = this.queue.currentIndex + 1;
    const index = this.queue.list.findIndex(
      (t, i) => i >= from && t.source + ':' + t.id === key,
    );
    return index >= 0 ? index : null;
  }

  clearQueue(): void {
    this.playbackRequestId += 1;
    this.forcedNextKey = null;
    this.queue.clear();
    this.engine.load(0);
    this.persistQueue();
    this.broadcast();
  }

  /** Drop the pending songs only - the current track keeps playing. */
  clearUpNext(): void {
    this.queue.clearUpNext();
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
      loopA: this.loopA,
      loopB: this.loopB,
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

  /**
   * With 节奏频谱 enabled, remote streams are re-routed through our own
   * same-origin proxy: the audio element then loads a same-origin resource,
   * which unlocks the Web Audio analyser (cross-origin media would be
   * tainted and silence the graph). Still progressive streaming - playback
   * starts as bytes arrive. Cached/local/blob sources pass through as-is.
   */
  private attachUrlFor(url: string): string {
    if (isTauri()) return url;
    /*
     * Only the visualiser justifies the proxy now.
     *
     * The EQ and level matching were added to this condition so they would work
     * for online tracks, and that was a mistake: routing every stream through
     * Cloudflare puts a Worker in the path of the audio, and playback came back
     * audibly choppy. A filter is worth less than the music it filters.
     *
     * So the trade-off resolves the other way. The spectrum still asks for the
     * proxy because it cannot work without it; the EQ and level matching apply
     * to local and cached audio, which is same-origin already and costs
     * nothing, and stay out of the way for everything else.
     */
    if (!useSettingsStore.getState().realSpectrum) return url;
    if (!/^https?:\/\//.test(url)) return url;
    return '/api/media-proxy?url=' + encodeURIComponent(url);
  }

  /* ---- internals ---- */

  private async startCurrent(isFallback = false): Promise<void> {
    const track = this.queue.current;
    if (!track) return;
    // A user-driven start clears the fallback history; re-entry from the
    // fallback itself must keep it, or we would loop forever.
    if (!isFallback) this.triedSources.clear();
    const requestId = ++this.playbackRequestId;
    const trackKey = track.source + ':' + track.id + ':' + track.url_id;
    this.userSeeked = false;
    // Optimistic start: simulated clock gives instant progress/lyrics,
    // the real stream joins as soon as its URL resolves.
    this.engine.load(track.duration || 200);
    this.engine.setVolume(this.volume);
    this.engine.play();
    this.broadcast();

    const br = bitrateForQuality(useSettingsStore.getState().quality);
    const url = await resolveTrackUrl(track, br);
    // Compare by source:id - bare ids collide across netease/qq/joox.
    const cur = this.queue.current;
    const stillCurrent =
      requestId === this.playbackRequestId &&
      cur !== null &&
      cur.source + ':' + cur.id + ':' + cur.url_id === trackKey;
    if (url && stillCurrent) {
      clearPlaybackFailure(track.source, track.id);
      // Unless the user already dragged the progress bar, always start
      // the real stream from 0 - otherwise listeners miss the intro while
      // the URL was resolving.
      this.engine.attachSource(this.attachUrlFor(url), this.userSeeked ? undefined : 0);
      this.broadcast();
    } else if (!url && stillCurrent && track.source !== 'mock') {
      setPlaybackFailure(track.source, track.id, 'unavailable');
      // joox endpoint did exactly that, failing every song for minutes on end.
      // Stop the optimistic clock, then look for the same song elsewhere
      // instead of just giving up on the track.
      this.engine.pause();
      this.broadcast();
      const switched = await this.switchToAlternateSource(track, requestId);
      if (!switched) {
        notify('《' + track.name + '》暂时无法播放（可能受版权限制），可在歌曲菜单里换源重试');
      }
    }
  }

  /**
   * Find the same song on another provider and restart playback there.
   * Returns false when there is nothing left worth trying.
   */
  private async switchToAlternateSource(track: MusicTrack, requestId: number): Promise<boolean> {
    if (this.triedSources.size >= PlayerController.MAX_FALLBACK_SOURCES) return false;
    this.triedSources.add(track.source);

    // The search can take a second or two (Hi歌 is a scrape), during which the
    // player is silent. Say so, otherwise it reads as a hang.
    notify('原音源暂时不可用，正在换源…');

    // Imported lazily on purpose: alternateSource imports the player singleton,
    // so a static import here would close a module cycle.
    const { findAlternateSource } = await import('@/player/alternateSource');
    const alt = await findAlternateSource(track, this.triedSources);
    if (!alt) return false;
    // The user picked something else while we were searching - leave it alone.
    if (this.playbackRequestId !== requestId) return true;

    // Swap the entry in place so the queue (and the source badge) stay truthful.
    this.queue.replaceCurrent(alt);
    this.persistQueue();
    notify('已切到「' + sourceLabels[alt.source] + '」播放');
    this.broadcast();
    await this.startCurrent(true);
    return true;
  }

  /** Re-resolve the stream for the current track, keeping the position. */
  private async resolveAndAttach(): Promise<void> {
    const track = this.queue.current;
    if (!track || track.source === 'mock') return;
    const requestId = ++this.playbackRequestId;
    const trackKey = track.source + ':' + track.id + ':' + track.url_id;
    const br = bitrateForQuality(useSettingsStore.getState().quality);
    const url = await resolveTrackUrl(track, br);
    const cur = this.queue.current;
    const stillCurrent =
      requestId === this.playbackRequestId &&
      cur !== null &&
      cur.source + ':' + cur.id + ':' + cur.url_id === trackKey;
    if (url && stillCurrent) {
      clearPlaybackFailure(track.source, track.id);
      this.engine.attachSource(this.attachUrlFor(url));
      this.broadcast();
    } else if (!url && stillCurrent) {
      setPlaybackFailure(track.source, track.id, 'unavailable');
      // No stream available: stop the silent simulated clock, then try the same
      // song on another provider rather than leaving the user stuck.
      this.engine.pause();
      this.broadcast();
      const switched = await this.switchToAlternateSource(track, requestId);
      if (!switched) {
        notify('《' + track.name + '》暂时无法播放，可在歌曲菜单里换源重试');
      }
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
    this.applyLoop();
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
    } catch (error) {
      // Not silent. Losing the queue on every launch in private mode, or after
      // the storage quota fills, is the kind of failure that looks like a
      // different bug each time it is reported.
      console.warn('[player] 队列持久化失败', error);
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
      // Clamp both ends. A negative index (corrupt or hand-edited storage) would
      // otherwise leave a non-empty queue with no current track: the UI would
      // show songs, but pressing play could not resolve anything.
      const index = Math.max(0, Math.min(saved.index ?? 0, saved.queue.length - 1));
      this.queue.load(saved.queue, index);
      if (saved.shuffle) this.queue.setShuffled(true);
      if (saved.repeat) this.repeat = saved.repeat;
      if (typeof saved.volume === 'number') {
        this.volume = Math.max(0, Math.min(1, saved.volume));
      }
      // Restored session starts paused; the engine idles in simulated mode.
      this.engine.load(this.queue.current?.duration || 200);
      this.engine.setVolume(this.volume);
    } catch (error) {
      // Not silent. Losing the queue on every launch in private mode, or after
      // the storage quota fills, is the kind of failure that looks like a
      // different bug each time it is reported.
      console.warn('[player] 队列持久化失败', error);
    }
  }
}

export const playerController = new PlayerController();
