import { describe, expect, it } from "vitest";
import { collectGalleryImages } from "./ImageGallery";
import type { Message } from "@/types";

function img(overrides: Partial<Message>): Message {
  return {
    id: "m1",
    text: "",
    sentAt: "",
    outgoing: false,
    kind: "file",
    fileCategory: "image",
    ...overrides,
  } as Message;
}

describe("collectGalleryImages", () => {
  it("prefers full-resolution stream URL over the thumbnail", () => {
    const out = collectGalleryImages([
      img({ id: "a", streamUrl: "https://cdn/full.jpg", previewUrl: "https://cdn/thumb.jpg" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://cdn/full.jpg");
    expect(out[0].previewUrl).toBe("https://cdn/thumb.jpg");
  });

  it("keeps mediaId so the viewer can fetch a fresh full-res URL", () => {
    const out = collectGalleryImages([img({ id: "b", mediaId: "media-9", previewUrl: "t.jpg" })]);
    expect(out[0].mediaId).toBe("media-9");
    expect(out[0].url).toBeNull();
  });

  it("skips non-image, recalled and deleted messages", () => {
    const out = collectGalleryImages([
      img({ id: "c", fileCategory: "video", streamUrl: "v.mp4" }),
      img({ id: "d", streamUrl: "x.jpg", recalled: true }),
      img({ id: "e", streamUrl: "y.jpg", deleted: true }),
      img({ id: "f", streamUrl: "ok.jpg" }),
    ]);
    expect(out.map((g) => g.messageId)).toEqual(["f"]);
  });

  it("skips images with no usable source at all", () => {
    const out = collectGalleryImages([img({ id: "g", streamUrl: undefined, previewUrl: null })]);
    expect(out).toHaveLength(0);
  });
});
