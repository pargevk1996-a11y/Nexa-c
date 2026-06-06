import { useEffect } from "react";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function modKey(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

export interface ChatKeyboardShortcutHandlers {
  onFocusSearch: () => void;
  onFocusComposer: () => void;
  onOpenSettings: () => void;
  onEscape: () => void;
  onToggleProfile?: () => void;
}

/** Global chat shortcuts (Telegram / macOS style). */
export function useChatKeyboardShortcuts(
  enabled: boolean,
  handlers: ChatKeyboardShortcutHandlers,
): void {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;

      if (e.key === "Escape") {
        handlers.onEscape();
        return;
      }

      if (!modKey(e)) return;

      const key = e.key.toLowerCase();

      if (key === "k") {
        e.preventDefault();
        handlers.onFocusSearch();
        return;
      }

      if (key === "n") {
        e.preventDefault();
        handlers.onFocusComposer();
        return;
      }

      if (key === ",") {
        e.preventDefault();
        handlers.onOpenSettings();
        return;
      }

      if (key === "i" && handlers.onToggleProfile) {
        e.preventDefault();
        handlers.onToggleProfile();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, handlers]);
}

/** Focus in-chat search when open, otherwise the chat list search field. */
export function focusChatSearchInput(): void {
  const inChat = document.querySelector<HTMLInputElement>(
    ".message-search-panel__form input[type='search']",
  );
  if (inChat) {
    inChat.focus();
    inChat.select();
    return;
  }
  const list = document.querySelector<HTMLInputElement>(
    ".chat-left-panel__search input[type='search']",
  );
  list?.focus();
  list?.select();
}

export function focusChatComposer(): void {
  const el = document.querySelector<HTMLTextAreaElement>(
    ".chat-main .chat-composer textarea",
  );
  el?.focus();
}
