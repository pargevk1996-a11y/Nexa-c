/**
 * Runtime screenshot / capture policy.
 *
 * Users consent during registration to having all screenshot capabilities
 * disabled. This policy is permanently blocked — setScreenshotAllowed(true)
 * is a no-op; no UI path can lift protection after consent is given.
 */

export function isScreenshotAllowed(): boolean {
  return false;
}

// No-op: consent is irrevocable.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setScreenshotAllowed(_allowed: boolean): void {
  applyScreenCaptureMeta();
}

function applyScreenCaptureMeta(): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[http-equiv="ScreenCapture"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.httpEquiv = "ScreenCapture";
    document.head.appendChild(meta);
  }
  meta.content = "deny";
}
