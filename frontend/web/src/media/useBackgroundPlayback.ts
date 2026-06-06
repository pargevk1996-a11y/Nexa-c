import { useEffect, useRef } from "react";

/** Keep HTMLMediaElement playing when the tab is hidden (Page Visibility API). */
export function useBackgroundPlayback(audio: HTMLAudioElement | null, playing: boolean) {
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    if (!audio) return;

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        wasPlayingRef.current = !audio!.paused;
        return;
      }
      if (wasPlayingRef.current && playing) {
        void audio!.play().catch(() => undefined);
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [audio, playing]);
}
