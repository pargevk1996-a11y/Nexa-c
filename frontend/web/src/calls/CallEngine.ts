import {
  acceptCall as apiAccept,
  createCall,
  endCall as apiEnd,
  rejectCall as apiReject,
  sendCallSignal,
  type CallSession,
  type CallType,
} from "@/api/calls";
import { getCachedSession } from "@/security/sessionCache";
import {
  applySendBitrate,
  buildMediaConstraints,
  monitorAdaptiveBitrate,
  resolveIceServers,
} from "./webrtcConfig";

export type CallSignalHandler = (payload: Record<string, unknown>) => void;

export interface ActiveCallState {
  session: CallSession;
  displayName: string;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  muted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
}

export class CallEngine {
  private iceServers: RTCIceServer[] = [];
  private peers = new Map<string, RTCPeerConnection>();
  private localStream: MediaStream | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  private call: CallSession | null = null;
  private onRemoteStream?: (userId: string, stream: MediaStream) => void;
  private onStateChange?: () => void;
  private onQualityTierChange?: (tier: number) => void;
  private statsCleanups: Array<() => void> = [];
  private qualityTier = 0;
  private preferredFacing: "user" | "environment" = "user";
  private videoDeviceId: string | null = null;

  setHandlers(handlers: {
    onRemoteStream?: (userId: string, stream: MediaStream) => void;
    onStateChange?: () => void;
    onQualityTierChange?: (tier: number) => void;
  }) {
    this.onRemoteStream = handlers.onRemoteStream;
    this.onStateChange = handlers.onStateChange;
    this.onQualityTierChange = handlers.onQualityTierChange;
  }

  getQualityTier(): number {
    return this.qualityTier;
  }

  isScreenSharing(): boolean {
    return this.screenTrack !== null;
  }

  async initIce(): Promise<void> {
    this.iceServers = await resolveIceServers();
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getCall(): CallSession | null {
    return this.call;
  }

  async startOutgoing(
    participantIds: string[],
    callType: CallType,
    conversationId?: string,
  ): Promise<CallSession> {
    await this.initIce();
    this.qualityTier = 0;
    this.call = await createCall({
      call_type: callType,
      participant_ids: participantIds,
      conversation_id: conversationId,
    });
    await this.ensureLocalMedia(callType);
    const me = getCachedSession()?.user.id;
    for (const pid of this.call.participant_ids) {
      if (pid === me) continue;
      await this.initiatePeer(pid, true);
    }
    this.onStateChange?.();
    return this.call;
  }

  async acceptIncoming(call: CallSession, callType: CallType): Promise<void> {
    await this.initIce();
    this.qualityTier = 0;
    this.call = await apiAccept(call.id);
    await this.ensureLocalMedia(callType);
    this.onStateChange?.();
  }

  async attachIncomingCall(call: CallSession): Promise<void> {
    this.call = call;
  }

  async handleSignal(payload: Record<string, unknown>): Promise<void> {
    const from = String(payload.from_user_id ?? "");
    const signalType = String(payload.signal_type ?? "");
    if (!from || !this.call) return;

    if (signalType === "offer" && payload.sdp) {
      const pc = await this.ensurePeer(from, false);
      await pc.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.sendSignal(from, "answer", { sdp: answer });
    } else if (signalType === "answer" && payload.sdp) {
      const pc = this.peers.get(from);
      if (pc) await pc.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit);
    } else if (signalType === "ice" && payload.candidate) {
      const pc = this.peers.get(from);
      if (pc) await pc.addIceCandidate(payload.candidate as RTCIceCandidateInit);
    }
  }

  async onPeerJoined(userId: string): Promise<void> {
    if (!this.call) return;
    const me = getCachedSession()?.user.id;
    if (userId === me) return;
    await this.initiatePeer(userId, true);
  }

  private async ensureLocalMedia(callType: CallType): Promise<void> {
    if (this.localStream) return;
    this.localStream = await navigator.mediaDevices.getUserMedia(buildMediaConstraints(callType));
  }

