import { useEffect, useRef } from 'react';
import { getSpectrum } from '@/player/webAudio';

interface VisualizerProps {
  playing: boolean;
  className?: string;
  /** Current artwork colors; the spectrum follows the cover when available. */
  colors?: [string, string] | null;
}

const BARS = 44;

/**
 * Spectrum strip. When the Web Audio graph is wired (same-origin, cached or
 * local sources) it renders the real FFT with fast-attack / slow-release
 * smoothing and falling peak caps; otherwise a beat-flavoured simulated
 * animation. Gradient follows the current cover when provided.
 */
export function Visualizer({ playing, className, colors }: VisualizerProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    let raf = 0;
    let t = 0;
    let last = performance.now();
    const heights = new Float32Array(BARS);
    const caps = new Float32Array(BARS);
    const bins = new Uint8Array(BARS);
    // Simulated mode: a decaying "kick" envelope keeps the fake bars musical.
    let kick = 0;
    let kickTimer = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playingRef.current) t += dt;
      const w = canvas.clientWidth || 300;
      const h = canvas.clientHeight || 26;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.clearRect(0, 0, w, h);

      const live = getSpectrum(bins);
      if (live && playingRef.current) {
        kickTimer = 0;
      } else if (playingRef.current) {
        kickTimer += dt;
        if (kickTimer > 0.55) {
          kickTimer = 0;
          kick = 1;
        }
      }
      kick = Math.max(0, kick - dt * 2.4);

      // Gradient follows the artwork when known, else the classic rainbow.
      const palette = colorsRef.current;
      const spectrum = ctx.createLinearGradient(0, 0, w, 0);
      if (palette) {
        spectrum.addColorStop(0, palette[0]);
        spectrum.addColorStop(1, palette[1] ?? palette[0]);
        ctx.globalAlpha = 0.95;
      } else {
        spectrum.addColorStop(0, 'rgba(74, 126, 255, 0.92)');
        spectrum.addColorStop(0.34, 'rgba(123, 108, 255, 0.9)');
        spectrum.addColorStop(0.68, 'rgba(239, 111, 173, 0.9)');
        spectrum.addColorStop(1, 'rgba(255, 177, 92, 0.92)');
      }
      ctx.fillStyle = spectrum;

      const gap = 3;
      const bw = (w - gap * (BARS - 1)) / BARS;
      for (let i = 0; i < BARS; i++) {
        let target: number;
        if (live) {
          // Log-ish bin sampling so bass does not dominate every bar.
          const bin = Math.min(bins.length - 1, Math.floor(Math.pow(i / BARS, 1.4) * bins.length));
          target = Math.max(bins[bin] / 255, 0.04);
        } else {
          const v =
            (Math.sin(t * 2.3 + i * 0.52) * 0.5 + 0.5) *
            (Math.sin(t * 0.9 + i * 0.23) * 0.3 + 0.7);
          target = playingRef.current ? v * (0.72 + kick * 0.5) : v * 0.12 + 0.03;
        }
        // Fast attack, slow release - the signature of a real analyser.
        heights[i] += (target - heights[i]) * (target > heights[i] ? 0.5 : 0.16);
        caps[i] = Math.max(caps[i] - dt * 0.28, heights[i]);

        const bh = Math.max(2, heights[i] * h);
        const x = i * (bw + gap);
        ctx.beginPath();
        ctx.roundRect(x, h - bh, bw, bh, bw / 2);
        ctx.fill();
        // Falling peak cap just above the bar.
        const capH = Math.max(2.5, caps[i] * h);
        ctx.beginPath();
        ctx.roundRect(x, h - capH - 3, bw, 2.5, 1.25);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
