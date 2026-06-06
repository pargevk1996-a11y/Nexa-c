import { tryUnsealContent } from "./privacySeal";

/** Runtime screenshot / capture policy (default: blocked). */

let allowScreenshots = false;

export function isScreenshotAllowed(): boolean {
  return allowScreenshots;
}

export function setScreenshotAllowed(allowed: boolean): void {
  allowScreenshots = allowed;
  applyScreenCaptureMeta(allowed);
  if (allowed) tryUnsealContent();
}

function applyScreenCaptureMeta(allowed: boolean): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[http-equiv="ScreenCapture"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.httpEquiv = "ScreenCapture";
    document.head.appendChild(meta);
  }
  meta.content = allowed ? "allow" : "deny";
}
