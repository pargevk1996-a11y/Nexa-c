import { describe, expect, it } from "vitest";
import { isScreenshotKey } from "./privacySeal";

// Stand-in for KeyboardEvent — isScreenshotKey reads key/code/keyCode + modifiers.
// (Runs in vitest's node env, so navigator is non-Windows → Game Bar branch off.)
function ev(
  fields: Partial<
    Pick<KeyboardEvent, "key" | "code" | "keyCode" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">
  >,
): KeyboardEvent {
  return {
    key: "",
    code: "",
    keyCode: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...fields,
  } as KeyboardEvent;
}

describe("isScreenshotKey — PrintScreen family", () => {
  it("matches every reported form", () => {
    expect(isScreenshotKey(ev({ code: "PrintScreen" }))).toBe(true);
    expect(isScreenshotKey(ev({ key: "PrintScreen" }))).toBe(true);
    expect(isScreenshotKey(ev({ keyCode: 44 }))).toBe(true);
    expect(isScreenshotKey(ev({ key: "Snapshot" }))).toBe(true);
    expect(isScreenshotKey(ev({ key: "Print" }))).toBe(true);
    expect(isScreenshotKey(ev({ code: "F13" }))).toBe(true);
    // Alt+PrintScreen (active window), Shift/Ctrl+PrintScreen (Linux area/clipboard)
    expect(isScreenshotKey(ev({ code: "PrintScreen", altKey: true }))).toBe(true);
    expect(isScreenshotKey(ev({ keyCode: 44, ctrlKey: true, shiftKey: true }))).toBe(true);
  });
});

describe("isScreenshotKey — macOS Cmd+Shift+3/4/5/6", () => {
  it("matches the capture digits", () => {
    for (const d of ["3", "4", "5", "6"]) {
      expect(isScreenshotKey(ev({ key: d, metaKey: true, shiftKey: true }))).toBe(true);
    }
    // +Ctrl (copies to clipboard) still matches
    expect(isScreenshotKey(ev({ key: "4", metaKey: true, shiftKey: true, ctrlKey: true }))).toBe(true);
  });
});

describe("isScreenshotKey — snip + print", () => {
  it("matches Win/Cmd/Meta+Shift+S and Ctrl/Cmd+P", () => {
    expect(isScreenshotKey(ev({ key: "S", metaKey: true, shiftKey: true }))).toBe(true);
    expect(isScreenshotKey(ev({ key: "p", ctrlKey: true }))).toBe(true);
    expect(isScreenshotKey(ev({ key: "P", metaKey: true }))).toBe(true);
  });
});

describe("isScreenshotKey — no false positives", () => {
  it("ignores plain typing and unrelated shortcuts", () => {
    expect(isScreenshotKey(ev({ key: "s" }))).toBe(false);
    expect(isScreenshotKey(ev({ key: "3" }))).toBe(false);
    expect(isScreenshotKey(ev({ key: "4", shiftKey: true }))).toBe(false); // just "$"
    expect(isScreenshotKey(ev({ key: "c", metaKey: true }))).toBe(false); // Cmd+C
    expect(isScreenshotKey(ev({ key: "g", metaKey: true }))).toBe(false); // Cmd+G (non-Windows)
    expect(isScreenshotKey(ev({ key: "a", ctrlKey: true }))).toBe(false);
    expect(isScreenshotKey(ev({ key: "Enter" }))).toBe(false);
  });
});
