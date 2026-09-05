import { useEffect, useRef } from 'react';
import { getSpectrum } from '@/player/webAudio';

interface VisualizerProps {
  playing: boolean;
  className?: string;
}

/**
 * Spectrum strip: real FFT data when the Web Audio graph is wired
 * (same-origin / cached / local sources), otherwise the decorative
 * simulated animation.
 */
export function Visualizer({ playing, className }: VisualizerProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    let raf = 0;
    let t = 0;
    let last = performance.now();
    const bins = new Uint8Array(44);

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playingRef.current) t += dt;
      const w = canvas.clientWidth || 300;
      const h = canvas.clientHeight || 26;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      const bars = 44;
      const gap = 3;
      const bw = (w - gap * (bars - 1)) / bars;
      const spectrum = ctx.createLinearGradient(0, 0, w, 0);
      spectrum.addColorStop(0, 'rgba(74, 126, 255, 0.92)');
      spectrum.addColorStop(0.34, 'rgba(123, 108, 255, 0.9)');
      spectrum.addColorStop(0.68, 'rgba(239, 111, 173, 0.9)');
      spectrum.addColorStop(1, 'rgba(255, 177, 92, 0.92)');
      ctx.fillStyle = spectrum;
      // Real FFT when available (playing through the wired graph), else simulate.
      const live = getSpectrum(bins);
      for (let i = 0; i < bars; i++) {
        let amp: number;
        if (live) {
          // Log-ish bin sampling so bass does not dominate all 44 bars.
          const bin = Math.min(bins.length - 1, Math.floor(Math.pow(i / bars, 1.4) * bins.length));
          amp = bins[bin] / 255;
          amp = Math.max(amp, 0.04);
        } else {
          const v =
            (Math.sin(t * 2.3 + i * 0.52) * 0.5 + 0.5) *
            (Math.sin(t * 0.9 + i * 0.23) * 0.3 + 0.7);
          amp = playingRef.current ? v : v * 0.12 + 0.03;
        }
        const bh = Math.max(2, amp * h);
        const x = i * (bw + gap);
        ctx.beginPath();
        ctx.roundRect(x, h - bh, bw, bh, bw / 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
