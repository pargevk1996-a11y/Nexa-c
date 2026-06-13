import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSocial } from "@/store/SocialContext";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { Avatar } from "@/components/ui/Avatar";
import type { StoryItem } from "@/types";

const PEEK_COUNT = 3;

export function StoryPeek() {
  const { stories } = useSocial();
  const [expanded, setExpanded] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [storyIndex, setStoryIndex] = useState(0);
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement>(null);

  const viewableStories = stories.filter((s) => s.slides.length > 0);
  const yours = stories.find((s) => s.isYours);
  const activeStory = viewableStories[storyIndex] ?? null;
  const peekItems = viewableStories.slice(0, PEEK_COUNT);
  const extraCount = viewableStories.length - PEEK_COUNT;

  // Close dropdown on outside click
  useEffect(() => {
    if (!expanded) return;
    function onPointer(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [expanded]);

  // With no stories to peek, the inline trigger would render as an empty
  // (unlabeled) button — a stray "·" in the header. Only show it when there is
  // at least one viewable story.
  if (viewableStories.length === 0) return null;

  function openStory(story: StoryItem) {
    if (story.slides.length === 0) return;
    const idx = viewableStories.findIndex((s) => s.id === story.id);
    if (idx < 0) return;
    setViewed((prev) => new Set(prev).add(story.id));
    setStoryIndex(idx);
    setViewerOpen(true);
    setExpanded(false);
  }

  function thumb(s: StoryItem) {
    const last = s.slides[s.slides.length - 1];
    if (last?.mimeType.startsWith("image/")) {
      return <img src={last.mediaUrl} alt="" className="story-peek__thumb" />;
    }
    return <Avatar name={s.name} size="sm" />;
  }

  const othersWithStory = viewableStories.filter((s) => !s.isYours);

  return (
    <div className="story-peek-wrap" ref={wrapRef}>
      {/* Inline cluster — sits in the header title row */}
      <button
        type="button"
        className="story-peek-trigger"
        onClick={() => setExpanded((v) => !v)}
        aria-label="Stories"
        title="Stories"
      >
        <div className="story-peek-stack">
          {peekItems.map((s, i) => {
            const seen = viewed.has(s.id) || (!s.hasUnread && s.slides.length > 0);
            return (
              <span
                key={s.id}
                className={`story-peek-ring ${seen ? "story-peek-ring--seen" : "story-peek-ring--new"}`}
                style={{ zIndex: PEEK_COUNT - i }}
              >
                {thumb(s)}
              </span>
            );
          })}
          {extraCount > 0 && (
            <span className="story-peek-more">+{extraCount}</span>
          )}
        </div>
      </button>

      {/* Dropdown — absolute, no layout shift */}
      {expanded && (
        <div className="story-peek-dropdown">
          <div className="story-peek-dropdown__header">
            <span>Stories</span>
            <button
              type="button"
              className="story-peek-dropdown__close"
              onClick={() => setExpanded(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="story-strip story-strip--inline">
            {yours ? (
              <button
                type="button"
                className="story-strip__item story-strip__item--yours"
                onClick={() => openStory(yours)}
                title={yours.slides.length ? "Your story" : "Add story"}
              >
                <span className={`story-strip__ring ${yours.slides.length ? "story-strip__ring--live" : "story-strip__ring--add"}`}>
                  <Avatar name={yours.name} size="sm" />
                  {yours.slides.length === 0 && (
                    <span className="story-strip__add-badge" aria-hidden>+</span>
                  )}
                </span>
                <span className="story-strip__label">You</span>
              </button>
            ) : null}
            {othersWithStory.map((s) => {
              const seen = viewed.has(s.id) || (!s.hasUnread);
              return (
                <button
                  key={s.id}
                  type="button"
                  className="story-strip__item"
                  onClick={() => openStory(s)}
                  title={`${s.name}'s story`}
                >
                  <span className={`story-strip__ring ${seen ? "story-strip__ring--seen" : "story-strip__ring--new"}`}>
                    {thumb(s)}
                  </span>
                  <span className="story-strip__label">{s.name.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {viewerOpen && activeStory
        ? createPortal(
            <StoryViewer
              key={activeStory.id}
              story={activeStory}
              storyIndex={storyIndex}
              storyCount={viewableStories.length}
              hasPrevStory={storyIndex > 0}
              hasNextStory={storyIndex < viewableStories.length - 1}
              onPrevStory={() => setStoryIndex((i) => Math.max(0, i - 1))}
              onNextStory={() => setStoryIndex((i) => Math.min(viewableStories.length - 1, i + 1))}
              onClose={() => setViewerOpen(false)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
