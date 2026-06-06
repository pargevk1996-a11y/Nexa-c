import { base64ToBytes, bytesToBase64 } from "./b64";

const DEVICE_KEY_SLOT = "securechat_device_material_v1";

export function hasDeviceKeyMaterial(): boolean {
  return Boolean(sessionStorage.getItem(DEVICE_KEY_SLOT));
}

export function getOrCreateDeviceKeyMaterial(): Uint8Array {
  const existing = sessionStorage.getItem(DEVICE_KEY_SLOT);
  if (existing) return base64ToBytes(existing);
  const material = crypto.getRandomValues(new Uint8Array(32));
  sessionStorage.setItem(DEVICE_KEY_SLOT, bytesToBase64(material));
  return material;
}

export function destroyDeviceKeyMaterial(): void {
  sessionStorage.removeItem(DEVICE_KEY_SLOT);
}
