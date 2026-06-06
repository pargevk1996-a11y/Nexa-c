type Fn = () => void;

let screenshotCb: Fn | null = null;
let awayCb: Fn | null = null;

export function setScreenshotCb(fn: Fn | null): void { screenshotCb = fn; }
export function setAwayCb(fn: Fn | null): void { awayCb = fn; }
export function dispatchScreenshot(): void { screenshotCb?.(); }
export function dispatchAway(): void { awayCb?.(); }
