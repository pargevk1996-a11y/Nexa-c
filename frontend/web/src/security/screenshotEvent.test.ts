import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addScreenshotListener,
  dispatchScreenshot,
  setScreenshotCb,
} from "./screenshotEvent";

describe("screenshotEvent", () => {
  afterEach(() => {
    setScreenshotCb(null);
  });

  it("invokes the legacy single-slot callback", () => {
    const cb = vi.fn();
    setScreenshotCb(cb);
    dispatchScreenshot("key");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("delivers the vector to every subscribed listener", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = addScreenshotListener(a);
    const offB = addScreenshotListener(b);

    dispatchScreenshot("print");

    expect(a).toHaveBeenCalledWith("print");
    expect(b).toHaveBeenCalledWith("print");
    offA();
    offB();
  });

  it("defaults the vector to 'unknown'", () => {
    const listener = vi.fn();
    const off = addScreenshotListener(listener);
    dispatchScreenshot();
    expect(listener).toHaveBeenCalledWith("unknown");
    off();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const off = addScreenshotListener(listener);
    off();
    dispatchScreenshot("copy");
    expect(listener).not.toHaveBeenCalled();
  });

  it("isolates a throwing listener so others still fire", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    const offBad = addScreenshotListener(bad);
    const offGood = addScreenshotListener(good);

    expect(() => dispatchScreenshot("key")).not.toThrow();
    expect(good).toHaveBeenCalledWith("key");
    offBad();
    offGood();
  });
});
