import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchPublicProfile = vi.fn();
vi.mock("@/api/profile", () => ({
  fetchPublicProfile: (id: string) => fetchPublicProfile(id),
}));

import { ApiError } from "@/api/client";
import { resolvePeer, getCachedPeer, __resetPeerCache } from "./peerResolve";

describe("peerResolve", () => {
  beforeEach(() => {
    __resetPeerCache();
    fetchPublicProfile.mockReset();
  });

  it("resolves a peer's display name (nickname over username)", async () => {
    fetchPublicProfile.mockResolvedValue({ username: "bob", nickname: "Bobby", is_online: true });
    const peer = await resolvePeer("u1");
    expect(peer).toEqual({ name: "Bobby", username: "bob", online: true });
  });

  it("caches the result and does not refetch", async () => {
    fetchPublicProfile.mockResolvedValue({ username: "bob", nickname: "Bobby", is_online: false });
    await resolvePeer("u1");
    await resolvePeer("u1");
    expect(fetchPublicProfile).toHaveBeenCalledTimes(1);
    expect(getCachedPeer("u1")).toEqual({ name: "Bobby", username: "bob", online: false });
  });

  it("dedupes concurrent in-flight requests for the same user", async () => {
    fetchPublicProfile.mockResolvedValue({ username: "bob", nickname: "", is_online: true });
    await Promise.all([resolvePeer("u2"), resolvePeer("u2"), resolvePeer("u2")]);
    expect(fetchPublicProfile).toHaveBeenCalledTimes(1);
  });

  it("negative-caches a 404 and never re-fetches a missing user", async () => {
    fetchPublicProfile.mockRejectedValue(new ApiError("not found", 404, "NOT_FOUND"));
    expect(await resolvePeer("u404")).toBeNull();
    expect(await resolvePeer("u404")).toBeNull();
    expect(fetchPublicProfile).toHaveBeenCalledTimes(1);
    expect(getCachedPeer("u404")).toBeNull();
  });

  it("returns null on a transient failure and stays retryable (no poison)", async () => {
    fetchPublicProfile.mockRejectedValue(new Error("network"));
    expect(await resolvePeer("u3")).toBeNull();
    // Not negative-cached → a later attempt may still succeed.
    expect(fetchPublicProfile).toHaveBeenCalledTimes(1);
    fetchPublicProfile.mockResolvedValue({ username: "x", nickname: "X", is_online: true });
    expect(await resolvePeer("u3")).toEqual({ name: "X", username: "x", online: true });
    expect(fetchPublicProfile).toHaveBeenCalledTimes(2);
  });

  it("never falls back to the current user (returns null, caller keeps placeholder)", async () => {
    fetchPublicProfile.mockRejectedValue(new Error("blocked"));
    const peer = await resolvePeer("u4");
    expect(peer).toBeNull();
  });
});
