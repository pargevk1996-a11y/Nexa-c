import { describe, expect, it, vi, afterEach } from "vitest";
import { formatLastSeen, presenceLine, displayName } from "./presenceText";

describe("formatLastSeen", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns recently when iso is null", () => {
    expect(formatLastSeen(null)).toBe("Last seen recently");
  });

  it("returns just now for recent timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T12:00:00Z"));
    const iso = new Date("2026-05-25T11:59:30Z").toISOString();
    expect(formatLastSeen(iso)).toBe("Last seen just now");
  });
});

describe("presenceLine", () => {
  it("shows online status when user is online", () => {
    expect(presenceLine({ is_online: true, status_text: "In a meeting" })).toBe("In a meeting");
  });

  it("falls back to Online without custom status", () => {
    expect(presenceLine({ is_online: true })).toBe("Online");
  });
});

describe("displayName", () => {
  it("prefers nickname over username", () => {
    expect(displayName({ username: "alice", nickname: " Ali " })).toBe("Ali");
  });
});
