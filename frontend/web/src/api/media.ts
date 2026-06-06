import { apiFetch } from "./client";

export interface InitUploadResponse {
  upload_id: string;
  chunk_size: number;
  total_chunks: number;
  expires_at: string;
  uploaded_chunks: number[];
}

export interface CompleteUploadResponse {
  media_id: string;
  mime_type: string;
  size_bytes: number;
  has_preview: boolean;
  stream_url: string;
  preview_url: string | null;
}

export interface SignedUrlResponse {
  media_id: string;
  stream_url: string;
  preview_url: string | null;
  download_url: string;
  expires_in: number;
}

export async function initUpload(body: {
  filename: string;
  mime_type: string;
  size_bytes: number;
}): Promise<InitUploadResponse> {
  return apiFetch<InitUploadResponse>("/media/uploads", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getUploadStatus(uploadId: string): Promise<{
  upload_id: string;
  received_chunks: number[];
  total_chunks: number;
  complete: boolean;
}> {
  return apiFetch(`/media/uploads/${uploadId}`);
}

export async function uploadChunk(
  uploadId: string,
  chunkIndex: number,
  data: ArrayBuffer,
): Promise<void> {
  const session = await import("@/security/sessionCache").then((m) => m.getCachedSession());
  const csrf = await import("@/security/csrf").then((m) => m.getCsrfToken());
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
  };
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  if (csrf) headers["X-CSRF-Token"] = csrf;

  const res = await fetch(`/api/v1/media/uploads/${uploadId}/chunks/${chunkIndex}`, {
    method: "PUT",
    credentials: "include",
    headers,
    body: data,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Chunk upload failed");
  }
}

export async function completeUpload(uploadId: string): Promise<CompleteUploadResponse> {
  return apiFetch<CompleteUploadResponse>(`/media/uploads/${uploadId}/complete`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getMediaUrls(mediaId: string): Promise<SignedUrlResponse> {
  return apiFetch<SignedUrlResponse>(`/media/${mediaId}/url`);
}
