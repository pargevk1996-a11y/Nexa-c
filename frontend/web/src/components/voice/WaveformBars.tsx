interface WaveformBarsProps {
  peaks: number[];
  active?: boolean;
  progress?: number;
  className?: string;
  barClassName?: string;
}

export function WaveformBars({
  peaks,
  active,
  progress = 0,
  className = "voice-msg__wave",
  barClassName = "voice-msg__bar",
}: WaveformBarsProps) {
  return (
    <div
      className={`${className} ${active ? "voice-msg__wave--active" : ""}`}
      aria-hidden
    >
      {peaks.map((h, i) => {
        const played = progress > 0 && i / peaks.length <= progress;
        return (
          <span
            key={i}
            className={`${barClassName} ${played ? "voice-msg__bar--played" : ""}`}
            style={{ height: `${Math.round(h * 100)}%` }}
          />
        );
      })}
    </div>
  );
}
