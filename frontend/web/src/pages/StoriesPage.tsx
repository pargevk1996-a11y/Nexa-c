import { useMemo, useRef, useState } from "react";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { Avatar } from "@/components/ui/Avatar";
import { useSocial } from "@/store/SocialContext";
import type { StoryItem } from "@/types";

export function StoriesPage() {
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
    <div className="page-shell">
    <div className="section-page stories-page page-shell__inner">
      <input
        ref={addInputRef}
        type="file"
        className="sr-only"
        accept="image/*,video/*"
        aria-hidden
        onChange={onAddStoryFile}
      />

      <header className="section-page__header section-page__header--row">
        <div>
          <h1>Stories</h1>
          <p>Swipe left/right between people · tap sides inside a story</p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => addInputRef.current?.click()}
        >
          Add story
        </button>
      </header>

      <div className="stories-row" role="list">
        {stories.map((s) => {
          const seen = viewed.has(s.id) || (!s.hasUnread && !s.isYours);
          const hasContent = s.slides.length > 0;
          return (
            <button
              key={s.id}
              type="button"
              className={`story-bubble ${seen ? "story-bubble--seen" : "story-bubble--new"} ${!hasContent && !s.isYours ? "story-bubble--empty" : ""}`}
              onClick={() => openStory(s)}
              disabled={!s.isYours && !hasContent}
            >
              <span className="story-bubble__ring">
                {hasContent && s.slides[0]?.mimeType.startsWith("image/") ? (
                  <img
                    src={s.slides[s.slides.length - 1].mediaUrl}
                    alt=""
                    className="story-bubble__thumb"
                  />
                ) : (
                  <Avatar name={s.name} size="lg" />
                )}
                {s.isYours ? <span className="story-bubble__add">+</span> : null}
              </span>
              <span className="story-bubble__name">{s.isYours ? "Your story" : s.name}</span>
              {s.preview ? <span className="story-bubble__time">{s.preview}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="section-page__card">
        <h2>How stories work</h2>
        <ul className="section-page__list">
          <li>Swipe horizontally to move between contacts&apos; stories.</li>
          <li>Tap left/right inside a story for previous/next slide.</li>
          <li>Tap the center to pause · tap outside to close.</li>
        </ul>
      </div>

      {viewerOpen && activeStory ? (
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
        />
      ) : null}
    </div>
    </div>
  );
}
