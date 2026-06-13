import { useEffect, useRef } from "react";

interface RemoteAudioPlaybackProps {
  /** Remote participant streams keyed by user id. */
  streams: Map<string, MediaStream>;
  /**
   * When true, route output to the loudspeaker and boost the gain
   * ("speakerphone"). When false, play at normal level on the default device.
   */
  speakerOn: boolean;
}

const NORMAL_GAIN = 1;
const SPEAKER_GAIN = 1.8;

type StreamNodes = {
  /** Hidden, muted element — required so Chrome actually pulls the WebRTC track. */
  el: HTMLAudioElement;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
};

/**
 * Always-on playback sink for remote call audio.
 *
 * Remote audio used to ride on the call's <video> tiles, which meant
 * audio-only calls (and video calls with the camera off) produced no sound at
 * all. This component renders a dedicated, hidden sink for every remote stream
 * so audio plays regardless of call type, and centralises the speakerphone
 * (loudness + output-device) control.
 */
export function RemoteAudioPlayback({ streams, speakerOn }: RemoteAudioPlaybackProps) {
  const ctxRef = useRef<AudioContext | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const nodesRef = useRef<Map<string, StreamNodes>>(new Map());
  const speakerSinkRef = useRef<string | null>(null);

  // Lazily create the shared AudioContext + a limiter that tames clipping when
  // the gain is boosted for speakerphone.
  function ensureContext(): { ctx: AudioContext; limiter: DynamicsCompressorNode } {
    if (!ctxRef.current) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      limiter.connect(ctx.destination);
      ctxRef.current = ctx;
      limiterRef.current = limiter;
    }
    return { ctx: ctxRef.current, limiter: limiterRef.current! };
  }

  // Resolve a loudspeaker output device once, used by setSinkId when available.
  async function resolveSpeakerSink(): Promise<string | null> {
    if (speakerSinkRef.current !== null) return speakerSinkRef.current;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      const speaker =
        outputs.find((d) => /speaker|loud|громк/i.test(d.label)) ??
        outputs.find((d) => d.deviceId === "default") ??
        outputs[0];
      speakerSinkRef.current = speaker?.deviceId ?? "";
    } catch {
      speakerSinkRef.current = "";
    }
    return speakerSinkRef.current;
  }

  // Sync the set of playback nodes with the current remote streams.
  useEffect(() => {
    const { ctx, limiter } = ensureContext();
    void ctx.resume().catch(() => undefined);
    const nodes = nodesRef.current;

    // Remove nodes for streams that have left the call.
    for (const [userId, entry] of nodes) {
      if (!streams.has(userId)) {
        entry.source.disconnect();
        entry.gain.disconnect();
        entry.el.srcObject = null;
        entry.el.remove();
        nodes.delete(userId);
      }
    }

    // Add nodes for new streams.
    for (const [userId, stream] of streams) {
      if (nodes.has(userId)) continue;
      const el = document.createElement("audio");
      el.autoplay = true;
      el.muted = true; // audible path is Web Audio; element only keeps the track flowing
      el.srcObject = stream;
      void el.play().catch(() => undefined);

      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = speakerOn ? SPEAKER_GAIN : NORMAL_GAIN;
      source.connect(gain);
      gain.connect(limiter);
      nodes.set(userId, { el, source, gain });
    }
  }, [streams, speakerOn]);

  // Apply speakerphone state: gain boost + output device routing.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (ctx) void ctx.resume().catch(() => undefined);

    for (const entry of nodesRef.current.values()) {
      entry.gain.gain.value = speakerOn ? SPEAKER_GAIN : NORMAL_GAIN;
    }

    void (async () => {
      const sink = speakerOn ? await resolveSpeakerSink() : "";
      // Route the AudioContext output when supported (Chrome 110+).
      const ctxWithSink = ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
      if (ctxWithSink?.setSinkId) {
        await ctxWithSink.setSinkId(sink ?? "").catch(() => undefined);
      }
    })();
  }, [speakerOn]);

  // Tear everything down when the call ends.
  useEffect(() => {
    return () => {
      for (const entry of nodesRef.current.values()) {
        entry.source.disconnect();
        entry.gain.disconnect();
        entry.el.srcObject = null;
        entry.el.remove();
      }
      nodesRef.current.clear();
      void ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
      limiterRef.current = null;
    };
  }, []);

  return null;
}
