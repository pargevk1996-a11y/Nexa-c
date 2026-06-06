import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { Avatar } from "@/components/ui/Avatar";
import { useSocial } from "@/store/SocialContext";
import type { StoryItem } from "@/types";

export function StoryStrip() {
  const { stories, addStory } = useSocial();
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [viewerOpen, setViewerOpen] = useState(false);
  const [storyIndex, setStoryIndex] = useState(0);
  const addInputRef = useRef<HTMLInputElement>(null);

  const viewableStories = useMemo(
    () => stories.filter((s) => s.slides.length > 0),
    [stories],
  );

  const activeStory = viewableStories[storyIndex] ?? null;

  const yours = stories.find((s) => s.isYours);
  const others = stories.filter((s) => !s.isYours);

  function openStory(story: StoryItem) {
    if (story.isYours) {
      if (story.slides.length > 0) {
        const idx = viewableStories.findIndex((s) => s.id === story.id);
        setStoryIndex(idx >= 0 ? idx : 0);
        setViewerOpen(true);
      } else {
        addInputRef.current?.click();
      }
      return;
    }
    if (story.slides.length === 0) return;
    const idx = viewableStories.findIndex((s) => s.id === story.id);
    if (idx < 0) return;
    setViewed((prev) => new Set(prev).add(story.id));
    setStoryIndex(idx);
    setViewerOpen(true);
  }

  async function onAddStoryFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await addStory(file);
    setStoryIndex(0);
    setViewerOpen(true);
  }

  return (
    <>
      <input
        ref={addInputRef}
        type="file"
        className="sr-only"
        accept="image/*,video/*"
        aria-hidden
        onChange={onAddStoryFile}
      />
      <div className="story-strip" role="list" aria-label="Stories">
        {yours ? (
          <button
            type="button"
            className="story-strip__item story-strip__item--yours"
            onClick={() => openStory(yours)}
            title={yours.slides.length ? "Your story" : "Add story"}
          >
            <span
              className={`story-strip__ring ${yours.slides.length ? "story-strip__ring--live" : "story-strip__ring--add"}`}
            >
              <Avatar name={yours.name} size="sm" />
              {yours.slides.length === 0 ? (
                <span className="story-strip__add-badge" aria-hidden>
                  +
                </span>
              ) : null}
            </span>
            <span className="story-strip__label">You</span>
          </button>
        ) : null}
        {others.map((s) => {
          const seen = viewed.has(s.id) || (!s.hasUnread && s.slides.length > 0);
          const hasStory = s.slides.length > 0;
          return (
            <button
              key={s.id}
              type="button"
              className="story-strip__item"
              disabled={!hasStory}
              onClick={() => openStory(s)}
              title={hasStory ? `${s.name}'s story` : `${s.name} — no story`}
            >
              <span
                className={`story-strip__ring ${hasStory ? (seen ? "story-strip__ring--seen" : "story-strip__ring--new") : "story-strip__ring--empty"}`}
              >
                {hasStory && s.slides[0]?.mimeType.startsWith("image/") ? (
                  <img
                    src={s.slides[s.slides.length - 1].mediaUrl}
                    alt=""
                    className="story-strip__thumb"
                  />
                ) : (
                  <Avatar name={s.name} size="sm" />
                )}
              </span>
              <span className="story-strip__label">{s.name.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>
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
              onNextStory={() =>
                setStoryIndex((i) => Math.min(viewableStories.length - 1, i + 1))
              }
              onClose={() => setViewerOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}
