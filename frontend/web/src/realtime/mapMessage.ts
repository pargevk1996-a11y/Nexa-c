import type { ApiMessage } from "@/api/chat";
import { getCachedPreviewUrl, getCachedSignedUrl } from "@/media/mediaCache";
import { getMimeFromExtension, getFileCategory } from "@/utils/files";
import type { Message } from "@/types";

function parseVoiceDuration(body: string): number | undefined {
  const m = body.match(/(\d+):(\d{2})/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const s = body.match(/(\d+)\s*s/i);
  if (s) return Number(s[1]);
  return undefined;
}

function parseVideoDuration(body: string): number | undefined {
  const m = body.match(/(\d+):(\d{2})/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const s = body.match(/(\d+)\s*s/i);
  if (s) return Number(s[1]);
  return undefined;
}

export function apiMessageToUi(m: ApiMessage, currentUserId: string): Message {
  const d = new Date(m.created_at);
  const isVoice = m.content_type === "voice";
  const isVideo = m.content_type === "video";
  const isImage = m.content_type === "image";
  const streamUrl = m.media_id ? getCachedSignedUrl(m.media_id) : null;
  const previewUrl = m.media_id ? getCachedPreviewUrl(m.media_id) : null;

  let kind: Message["kind"] = "text";
  if (isVoice) kind = "voice";
  else if (isVideo) kind = "video";
  else if (m.content_type === "text") kind = "text";
  else kind = "file";

  const isFile = m.content_type === "file" || (kind === "file" && Boolean(m.media_id));
  const parsedFileName = isFile ? m.body.split(" (")[0] : undefined;

  let fileCategory: Message["fileCategory"];
  let fileMimeType: string | undefined;
  if (isVoice) {
    fileCategory = "audio";
    fileMimeType = "audio/webm";
  } else if (isVideo) {
    fileCategory = "video";
    fileMimeType = "video/mp4";
  } else if (isImage) {
    fileCategory = "image";
    fileMimeType = "image/jpeg";
  } else if (isFile && parsedFileName) {
    fileMimeType = getMimeFromExtension(parsedFileName);
    fileCategory = getFileCategory(fileMimeType);
  }

  return {
    id: m.id,
    conversationId: m.conversation_id,
    kind,
    text: m.body,
    sentAt: d.toLocaleTimeString("default", { hour: "2-digit", minute: "2-digit", hour12: false }),
    outgoing: m.sender_id === currentUserId,
    status: m.read_by.length > 1 ? "read" : m.delivered_to.length ? "delivered" : "sent",
    ephemeral: Boolean(m.expires_at),
    voiceDuration: isVoice ? parseVoiceDuration(m.body) : undefined,
    voiceUrl: isVoice ? streamUrl ?? undefined : undefined,
    videoDuration: isVideo ? parseVideoDuration(m.body) : undefined,
    streamUrl: streamUrl ?? undefined,
    previewUrl: previewUrl ?? undefined,
    mediaId: m.media_id ?? undefined,
    fileMimeType,
    fileCategory,
    fileName: isVideo || isImage || isFile ? m.body.split(" (")[0] : undefined,
    silent: Boolean(m.silent),
    seq: m.seq,
    replyToId: m.reply_to_id ?? undefined,
    mediaKey: m.media_key ?? undefined,
  };
}
