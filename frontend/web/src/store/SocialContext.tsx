import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getCachedSession } from "@/api/auth";
import { MOCK_POSTS } from "@/data/mockPosts";
import { MOCK_STORIES } from "@/data/mockStories";
import type { PostItem, StoryItem, StorySlide } from "@/types";
import { readFileAsObjectUrl } from "@/utils/files";

interface SocialContextValue {
  stories: StoryItem[];
  posts: PostItem[];
  addStory: (file: File, caption?: string) => Promise<StoryItem | null>;
  addPost: (text: string, file?: File) => Promise<void>;
  togglePostLike: (postId: string) => void;
}

const SocialContext = createContext<SocialContextValue | null>(null);

function cloneStories(): StoryItem[] {
  return MOCK_STORIES.map((s) => ({ ...s, slides: [...s.slides] }));
}

function clonePosts(): PostItem[] {
  return MOCK_POSTS.map((p) => ({ ...p }));
}

export function SocialProvider({ children }: { children: ReactNode }) {
  const [stories, setStories] = useState<StoryItem[]>(cloneStories);
  const [posts, setPosts] = useState<PostItem[]>(clonePosts);

  const addStory = useCallback(async (file: File, caption?: string) => {
    const mediaUrl = await readFileAsObjectUrl(file);
    const slide: StorySlide = {
      id: `slide-${Date.now()}`,
      mediaUrl,
      mimeType: file.type || "application/octet-stream",
      caption: caption?.trim() || undefined,
      createdAt: Date.now(),
    };
    let yours: StoryItem | null = null;
    setStories((prev) =>
      prev.map((s) => {
        if (!s.isYours) return s;
        yours = {
          ...s,
          hasUnread: false,
          preview: "Just now",
          slides: [...s.slides, slide],
        };
        return yours;
      }),
    );
    return yours;
  }, []);

  const addPost = useCallback(async (text: string, file?: File) => {
    const session = getCachedSession();
    const trimmed = text.trim();
    if (!trimmed && !file) return;

    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;
    let fileName: string | undefined;
    if (file) {
      mediaUrl = await readFileAsObjectUrl(file);
      mediaMimeType = file.type || "application/octet-stream";
      fileName = file.name;
    }

    const post: PostItem = {
      id: `post-${Date.now()}`,
      author: session?.user.username ?? "You",
      uid: session?.user.uid ?? "SC-LOCAL",
      time: "Just now",
      text: trimmed || (file ? file.name : ""),
      likes: 0,
      likedByMe: false,
      comments: 0,
      mediaUrl,
      mediaMimeType,
      fileName,
    };
    setPosts((prev) => [post, ...prev]);
  }, []);

  const togglePostLike = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const liked = !p.likedByMe;
        return {
          ...p,
          likedByMe: liked,
          likes: Math.max(0, p.likes + (liked ? 1 : -1)),
        };
      }),
    );
  }, []);

  const value = useMemo(
    () => ({ stories, posts, addStory, addPost, togglePostLike }),
    [stories, posts, addStory, addPost, togglePostLike],
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error("useSocial must be used within SocialProvider");
  return ctx;
}
