import type { PostItem } from "@/types";

export const MOCK_POSTS: PostItem[] = [
  {
    id: "p1",
    author: "Maria",
    uid: "SC-F6G7H8J9K0",
    time: "2 hours ago",
    text: "Beautiful sunset today. Grateful for quiet moments with close friends only.",
    likes: 12,
    comments: 3,
  },
  {
    id: "p2",
    author: "Alex",
    uid: "SC-A1B2C3D4E5",
    time: "Yesterday",
    text: "Shipped the new auth flow — email verify, 2FA, and session lock all in place.",
    likes: 28,
    comments: 7,
  },
  {
    id: "p3",
    author: "Dev Team",
    uid: "SC-L1M2N3O4P5",
    time: "Monday",
    text: "Reminder: stories are visible to accepted contacts only. Keep your circle small.",
    likes: 45,
    comments: 2,
  },
];
