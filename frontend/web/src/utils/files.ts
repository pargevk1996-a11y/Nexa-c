export type FileCategory = "image" | "video" | "audio" | "document";

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", bmp: "image/bmp", ico: "image/x-icon", svg: "image/svg+xml",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  avi: "video/x-msvideo", mkv: "video/x-matroska",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav",
  aac: "audio/aac", flac: "audio/flac", m4a: "audio/mp4",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip", rar: "application/x-rar-compressed",
  tar: "application/x-tar", gz: "application/gzip",
  txt: "text/plain", csv: "text/csv", html: "text/html", json: "application/json",
};

export function getMimeFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

/** Accept any file type in the attachment picker. */
export const FILE_INPUT_ACCEPT = "*/*";

export const VIDEO_INPUT_ACCEPT = "video/*";

export const IMAGE_INPUT_ACCEPT = "image/*";

/** Single picker for photos, videos, and documents in the composer. */
export const COMPOSER_ATTACH_ACCEPT = "image/*,video/*,*/*";

const IMAGE_TYPES = /^image\//;
const VIDEO_TYPES = /^video\//;
const AUDIO_TYPES = /^audio\//;

export function getFileCategory(mimeType: string): FileCategory {
  if (IMAGE_TYPES.test(mimeType)) return "image";
  if (VIDEO_TYPES.test(mimeType)) return "video";
  if (AUDIO_TYPES.test(mimeType)) return "audio";
  return "document";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function filePreviewLabel(name: string, size: number): string {
  return `${name} (${formatFileSize(size)})`;
}

export async function readFileAsObjectUrl(file: File): Promise<string> {
  return URL.createObjectURL(file);
}
