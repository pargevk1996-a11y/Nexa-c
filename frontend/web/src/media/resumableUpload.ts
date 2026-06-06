import {
  completeUpload,
  getUploadStatus,
  initUpload,
  uploadChunk,
  type CompleteUploadResponse,
} from "@/api/media";

const RESUME_PREFIX = "nexa:upload:";

export interface UploadProgress {
  uploaded: number;
  total: number;
  percent: number;
}

function resumeKey(file: File): string {
  return `${RESUME_PREFIX}${file.name}:${file.size}:${file.lastModified}`;
}

export async function uploadFileResumable(
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<CompleteUploadResponse> {
  const key = resumeKey(file);
  let uploadId: string | null = null;
  let chunkSize = 1024 * 1024;
  let totalChunks = 1;
  let uploaded = new Set<number>();

  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as { uploadId: string; chunkSize: number; totalChunks: number };
      uploadId = parsed.uploadId;
      chunkSize = parsed.chunkSize;
      totalChunks = parsed.totalChunks;
      const status = await getUploadStatus(uploadId);
      uploaded = new Set(status.received_chunks);
    } catch {
      localStorage.removeItem(key);
      uploadId = null;
    }
  }

  if (!uploadId) {
    const init = await initUpload({
      filename: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
    });
    uploadId = init.upload_id;
    chunkSize = init.chunk_size;
    totalChunks = init.total_chunks;
    uploaded = new Set(init.uploaded_chunks);
    localStorage.setItem(key, JSON.stringify({ uploadId, chunkSize, totalChunks }));
  }

  for (let i = 0; i < totalChunks; i++) {
    if (uploaded.has(i)) continue;
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const slice = file.slice(start, end);
    const buf = await slice.arrayBuffer();
    await uploadChunk(uploadId, i, buf);
    uploaded.add(i);
    onProgress?.({
      uploaded: uploaded.size,
      total: totalChunks,
      percent: Math.round((uploaded.size / totalChunks) * 100),
    });
  }

  const result = await completeUpload(uploadId);
  localStorage.removeItem(key);
  return result;
}
