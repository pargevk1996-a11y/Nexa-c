import { beforeEach, describe, expect, it } from "vitest";
import { hasStoredSignature } from "./signaturePin";

// hasStoredSignature gates the lock screen's setup-vs-verify mode. It must report
// "a PIN exists" purely from the stored blob's PRESENCE, never from whether it
// decrypts — otherwise a transient decrypt failure flips the lock into setup
// mode and the first PIN typed overwrites the real one ("any PIN works once").

const SIGNATURE_KEY = (uid: string) => `securechat_signature_hash_v1_${uid}`;

function makeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

beforeEach(() => {
  (globalThis as { localStorage: unknown }).localStorage = makeLocalStorage();
});

describe("hasStoredSignature", () => {
  it("is false when no PIN blob is stored (genuine setup)", () => {
    expect(hasStoredSignature("u-1")).toBe(false);
  });

  it("is true whenever a blob exists — even an undecryptable one (verify, never overwrite)", () => {
    // A present-but-unreadable blob (e.g. device key not warm) must still count
    // as "PIN exists" so setup mode is NOT offered.
    localStorage.setItem(SIGNATURE_KEY("u-1"), '{"v":1,"iv":"x","ct":"unreadable"}');
    expect(hasStoredSignature("u-1")).toBe(true);
  });

  it("is scoped per user id", () => {
    localStorage.setItem(SIGNATURE_KEY("u-1"), "blob");
    expect(hasStoredSignature("u-1")).toBe(true);
    expect(hasStoredSignature("u-2")).toBe(false);
  });
});
