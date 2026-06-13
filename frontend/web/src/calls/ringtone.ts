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

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Start the looping ring. Idempotent — calling again keeps the current ring. */
export function startRingtone(): void {
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
  stopCurrent?.();
}
