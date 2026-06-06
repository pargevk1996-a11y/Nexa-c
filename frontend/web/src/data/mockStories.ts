import type { StoryItem } from "@/types";

export const MOCK_STORIES: StoryItem[] = [
  {
    id: "you",
    name: "Your story",
    isYours: true,
    hasUnread: false,
    slides: [],
  },
  {
    id: "s1",
    name: "Alex",
    hasUnread: true,
    preview: "2h ago",
    slides: [
      {
        id: "s1-1",
        mediaUrl:
          "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
        mimeType: "image/jpeg",
        caption: "Mountain view",
        createdAt: Date.now() - 2 * 3600000,
      },
    ],
  },
  {
    id: "s2",
    name: "Maria",
    hasUnread: true,
    preview: "5h ago",
    slides: [
      {
        id: "s2-1",
        mediaUrl:
          "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&q=80",
        mimeType: "image/jpeg",
        createdAt: Date.now() - 5 * 3600000,
      },
    ],
  },
  {
    id: "s3",
    name: "Ivan",
    hasUnread: false,
    preview: "Yesterday",
    slides: [
      {
        id: "s3-1",
        mediaUrl:
          "https://images.unsplash.com/photo-1511379938549-c1f69419868d?w=800&q=80",
        mimeType: "image/jpeg",
        caption: "Studio session",
        createdAt: Date.now() - 86400000,
      },
    ],
  },
  {
    id: "s4",
    name: "Dev Team",
    hasUnread: false,
    preview: "Mon",
    slides: [
      {
        id: "s4-1",
        mediaUrl:
          "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80",
        mimeType: "image/jpeg",
        createdAt: Date.now() - 3 * 86400000,
      },
    ],
  },
];
