/** Shared voice capture/playback helpers (noise suppression, waveform peaks). */

export const VOICE_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
};

export function formatVoiceDuration(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  return mm > 0 ? `${mm}:${ss}` : `0:${ss}`;
}

/** Normalize peaks to 0–1 for bar height. */
export function normalizePeaks(peaks: number[]): number[] {
  const max = Math.max(...peaks, 0.001);
  return peaks.map((p) => Math.max(0.08, p / max));
}

/** Decode blob and sample peak amplitudes per bar. */
export async function extractWaveformPeaks(blob: Blob, bars = 32): Promise<number[]> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = new AudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / bars));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      const start = i * blockSize;
      for (let j = 0; j < blockSize; j++) {
        const v = Math.abs(channel[start + j] ?? 0);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    await ctx.close();
    return normalizePeaks(peaks);
  } catch {
    return Array.from({ length: bars }, (_, i) => 0.2 + ((i * 13) % 50) / 100);
  }
}

export const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export function nextPlaybackSpeed(current: PlaybackSpeed): PlaybackSpeed {
  const idx = PLAYBACK_SPEEDS.indexOf(current);
  return PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
}
