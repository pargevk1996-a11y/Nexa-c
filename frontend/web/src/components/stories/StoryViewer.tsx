import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "@/store/SettingsContext";
import type { StoryItem, StorySlide } from "@/types";

interface StoryViewerProps {
  story: StoryItem;
  storyIndex: number;
  storyCount: number;
  hasPrevStory?: boolean;
  hasNextStory?: boolean;
  onClose: () => void;
  onPrevStory?: () => void;
  onNextStory?: () => void;
}

export function StoryViewer({
  story,
  storyIndex,
  storyCount,
  hasPrevStory,
  hasNextStory,
  onClose,
  onPrevStory,
  onNextStory,
}: StoryViewerProps) {
  const { settings } = useSettings();
  const fullDurationMs = settings.storyPhotoDurationSec * 1000;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const imageTimerRef = useRef<number | null>(null);
  const imageEndsAtRef = useRef(0);
  const imageRemainingRef = useRef(fullDurationMs);
  const progressFrameRef = useRef<number | null>(null);
  const pausedRef = useRef(paused);

  pausedRef.current = paused;

  const slide = story.slides[index];
  const isVideo = slide?.mimeType.startsWith("video/") ?? false;

  const touchStartX = useRef(0);

  const advance = useCallback(() => {
    if (index < story.slides.length - 1) {
      setIndex((i) => i + 1);
    } else if (hasNextStory && onNextStory) {
      onNextStory();
    } else {
      onClose();
    }
  }, [index, story.slides.length, hasNextStory, onNextStory, onClose]);

  const retreat = useCallback(() => {
    if (index > 0) {
      setIndex((i) => i - 1);
    } else if (hasPrevStory && onPrevStory) {
      onPrevStory();
    }
  }, [index, hasPrevStory, onPrevStory]);

  useEffect(() => {
    setIndex(0);
    setPaused(false);
    setProgress(0);
  }, [story.id]);

  const clearImageTimer = useCallback(() => {
    if (imageTimerRef.current !== null) {
      window.clearTimeout(imageTimerRef.current);
      imageTimerRef.current = null;
    }
  }, []);

  const stopProgressLoop = useCallback(() => {
    if (progressFrameRef.current !== null) {
      cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
    }
  }, []);

  const startProgressLoop = useCallback(
    (getRatio: () => number) => {
      stopProgressLoop();
      const tick = () => {
        if (!pausedRef.current) {
          setProgress(Math.min(1, Math.max(0, getRatio())));
        }
        progressFrameRef.current = requestAnimationFrame(tick);
      };
      progressFrameRef.current = requestAnimationFrame(tick);
    },
    [stopProgressLoop],
  );

  const scheduleImageAdvance = useCallback(
    (remainingMs: number) => {
      clearImageTimer();
      imageEndsAtRef.current = Date.now() + remainingMs;
      imageTimerRef.current = window.setTimeout(() => {
        advance();
      }, remainingMs);
      startProgressLoop(() => {
        const left = Math.max(0, imageEndsAtRef.current - Date.now());
        return 1 - left / fullDurationMs;
      });
    },
    [clearImageTimer, advance, startProgressLoop, fullDurationMs],
  );

  const pauseImageSlide = useCallback(() => {
    if (imageTimerRef.current === null) return;
    const left = Math.max(0, imageEndsAtRef.current - Date.now());
    clearImageTimer();
    return left;
  }, [clearImageTimer]);

  useEffect(() => {
    setPaused(false);
    setProgress(0);
    imageRemainingRef.current = fullDurationMs;
    clearImageTimer();
    stopProgressLoop();
  }, [index, fullDurationMs, clearImageTimer, stopProgressLoop]);

  useEffect(() => {
    if (!slide || isVideo) return;
    if (paused) {
      const left = pauseImageSlide();
      if (left !== undefined) imageRemainingRef.current = left;
      stopProgressLoop();
      return;
    }
    scheduleImageAdvance(imageRemainingRef.current);
    return () => {
      clearImageTimer();
      stopProgressLoop();
    };
  }, [
    slide,
    isVideo,
    paused,
    index,
    fullDurationMs,
    scheduleImageAdvance,
    pauseImageSlide,
    clearImageTimer,
    stopProgressLoop,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!slide || !isVideo || !video) return;

    if (paused) {
      video.pause();
      stopProgressLoop();
      return;
    }

    void video.play().catch(() => {});

    const onTimeUpdate = () => {
      if (video.duration && Number.isFinite(video.duration)) {
        setProgress(video.currentTime / video.duration);
      }
    };
    const onEnded = () => advance();

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    startProgressLoop(() =>
      video.duration && Number.isFinite(video.duration)
        ? video.currentTime / video.duration
        : 0,
    );

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      stopProgressLoop();
    };
  }, [slide, isVideo, paused, index, advance, startProgressLoop, stopProgressLoop]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") advance();
      if (e.key === "ArrowLeft") retreat();
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, advance, retreat]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? 0;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const dx = endX - touchStartX.current;
    if (Math.abs(dx) < 48) return;
    if (dx < 0) advance();
    else retreat();
  }

  function togglePause() {
    setPaused((p) => !p);
  }

  function handlePrev(e: React.MouseEvent) {
    e.stopPropagation();
    retreat();
  }

  function handleNext(e: React.MouseEvent) {
    e.stopPropagation();
    advance();
  }

  function handleCenter(e: React.MouseEvent) {
    e.stopPropagation();
    togglePause();
  }

  if (!slide) {
    return (
      <div className="story-viewer" role="dialog" aria-label="Story">
        <div className="story-viewer__backdrop" onClick={onClose} />
        <div className="story-viewer__empty" onClick={(e) => e.stopPropagation()}>
          <p>No slides in this story yet.</p>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="story-viewer" role="dialog" aria-label={`${story.name} story`}>
      <div className="story-viewer__backdrop" onClick={onClose} aria-label="Close story" />
      <div className="story-viewer__panel" onClick={(e) => e.stopPropagation()}>
        <div className="story-viewer__progress" aria-hidden>
          {story.slides.map((s: StorySlide, i: number) => (
            <span
              key={s.id}
              className={`story-viewer__progress-seg ${i < index ? "story-viewer__progress-seg--done" : ""} ${i === index ? "story-viewer__progress-seg--active" : ""}`}
            >
              {i === index ? (
                <span
                  className="story-viewer__progress-fill"
                  style={{ width: `${progress * 100}%` }}
                />
              ) : null}
            </span>
          ))}
        </div>

        <header className="story-viewer__head">
          <strong>{story.name}</strong>
          <span>
            Story {storyIndex + 1}/{storyCount} · slide {index + 1}/{story.slides.length}
          </span>
          <button type="button" className="story-viewer__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div
          className="story-viewer__media-wrap"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {isVideo ? (
            <video
              ref={videoRef}
              key={slide.id}
              className="story-viewer__media"
              src={slide.mediaUrl}
              autoPlay
              playsInline
              preload="auto"
            />
          ) : (
            <img
              key={slide.id}
              className="story-viewer__media"
              src={slide.mediaUrl}
              alt={slide.caption ?? story.name}
            />
          )}

          {paused ? (
            <div className="story-viewer__pause-hint" aria-hidden>
              <span className="story-viewer__pause-icon">❚❚</span>
            </div>
          ) : null}

          <div className="story-viewer__zones">
            <button
              type="button"
              className="story-viewer__zone story-viewer__zone--prev"
              aria-label="Previous slide"
              onClick={handlePrev}
            />
            <button
              type="button"
              className="story-viewer__zone story-viewer__zone--center"
              aria-label={paused ? "Resume" : "Pause"}
              onClick={handleCenter}
            />
            <button
              type="button"
              className="story-viewer__zone story-viewer__zone--next"
              aria-label="Next slide"
              onClick={handleNext}
            />
          </div>
        </div>

        {slide.caption ? <p className="story-viewer__caption">{slide.caption}</p> : null}
      </div>
    </div>
  );
}