  private createPeerConnection(remoteUserId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: "max-bundle" });
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.onRemoteStream?.(remoteUserId, stream);
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.call) {
        void this.sendSignal(remoteUserId, "ice", { candidate: ev.candidate.toJSON() });
      }
    };
    const callType = (this.call?.call_type ?? "audio") as CallType;
    applySendBitrate(pc, callType, this.qualityTier);
    void monitorAdaptiveBitrate(pc, callType, () => this.qualityTier, (tier) => {
      this.qualityTier = tier;
      this.onQualityTierChange?.(tier);
      this.onStateChange?.();
    }).then((stop) => this.statsCleanups.push(stop));
    return pc;
  }

  private async ensurePeer(remoteUserId: string, createOffer: boolean): Promise<RTCPeerConnection> {
    let pc = this.peers.get(remoteUserId);
    if (!pc) {
      pc = this.createPeerConnection(remoteUserId);
      this.peers.set(remoteUserId, pc);
    }
    if (createOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.sendSignal(remoteUserId, "offer", { sdp: offer });
    }
    return pc;
  }

  private async initiatePeer(remoteUserId: string, asCaller: boolean): Promise<void> {
    await this.ensurePeer(remoteUserId, asCaller);
  }

  private reapplyBitrateAll(): void {
    const callType = (this.call?.call_type ?? "audio") as CallType;
    for (const pc of this.peers.values()) {
      applySendBitrate(pc, callType, this.qualityTier);
    }
  }

  private async sendSignal(
    toUserId: string,
    signalType: string,
    data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit },
  ): Promise<void> {
    if (!this.call) return;
    await sendCallSignal(this.call.id, {
      to_user_id: toUserId,
      signal_type: signalType,
      sdp: data.sdp,
      candidate: data.candidate,
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

  async listVideoDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput");
  }

  async switchCamera(): Promise<void> {
    if (this.screenTrack) return;
    const callType = (this.call?.call_type ?? "audio") as CallType;
    if (callType !== "video" || !this.localStream) return;

    const devices = await this.listVideoDevices();
    const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

    let videoConstraints: MediaTrackConstraints;
    if (isMobile && devices.length <= 2) {
      this.preferredFacing = this.preferredFacing === "user" ? "environment" : "user";
      videoConstraints = { facingMode: { exact: this.preferredFacing } };
    } else if (devices.length > 1) {
      const idx = devices.findIndex((d) => d.deviceId === this.videoDeviceId);
      const next = devices[(idx + 1) % devices.length];
      this.videoDeviceId = next.deviceId;
      videoConstraints = { deviceId: { exact: next.deviceId } };
    } else {
      this.preferredFacing = this.preferredFacing === "user" ? "environment" : "user";
      videoConstraints = { facingMode: this.preferredFacing };
    }

    const base = buildMediaConstraints("video").video;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: typeof base === "object" && base !== null ? { ...base, ...videoConstraints } : videoConstraints,
    });
    const newTrack = stream.getVideoTracks()[0];
    if (!newTrack) return;

    const oldTrack = this.localStream.getVideoTracks()[0];
    if (oldTrack) {
      this.localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    this.localStream.addTrack(newTrack);

    for (const pc of this.peers.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(newTrack);
    }
    this.reapplyBitrateAll();
    this.onStateChange?.();
  }

  async startScreenShare(): Promise<void> {
    const screen = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    const track = screen.getVideoTracks()[0];
    if (!track) return;
    this.screenTrack = track;
    for (const pc of this.peers.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      else pc.addTrack(track, screen);
    }
    track.onended = () => void this.stopScreenShare();
    this.onStateChange?.();
  }

  async stopScreenShare(): Promise<void> {
    if (!this.screenTrack) return;
    this.screenTrack.stop();
    this.screenTrack = null;
    const cam = this.localStream?.getVideoTracks()[0] ?? null;
    for (const pc of this.peers.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && cam) await sender.replaceTrack(cam);
    }
    this.onStateChange?.();
  }

  async reject(): Promise<void> {
    if (this.call) await apiReject(this.call.id);
    await this.cleanup();
  }

  async hangup(): Promise<void> {
    if (this.call) await apiEnd(this.call.id);
    await this.cleanup();
  }

  async cleanup(): Promise<void> {
    for (const stop of this.statsCleanups) stop();
    this.statsCleanups = [];
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.screenTrack?.stop();
    this.localStream = null;
    this.screenTrack = null;
    this.call = null;
    this.qualityTier = 0;
    this.onStateChange?.();
  }
}

export const callEngine = new CallEngine();
