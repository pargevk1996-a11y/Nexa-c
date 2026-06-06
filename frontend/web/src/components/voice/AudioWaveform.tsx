import { useLiveWaveform } from "@/voice/useLiveWaveform";
import { WaveformBars } from "./WaveformBars";

interface AudioWaveformProps {
  stream: MediaStream | null;
  active?: boolean;
  className?: string;
}

/** Live waveform for voice recording or active voice call. */
export function AudioWaveform({ stream, active = true, className }: AudioWaveformProps) {
  const bars = useLiveWaveform(stream, active && Boolean(stream));
  return (
    <WaveformBars
      peaks={bars}
      active={active}
      className={className ?? "voice-msg__wave voice-msg__wave--live"}
    />
  );
}
