export type FileCategory = "image" | "video" | "audio" | "document";

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
