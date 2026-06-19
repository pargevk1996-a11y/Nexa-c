/**
 * Incoming-call ringtone — synthesized standard dual-tone ring (WebAudio).
 *
 * The web cannot trigger the OS "system ringtone" (no browser API exposes it),
 * so we synthesize the classic telephone ring: two sine tones (440+480 Hz,
 * the standard ringback pair) in a 2s-on / 2s-off cadence, looping until
 * stopped. No asset download, works offline, same on every OS/browser.
 *
 * Autoplay policy: an AudioContext only produces sound after the user has
 * interacted with the page at least once. We resume() if suspended; if the
 * browser still refuses, we fail silently (the visual banner remains).
 */

let ctx: AudioContext | null = null;
let stopCurrent: (() => void) | null = null;

/**
 * Custom incoming-call melody. Drop a licensed audio file at
 * `frontend/web/public/ringtone.mp3` (served from the site root as
 * `/ringtone.mp3`). We loop only the chosen segment; if the file is missing
 * or autoplay is blocked we fall back to the synthesized ring below.
 *
 * NOTE: the melody itself must be properly licensed for in-product use — the
 * repo ships without an audio asset on purpose.
 */
const RINGTONE_SRC = "/ringtone.mp3";
const RINGTONE_LOOP_START = 22; // seconds
const RINGTONE_LOOP_END = 48; // seconds
let ringtoneEl: HTMLAudioElement | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Start the looping ring. Idempotent — calling again keeps the current ring.
 *  Prefers the custom melody (looped segment); falls back to the synth ring. */
export function startRingtone(): void {
  if (stopCurrent || ringtoneEl) return;

  const el = new Audio(RINGTONE_SRC);
  el.preload = "auto";
  el.loop = false; // we loop a sub-segment manually, not the whole track

  const seekToStart = () => {
    try {
      el.currentTime = RINGTONE_LOOP_START;
    } catch {
      /* metadata not ready yet — the next event will retry */
    }
  };
  el.addEventListener("loadedmetadata", seekToStart, { once: true });
  el.addEventListener("timeupdate", () => {
    if (el.currentTime >= RINGTONE_LOOP_END || el.currentTime < RINGTONE_LOOP_START) {
      seekToStart();
    }
  });

  ringtoneEl = el;
  void el.play().catch(() => {
    // File missing / autoplay blocked → synthesized ring instead.
    ringtoneEl = null;
    startSynthRingtone();
  });
}

/** Synthesized dual-tone ring — the fallback when no melody file is present. */
function startSynthRingtone(): void {
  if (stopCurrent) return;
  const ac = getCtx();
  if (!ac) return;

  const master = ac.createGain();
  master.gain.value = 0.12;
  master.connect(ac.destination);

  const osc1 = ac.createOscillator();
  const osc2 = ac.createOscillator();
  osc1.frequency.value = 440;
  osc2.frequency.value = 480;

  // Cadence gate: 2s ring, 2s silence, repeating.
  const gate = ac.createGain();
  gate.gain.value = 0;
  osc1.connect(gate);
  osc2.connect(gate);
  gate.connect(master);

  let cancelled = false;
  const scheduleCadence = () => {
    if (cancelled) return;
    const t = ac.currentTime;
    gate.gain.setValueAtTime(0, t);
    gate.gain.linearRampToValueAtTime(1, t + 0.02);
    gate.gain.setValueAtTime(1, t + 2);
    gate.gain.linearRampToValueAtTime(0, t + 2.05);
  };
  scheduleCadence();
  const interval = window.setInterval(scheduleCadence, 4000);

  osc1.start();
  osc2.start();

  stopCurrent = () => {
    cancelled = true;
    window.clearInterval(interval);
    try {
      osc1.stop();
      osc2.stop();
      master.disconnect();
    } catch {
      /* already stopped */
    }
    stopCurrent = null;
  };
}

/** Stop the ring (accept / decline / caller hung up). Safe to call repeatedly. */
export function stopRingtone(): void {
  if (ringtoneEl) {
    try {
      ringtoneEl.pause();
    } catch {
      /* already stopped */
    }
    ringtoneEl.src = "";
    ringtoneEl = null;
  }
  stopCurrent?.();
}

/* ------------------------------------------------------------------------- */
/* Ringback ("гудок") — what the CALLER hears while waiting for an answer.    */
/* Single 425 Hz tone, ~1s on / 4s off (European/RU cadence). Stops the      */
/* moment the callee picks up so the caller never hears the remote room       */
/* before the call connects.                                                  */
/* ------------------------------------------------------------------------- */

let stopRingbackCurrent: (() => void) | null = null;

/** Start the looping ringback tone. Idempotent. */
export function startRingback(): void {
  if (stopRingbackCurrent) return;
  const ac = getCtx();
  if (!ac) return;

  const master = ac.createGain();
  master.gain.value = 0.1;
  master.connect(ac.destination);

  const osc = ac.createOscillator();
  osc.frequency.value = 425;

  const gate = ac.createGain();
  gate.gain.value = 0;
  osc.connect(gate);
  gate.connect(master);

  let cancelled = false;
  const scheduleCadence = () => {
    if (cancelled) return;
    const t = ac.currentTime;
    gate.gain.setValueAtTime(0, t);
    gate.gain.linearRampToValueAtTime(1, t + 0.02);
    gate.gain.setValueAtTime(1, t + 1);
    gate.gain.linearRampToValueAtTime(0, t + 1.05);
  };
  scheduleCadence();
  const interval = window.setInterval(scheduleCadence, 5000);

  osc.start();

  stopRingbackCurrent = () => {
    cancelled = true;
    window.clearInterval(interval);
    try {
      osc.stop();
      master.disconnect();
    } catch {
      /* already stopped */
    }
    stopRingbackCurrent = null;
  };
}

/** Stop the ringback (answered / call ended). Safe to call repeatedly. */
export function stopRingback(): void {
  stopRingbackCurrent?.();
}
