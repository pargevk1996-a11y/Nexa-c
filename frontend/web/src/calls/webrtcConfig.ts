import type { CallType } from "@/api/calls";
import type { IceServer } from "@/api/calls";
import { getIceConfig } from "@/api/calls";

export const AUDIO_CONSTRAINTS: MediaTrackConstraints & { latency?: number } = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
  /** Low-latency capture hint (browser may ignore). */
  latency: 0,
};

export const VIDEO_BITRATE_TIERS = [2_500_000, 1_500_000, 800_000, 400_000] as const;
export const VIDEO_SCALE_FACTORS = [1, 1.5, 2, 3] as const;

export const QUALITY_LABELS = ["HD", "SD", "Low", "Min"] as const;

const DEFAULT_STUN: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function getDefaultIceServers(): RTCIceServer[] {
  const fromEnv = iceServersFromViteEnv();
  return fromEnv.length ? fromEnv : DEFAULT_STUN;
}

/**
 * `VITE_ICE_SERVERS`: JSON array of `{ urls, username?, credential? }`
 * or comma-separated STUN/TURN URLs (e.g. `stun:host:3478,turn:host:3478?transport=udp`).
 */
export function iceServersFromViteEnv(): RTCIceServer[] {
  const raw = import.meta.env.VITE_ICE_SERVERS as string | undefined;
  if (!raw?.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as RTCIceServer[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return trimmed
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
    .map((urls) => ({ urls }));
}

export function buildMediaConstraints(callType: CallType): MediaStreamConstraints {
  return {
    audio: AUDIO_CONSTRAINTS,
    video:
      callType === "video"
        ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 },
          }
        : false,
  };
}

export function toRtcIceServers(servers: IceServer[]): RTCIceServer[] {
  return servers.map((s) => ({
    urls: s.urls,
    username: s.username,
    credential: s.credential,
  }));
}

/** API ICE config with VITE_ICE_SERVERS override and STUN fallback. */
export async function resolveIceServers(): Promise<RTCIceServer[]> {
  const env = iceServersFromViteEnv();
  if (env.length) return env;
  try {
    const cfg = await getIceConfig();
    const api = toRtcIceServers(cfg.ice_servers);
    return api.length ? api : DEFAULT_STUN;
  } catch {
    return DEFAULT_STUN;
  }
}

/** Adaptive bitrate caps per call type and tier (bps). */
export function applySendBitrate(
  pc: RTCPeerConnection,
  callType: CallType,
  tierIndex = 0,
): void {
  const idx = Math.min(Math.max(0, tierIndex), VIDEO_BITRATE_TIERS.length - 1);
  const maxVideo = callType === "video" ? VIDEO_BITRATE_TIERS[idx] : 0;
  const scale = callType === "video" ? VIDEO_SCALE_FACTORS[idx] : 1;
  const maxAudio = 128_000;
  for (const sender of pc.getSenders()) {
    if (!sender.track) continue;
    void (async () => {
      const params = sender.getParameters();
      if (!params.encodings?.length) {
        params.encodings = [{}];
      }
      for (const enc of params.encodings) {
        if (sender.track?.kind === "video" && maxVideo) {
          enc.maxBitrate = maxVideo;
          enc.scaleResolutionDownBy = scale;
          (enc as RTCRtpEncodingParameters & { degradationPreference?: string }).degradationPreference =
            "maintain-framerate";
        }
        if (sender.track?.kind === "audio") {
          enc.maxBitrate = maxAudio;
        }
      }
      await sender.setParameters(params);
    })();
  }
}

export async function monitorAdaptiveBitrate(
  pc: RTCPeerConnection,
  callType: CallType,
  getTier: () => number,
  onTierChange: (tier: number) => void,
): Promise<() => void> {
  if (callType !== "video") return () => undefined;
  let lossStreak = 0;
  let stableStreak = 0;
  const interval = window.setInterval(async () => {
    const stats = await pc.getStats();
    let lossRatio = 0;
    stats.forEach((report) => {
      if (report.type === "outbound-rtp" && report.kind === "video") {
        const packetsLost = report.packetsLost ?? 0;
        const packetsSent = report.packetsSent ?? 1;
        lossRatio = packetsLost / packetsSent;
      }
    });
    if (lossRatio > 0.08) {
      lossStreak += 1;
      stableStreak = 0;
      if (lossStreak >= 2) {
        const current = getTier();
        const next = Math.min(current + 1, VIDEO_BITRATE_TIERS.length - 1);
        if (next !== current) {
          applySendBitrate(pc, callType, next);
          onTierChange(next);
        }
        lossStreak = 0;
      }
    } else if (lossRatio < 0.02) {
      stableStreak += 1;
      if (stableStreak >= 4) {
        const current = getTier();
        if (current > 0) {
          const next = current - 1;
          applySendBitrate(pc, callType, next);
          onTierChange(next);
        }
        stableStreak = 0;
      }
    } else {
      lossStreak = 0;
    }
  }, 4000);
  return () => window.clearInterval(interval);
}
