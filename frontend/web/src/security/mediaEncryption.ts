/**
 * Client-side media encryption: AES-256-GCM.
 * Format: iv (12 bytes) || ciphertext (n + 16 GCM tag bytes)
 */

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

export async function encryptFile(file: File): Promise<{ encryptedFile: File; keyB64: string }> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const rawKey = await crypto.subtle.exportKey("raw", key);
  const keyB64 = bufToB64(rawKey);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plainBuf = await file.arrayBuffer();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plainBuf);

  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);

  const encryptedFile = new File([out.buffer], "enc", { type: "application/octet-stream" });
  return { encryptedFile, keyB64 };
}

export async function decryptMediaBuffer(encryptedBuf: ArrayBuffer, keyB64: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    b64ToBuf(keyB64),
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const iv = encryptedBuf.slice(0, 12);
  const ct = encryptedBuf.slice(12);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
}

export async function fetchAndDecryptMedia(url: string, keyB64: string, mimeType: string): Promise<string> {
  const resp = await fetch(url);
  const encryptedBuf = await resp.arrayBuffer();
  const plainBuf = await decryptMediaBuffer(encryptedBuf, keyB64);
  const blob = new Blob([plainBuf], { type: mimeType });
  return URL.createObjectURL(blob);
}
