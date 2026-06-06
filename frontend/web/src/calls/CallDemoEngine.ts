import type { CallType } from "@/api/calls";
import {
  applySendBitrate,
  buildMediaConstraints,
  getDefaultIceServers,
  monitorAdaptiveBitrate,
  resolveIceServers,
} from "./webrtcConfig";

const DEMO_GROUP_LABELS: Record<string, string> = {
  u1: "Sam",
  u2: "Jordan",
  u3: "Riley",
};

/** Local preview + mock/canvas remotes for demo mode (no signaling backend). */
export class CallDemoEngine {
  private localStream: MediaStream | null = null;
  private remoteStreams = new Map<string, MediaStream>();
  private mockCleanups: Array<() => void> = [];
  private loopbackPc: RTCPeerConnection | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  private callType: CallType = "audio";
  private qualityTier = 0;
  private iceServers: RTCIceServer[] = getDefaultIceServers();
  private statsCleanups: Array<() => void> = [];

  private onRemoteStream?: (userId: string, stream: MediaStream) => void;
  private onStateChange?: () => void;
  private onQualityTierChange?: (tier: number) => void;

  setHandlers(handlers: {
    onRemoteStream?: (userId: string, stream: MediaStream) => void;
    onStateChange?: () => void;
    onQualityTierChange?: (tier: number) => void;
  }) {
    this.onRemoteStream = handlers.onRemoteStream;
    this.onStateChange = handlers.onStateChange;
    this.onQualityTierChange = handlers.onQualityTierChange;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getQualityTier(): number {
    return this.qualityTier;
  }

  isScreenSharing(): boolean {
    return this.screenTrack !== null;
  }

  async start(
    participantIds: string[],
    callType: CallType,
    participantLabels: Record<string, string>,
  ): Promise<void> {
    await this.cleanup();
    this.callType = callType;
    this.qualityTier = 0;
    this.iceServers = await resolveIceServers();
    this.localStream = await navigator.mediaDevices.getUserMedia(buildMediaConstraints(callType));

    const labels = { ...participantLabels };
    for (const id of participantIds) {
      if (!labels[id]) labels[id] = DEMO_GROUP_LABELS[id] ?? id.slice(0, 8);
    }

    if (participantIds.length === 1 && callType === "video") {
      await this.attachLoopbackRemote(participantIds[0]);
    } else {
      for (const id of participantIds) {
        this.addMockRemote(id, labels[id] ?? id);
      }
    }

    if (callType === "video" && this.loopbackPc) {
      const stop = await monitorAdaptiveBitrate(
        this.loopbackPc,
        callType,
        () => this.qualityTier,
        (tier) => {
          this.qualityTier = tier;
          if (this.loopbackPc) applySendBitrate(this.loopbackPc, callType, tier);
          this.onQualityTierChange?.(tier);
          this.onStateChange?.();
        },
      );
      this.statsCleanups.push(stop);
    }

    this.onStateChange?.();
  }

  private async attachLoopbackRemote(peerId: string): Promise<void> {
    const pc1 = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: "max-bundle" });
    const pc2 = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: "max-bundle" });
    this.loopbackPc = pc1;

    pc1.onicecandidate = (e) => {
      if (e.candidate) void pc2.addIceCandidate(e.candidate);
    };
    pc2.onicecandidate = (e) => {
      if (e.candidate) void pc1.addIceCandidate(e.candidate);
    };
    pc2.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.remoteStreams.set(peerId, stream);
      this.onRemoteStream?.(peerId, stream);
    };

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc1.addTrack(track, this.localStream);
      }
    }

    const offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);
    await pc2.setRemoteDescription(offer);
    const answer = await pc2.createAnswer();
    await pc2.setLocalDescription(answer);
    await pc1.setRemoteDescription(answer);
    applySendBitrate(pc1, this.callType, this.qualityTier);

    this.mockCleanups.push(() => {
      pc1.close();
      pc2.close();
    });
  }

  private addMockRemote(peerId: string, label: string): void {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const hue = (peerId.charCodeAt(0) * 47) % 360;
    let frame = 0;
    const draw = () => {
      frame += 1;
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, `hsl(${hue}, 55%, 28%)`);
      grad.addColorStop(1, `hsl(${(hue + 40 + frame) % 360}, 60%, 42%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "bold 28px system-ui, sans-serif";
      ctx.fillText(label, 28, 52);
      ctx.font = "16px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText("Demo participant", 28, 82);
    };
    draw();
    const timer = window.setInterval(draw, 1000 / 12);
    const stream = canvas.captureStream(12);
    this.remoteStreams.set(peerId, stream);
    this.onRemoteStream?.(peerId, stream);
    this.mockCleanups.push(() => {
      window.clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
    });
  }

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  applyMicState(opts: { muted: boolean; pushToTalk: boolean; transmitting: boolean }): void {
    const effective = opts.pushToTalk ? !opts.transmitting : opts.muted;
    this.setMuted(effective);
  }

  setVideoEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }

  async startScreenShare(): Promise<void> {
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const track = screen.getVideoTracks()[0];
    if (!track) return;
    this.screenTrack = track;
    const old = this.localStream?.getVideoTracks()[0];
    if (old) {
      this.localStream?.removeTrack(old);
      old.stop();
    }
    this.localStream?.addTrack(track);
    track.onended = () => void this.stopScreenShare();
    this.onStateChange?.();
  }

  async stopScreenShare(): Promise<void> {
    if (!this.screenTrack) return;
    this.screenTrack.stop();
    this.screenTrack = null;
    if (this.callType === "video" && this.localStream) {
      const stream = await navigator.mediaDevices.getUserMedia(buildMediaConstraints("video"));
      const cam = stream.getVideoTracks()[0];
      if (cam) {
        const old = this.localStream.getVideoTracks()[0];
        if (old) {
          this.localStream.removeTrack(old);
          old.stop();
        }
        this.localStream.addTrack(cam);
        stream.getAudioTracks().forEach((t) => t.stop());
      }
    }
    this.onStateChange?.();
  }

  async switchCamera(): Promise<void> {
    if (this.screenTrack || this.callType !== "video" || !this.localStream) return;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "videoinput",
    );
    if (devices.length < 2) return;
    const idx = devices.findIndex((d) => d.deviceId === this.localStream?.getVideoTracks()[0]?.getSettings().deviceId);
    const next = devices[(idx + 1) % devices.length];
    const baseVideo = buildMediaConstraints("video").video;
    const video =
      typeof baseVideo === "object" && baseVideo !== null
        ? { ...baseVideo, deviceId: { exact: next.deviceId } }
        : { deviceId: { exact: next.deviceId } };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    const newTrack = stream.getVideoTracks()[0];
    if (!newTrack) return;
    const old = this.localStream.getVideoTracks()[0];
    if (old) {
      this.localStream.removeTrack(old);
      old.stop();
    }
    this.localStream.addTrack(newTrack);
    this.onStateChange?.();
  }

  async cleanup(): Promise<void> {
    for (const stop of this.statsCleanups) stop();
    this.statsCleanups = [];
    for (const stop of this.mockCleanups) stop();
    this.mockCleanups = [];
    this.loopbackPc?.close();
    this.loopbackPc = null;
    this.remoteStreams.clear();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.screenTrack?.stop();
    this.localStream = null;
    this.screenTrack = null;
    this.qualityTier = 0;
    this.onStateChange?.();
  }
}

export const callDemoEngine = new CallDemoEngine();
