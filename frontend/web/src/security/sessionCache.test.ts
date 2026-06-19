import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "@/types";

// The decrypt boundary. getSecureItem returns null BOTH when no session blob is
// stored AND when an existing blob can't be decrypted right now (transient:
// device key not ready / regenerated). The cache must tell these apart.
const getSecureItem = vi.fn();
vi.mock("./secureStorage", () => ({
  getSecureItem: (...args: unknown[]) => getSecureItem(...args),
  setSecureItem: vi.fn(),
  removeSecureItem: vi.fn(),
  wipeLocalSecurityState: vi.fn(),
}));
vi.mock("./deviceKey", () => ({ getOrCreateDeviceBaseKey: vi.fn() }));

import { getCachedSession, refreshSessionCache } from "./sessionCache";

const ACTIVE_UID_KEY = "securechat_active_uid_v1";
const SESSION_KEY = "securechat_session_v1";

function makeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

const SESSION: AuthSession = {
  user: { id: "u-1" } as AuthSession["user"],
  expiresIn: 900,
  demoMode: false,
};

beforeEach(() => {
  (globalThis as { localStorage: unknown }).localStorage = makeLocalStorage();
  getSecureItem.mockReset();
});

describe("refreshSessionCache resilience", () => {
  it("returns null when genuinely signed out (no active uid)", async () => {
    expect(await refreshSessionCache()).toBeNull();
    expect(getCachedSession()).toBeNull();
  });

  it("restores and caches the session when the blob decrypts", async () => {
    localStorage.setItem(ACTIVE_UID_KEY, "u-1");
    localStorage.setItem(SESSION_KEY, "<encrypted-blob>");
    getSecureItem.mockResolvedValueOnce(SESSION);

    expect(await refreshSessionCache()).toEqual(SESSION);
    expect(getCachedSession()).toEqual(SESSION);
    expect(localStorage.getItem(ACTIVE_UID_KEY)).toBe("u-1");
  });

  it("does NOT wipe the session on a transient decrypt failure (blob present)", async () => {
    localStorage.setItem(ACTIVE_UID_KEY, "u-1");
    localStorage.setItem(SESSION_KEY, "<encrypted-blob>");

    // Prime: first read succeeds.
    getSecureItem.mockResolvedValueOnce(SESSION);
    await refreshSessionCache();

    // Transient: the blob is still present but can't be decrypted right now.
    getSecureItem.mockResolvedValueOnce(null);
    const result = await refreshSessionCache();

    // The user must stay logged in: keep last-known session + active-uid pointer.
    expect(result).toEqual(SESSION);
    expect(getCachedSession()).toEqual(SESSION);
    expect(localStorage.getItem(ACTIVE_UID_KEY)).toBe("u-1");
  });

  it("clears the session only when the blob is genuinely absent", async () => {
    localStorage.setItem(ACTIVE_UID_KEY, "u-1");
    // No SESSION_KEY blob in storage → truly signed out / storage cleared.
    getSecureItem.mockResolvedValueOnce(null);

    expect(await refreshSessionCache()).toBeNull();
    expect(getCachedSession()).toBeNull();
    expect(localStorage.getItem(ACTIVE_UID_KEY)).toBeNull();
  });
});
