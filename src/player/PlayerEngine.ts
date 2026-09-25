import { ensureWired } from './webAudio';

export type EngineEvent = 'tick' | 'ended';
type EngineListener = (event: EngineEvent) => void;

/**
 * Low-level playback engine.
 * Starts every song in simulated mode so progress/lyrics work instantly;
 * once the controller resolves a real stream URL it attaches the <audio>
 * element mid-flight. Stream failures fall back to the simulated clock.
 */
export class PlayerEngine {
  private audio: HTMLAudioElement | null = null;
  private simulated = true;
  private simulatedTime = 0;
  private simulatedDuration = 0;
  private timer: number | null = null;
  private listeners = new Set<EngineListener>();
  private rate = 1;
  /** Volume to apply once (or next time) the element exists. */
  private pendingVolume = 1;
  /** True while the user's intent is "playing" (guards pause during awaits). */
  private wanted = false;
  /** Wall-clock anchor for drift-free simulated ticks. */
  private lastTick = 0;

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.addEventListener('timeupdate', () => {
        if (!this.simulated) this.emit('tick');
      });
      this.audio.addEventListener('ended', () => {
        if (!this.simulated) this.emit('ended');
      });
      this.audio.addEventListener('error', () => {
        if (this.simulated || !this.audio) return;
        // Stream died (expired key / network). Stop instead of advancing a
        // fake clock, so the UI never claims a remote song is playing silently.
        this.simulatedTime = this.audio.currentTime || this.simulatedTime;
        this.wanted = false;
        this.stopTimer();
        this.simulated = true;
        this.emit('tick');
        // And say so. Stopping silently is what makes a track that will not
        // play on one device indistinguishable from a track that paused.
        this.reportFailure('stream', this.audio.error);
      });
    }
    this.audio.volume = this.pendingVolume;
    return this.audio;
  }

  /**
   * Called when playback fails after a source was resolved.
   *
   * These two paths used to end in the same place as a user pressing pause -
   * silent, with no reason. That is why "it will not play on this phone" was
   * impossible to act on: the app knew something had failed and told nobody.
   */
  onFailure: ((kind: 'play' | 'stream', reason: unknown) => void) | null = null;

  private reportFailure(kind: 'play' | 'stream', reason: unknown): void {
    try {
      this.onFailure?.(kind, reason);
    } catch {
      /* reporting must never be the thing that breaks playback */
    }
  }

  /** Begin a song in simulated mode (instant UI feedback). */
  load(durationSeconds: number): void {
    this.stopTimer();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.simulated = true;
    this.simulatedTime = 0;
    this.simulatedDuration = durationSeconds > 0 ? durationSeconds : 200;
  }

  /**
   * Attach a resolved stream URL.
   * fromTime overrides the resume position (used to rewind to 0 when the
   * stream resolved quickly, so listeners never miss the intro).
   */
  attachSource(url: string, fromTime?: number): void {
    const el = this.ensureAudio();
    const resumeAt = fromTime ?? this.simulatedTime;
    this.stopTimer();
    el.src = url;
    el.playbackRate = this.rate;
    el.volume = this.pendingVolume;
    this.simulatedTime = resumeAt;
    if (resumeAt > 0) {
      // Browsers ignore currentTime before metadata is ready (fresh reloads);
      // defer the seek until the element can actually accept it.
      if (el.readyState >= 1) {
        try { el.currentTime = resumeAt; } catch { /* ignore */ }
      } else {
        el.addEventListener(
          'loadedmetadata',
          () => { try { el.currentTime = resumeAt; } catch { /* ignore */ } },
          { once: true },
        );
      }
    }
    this.simulated = false;
    // Optional Web Audio graph (analyser + EQ): only wires safe same-origin /
    // blob sources, cross-origin streams keep the plain element path.
    ensureWired(el);
    // Respect a pause that happened while the URL was resolving.
    if (this.wanted) {
      void el.play().catch((error: unknown) => {
        // Autoplay policy or a rejected media URL must not leave the player
        // looking active while the clock is stopped.
        this.simulatedTime = el.currentTime || resumeAt;
        this.wanted = false;
        this.stopTimer();
        this.simulated = true;
        this.emit('tick');
        this.reportFailure('play', error);
      });
    }
  }

  play(): void {
    this.wanted = true;
    if (this.simulated) {
      this.startTimer();
    } else if (this.audio) {
      void this.audio.play().catch(() => undefined);
    }
  }

  pause(): void {
    this.wanted = false;
    if (this.simulated) {
      this.stopTimer();
    } else if (this.audio) {
      this.audio.pause();
    }
  }

  seek(time: number): void {
    if (this.simulated) {
      this.simulatedTime = Math.max(0, Math.min(time, this.simulatedDuration));
      this.emit('tick');
    } else if (this.audio) {
      this.audio.currentTime = time;
    }
  }

  setVolume(v: number): void {
    this.pendingVolume = Math.max(0, Math.min(1, v));
    if (this.audio) this.audio.volume = this.pendingVolume;
  }

  /** Playback speed (0.5 - 3x). Applies to both real audio and the clock. */
  setRate(r: number): void {
    this.rate = Math.max(0.5, Math.min(3, r));
    if (this.audio) this.audio.playbackRate = this.rate;
  }

  get playbackRate(): number {
    return this.rate;
  }

  get currentTime(): number {
    if (this.simulated) return this.simulatedTime;
    return this.audio ? this.audio.currentTime : 0;
  }

  get duration(): number {
    if (!this.simulated && this.audio && Number.isFinite(this.audio.duration)) {
      return this.audio.duration;
    }
    return this.simulatedDuration;
  }

  get isPlaying(): boolean {
    return this.simulated
      ? this.timer !== null
      : Boolean(this.audio && !this.audio.paused);
  }

  /** True while progress is driven by the simulated clock (no sound yet). */
  get isSimulated(): boolean {
    return this.simulated;
  }

  on(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private startTimer(): void {
    this.stopTimer();
    this.lastTick = Date.now();
    this.timer = window.setInterval(() => {
      // Derive elapsed time from the wall clock so throttled background
      // tabs re-sync instead of silently drifting behind the lyrics.
      const now = Date.now();
      this.simulatedTime += ((now - this.lastTick) / 1000) * this.rate;
      this.lastTick = now;
      if (this.simulatedTime >= this.simulatedDuration) {
        this.simulatedTime = this.simulatedDuration;
        this.stopTimer();
        this.emit('ended');
      } else {
        this.emit('tick');
      }
    }, 500);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private emit(event: EngineEvent): void {
    this.listeners.forEach((l) => l(event));
  }
}
