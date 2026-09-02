import { useEffect, useRef } from 'react';

interface VisualizerProps {
  playing: boolean;
  className?: string;
}

/** Decorative spectrum strip (Halcyon AudioVisualizer equivalent, simulated). */
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
      for (let i = 0; i < bars; i++) {
        const v =
          (Math.sin(t * 2.3 + i * 0.52) * 0.5 + 0.5) *
          (Math.sin(t * 0.9 + i * 0.23) * 0.3 + 0.7);
        const amp = playingRef.current ? v : v * 0.12 + 0.03;
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
