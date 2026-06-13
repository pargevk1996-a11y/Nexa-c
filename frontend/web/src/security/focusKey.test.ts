import { describe, expect, it } from "vitest";
import { isFocusChangingKey } from "./privacySeal";

// Minimal KeyboardEvent stand-in — isFocusChangingKey only reads key + modifiers.
function key(
  k: string,
  mods: Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">> = {},
): KeyboardEvent {
  return {
    key: k,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
  } as KeyboardEvent;
}

describe("isFocusChangingKey", () => {
  it("flags OS/app switchers", () => {
    expect(isFocusChangingKey(key("Tab", { altKey: true }))).toBe(true); // Alt+Tab
    expect(isFocusChangingKey(key("Tab", { metaKey: true }))).toBe(true); // Cmd+Tab
    expect(isFocusChangingKey(key("`", { metaKey: true }))).toBe(true); // Cmd+`
    expect(isFocusChangingKey(key("Tab", { ctrlKey: true }))).toBe(true); // Ctrl+Tab
  });

  it("flags tab/window/address-bar shortcuts", () => {
    expect(isFocusChangingKey(key("t", { ctrlKey: true }))).toBe(true); // new tab
    expect(isFocusChangingKey(key("w", { metaKey: true }))).toBe(true); // close tab
    expect(isFocusChangingKey(key("n", { ctrlKey: true }))).toBe(true); // new window
    expect(isFocusChangingKey(key("l", { metaKey: true }))).toBe(true); // address bar
    expect(isFocusChangingKey(key("F6"))).toBe(true);
    expect(isFocusChangingKey(key("d", { altKey: true }))).toBe(true);
  });

  it("does NOT flag ordinary editing/typing (no false-positive blackout)", () => {
    expect(isFocusChangingKey(key("c", { metaKey: true }))).toBe(false); // Cmd+C
    expect(isFocusChangingKey(key("v", { ctrlKey: true }))).toBe(false); // Ctrl+V
    expect(isFocusChangingKey(key("Meta"))).toBe(false); // bare Cmd/Win
    expect(isFocusChangingKey(key("a"))).toBe(false);
    expect(isFocusChangingKey(key("Tab"))).toBe(false); // plain Tab = field nav
    expect(isFocusChangingKey(key("Enter"))).toBe(false);
  });
});
