import { useEffect, useRef, useState } from "react";

const BAR_COUNT = 28;

/** Live frequency bars from MediaStream (recording / voice call). */
export function useLiveWaveform(stream: MediaStream | null, active: boolean): number[] {
  const [bars, setBars] = useState<number[]>(() => Array(BAR_COUNT).fill(0.15));
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!stream || !active) {
      setBars(Array(BAR_COUNT).fill(0.12));
      return;
    }

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.75;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    ctxRef.current = ctx;
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const slice = Math.floor(data.length / BAR_COUNT);
      const next = Array.from({ length: BAR_COUNT }, (_, i) => {
        let sum = 0;
        for (let j = 0; j < slice; j++) sum += data[i * slice + j] ?? 0;
        return Math.max(0.1, Math.min(1, (sum / slice / 255) * 1.4));
      });
      setBars(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      source.disconnect();
      void ctx.close();
      ctxRef.current = null;
      analyserRef.current = null;
    };
  }, [stream, active]);

  return bars;
}
