export interface User {
  id: string;
  email: string;
  username: string;
  uid: string;
  avatarUrl?: string;
}

export interface AuthSession {
  user: User;
  accessToken?: string;
  expiresIn?: number;
  demoMode?: boolean;
}

export type ChatType =
  | "private"
  | "secret"
  | "group"
  | "supergroup"
  | "channel"
  | "saved";

export type ChatFolderId = "personal" | "work" | "groups" | "channels" | "unread";

export interface Conversation {
  id: string;
  uid: string;
  /** @mention handle without $ — search with $handle */
  username?: string;
  name: string;
  lastMessage: string;
  lastAt: string;
  /** Unix ms timestamp for sort ordering — newer = higher */
  lastAtTs?: number;
  unread: number;
  online: boolean;
  /** Explicit chat kind (derived from flags if omitted) */
  chatType?: ChatType;
  /** Legacy — maps to group / supergroup */
  isGroup?: boolean;
  isSupergroup?: boolean;
  /** Broadcast channel — subscribers read-only */
  isChannel?: boolean;
  isSecret?: boolean;
  isSuperSecret?: boolean;
  archived?: boolean;
  /** Hidden from main list (like Telegram archive for hidden) */
  hidden?: boolean;
  blocked?: boolean;
  contactRemoved?: boolean;
  linkedConversationId?: string;
  peerUserId?: string;
  memberIds?: string[];
  memberCount?: number;
  /** Channel: false = broadcast (only admins post) */
  canPost?: boolean;
  isChannelAdmin?: boolean;
  favorite?: boolean;
  typing?: boolean;
  pinned?: boolean;
  /** User folder / category label */
  folderId?: ChatFolderId;
  /** Message content is locked for this user (pending contact request) */
  isLocked?: boolean;
  /** Pending contact request id (incoming — to show accept/decline) */
  contactRequestId?: string;
}

export type MessageKind = "text" | "voice" | "video" | "file" | "gif" | "sticker" | "poll" | "quiz";

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface PollData {
  question: string;
  options: PollOption[];
  multiple?: boolean;
  closed?: boolean;
  votedOptionIds?: string[];
}

export interface QuizData extends PollData {
  correctOptionId: string;
  explanation?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  kind?: MessageKind;
  text: string;
  sentAt: string;
  outgoing: boolean;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  /** Voice message duration in seconds */
  voiceDuration?: number;
  /** Video message duration in seconds */
  videoDuration?: number;
  /** Round video note (Telegram-style circle) */
  videoNote?: boolean;
  voiceUrl?: string;
  /** Normalized 0–1 bar heights for waveform UI */
  voiceWaveform?: number[];
  fileName?: string;
  fileUrl?: string;
  mediaId?: string;
  previewUrl?: string | null;
  streamUrl?: string | null;
  fileMimeType?: string;
  fileSize?: number;
  fileCategory?: "image" | "video" | "audio" | "document";
  recalled?: boolean;
  /** Shown when deleted for everyone (demo) */
  deleted?: boolean;
  /** Disappears after the recipient views it */
  ephemeral?: boolean;
  replyTo?: {
    id: string;
    text: string;
    senderLabel: string;
  };
  forwardFrom?: string;
  reactions?: Record<string, number>;
  myReaction?: string;
  editedAt?: string;
  silent?: boolean;
  /** Server sequence (live / offline sync) */
  seq?: number;
  /** ID of the message being replied to — resolved to replyTo after loading */
  replyToId?: string;
  scheduledAt?: string;
  pinned?: boolean;
  linkPreview?: LinkPreview;
  mentions?: string[];
  hashtags?: string[];
  poll?: PollData;
  quiz?: QuizData;
  /** Sent while SecureChat mode was active — no copy, no download, delete-for-both only */
  secureMode?: boolean;
}

export interface StorySlide {
  id: string;
  mediaUrl: string;
  mimeType: string;
  caption?: string;
  createdAt: number;
}

export interface StoryItem {
  id: string;
  name: string;
  hasUnread: boolean;
  isYours?: boolean;
  preview?: string;
  slides: StorySlide[];
}

export interface PostItem {
  id: string;
  author: string;
  uid: string;
  time: string;
  text: string;
  likes: number;
  likedByMe?: boolean;
  comments: number;
  mediaUrl?: string;
  mediaMimeType?: string;
  fileName?: string;
}

export type CallType = "audio" | "video";

export type LoginResult =
  | { ok: true; session: AuthSession }
  | { ok: false; code: string; message: string; details?: string[] }
  | { ok: false; requires2fa: true; challengeId: string }
  | { ok: false; emailNotVerified: true }
  | { ok: false; code: string; passwordResetRequired: true; message: string };
