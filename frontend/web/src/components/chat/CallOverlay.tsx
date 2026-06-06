import { useEffect, useMemo, useRef, useState } from "react";
import { CallVideoGrid, type RemoteParticipant } from "@/components/calls/CallVideoGrid";
import { AudioWaveform } from "@/components/voice/AudioWaveform";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import {
  IconFlipCamera,
  IconMaximize,
  IconMic,
  IconMicOff,
  IconVideo,
  IconX,
} from "@/components/icons/Icons";
import { QUALITY_LABELS } from "@/calls/webrtcConfig";
import type { CallType } from "@/api/calls";

interface CallOverlayProps {
  type: CallType;
  peerName: string;
  isGroup?: boolean;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  participantLabels?: Record<string, string>;
  muted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
  qualityTier?: number;
  pushToTalk?: boolean;
  pttTransmitting?: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onSwitchCamera?: () => void;
  onTogglePushToTalk?: () => void;
  onPttDown?: () => void;
  onPttUp?: () => void;
  onEnd: () => void;
}

function isScreenTrack(stream: MediaStream): boolean {
  const track = stream.getVideoTracks()[0];
  if (!track) return false;
  const settings = track.getSettings() as MediaTrackSettings & { displaySurface?: string };
  return settings.displaySurface === "monitor" || settings.displaySurface === "window";
}

export function CallOverlay({
  type,
  peerName,
  isGroup,
  localStream,
  remoteStreams,
  participantLabels = {},
  muted,
  videoOff,
  screenSharing,
  qualityTier = 0,
  pushToTalk = false,
  pttTransmitting = false,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onSwitchCamera,
  onTogglePushToTalk,
  onPttDown,
  onPttUp,
  onEnd,
}: CallOverlayProps) {
  const [seconds, setSeconds] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const isVoiceOnly = type === "audio";

  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const el = localVideoRef.current;
    if (el && localStream && type === "video" && !videoOff) {
      el.srcObject = localStream;
      void el.play().catch(() => undefined);
    }
  }, [localStream, type, videoOff]);

  useEffect(() => {
    function onFsChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "f" && type === "video" && !isVoiceOnly) {
        void toggleFullscreen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen, type, isVoiceOnly]);

  const remoteParticipants: RemoteParticipant[] = useMemo(() => {
    return Array.from(remoteStreams.entries()).map(([userId, stream]) => ({
      userId,
      stream,
      label: participantLabels[userId] ?? userId.slice(0, 8),
      isScreen: isScreenTrack(stream),
    }));
  }, [remoteStreams, participantLabels]);

  async function toggleFullscreen() {
    const el = stageRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const showVideo = type === "video" && !videoOff;
  const remoteCount = remoteStreams.size;
  const micLive = pushToTalk ? pttTransmitting : !muted;
  const qualityLabel = QUALITY_LABELS[Math.min(qualityTier, QUALITY_LABELS.length - 1)];

  return (
    <div
      className={`call-overlay ${isVoiceOnly ? "call-overlay--voice" : "call-overlay--video"} ${fullscreen ? "call-overlay--fullscreen" : ""}`}
      role="dialog"
      aria-label={type === "video" ? "Video call" : "Voice call"}
    >
      <div className="call-overlay__backdrop" onClick={onEnd} aria-hidden />
      <div className={`call-overlay__panel ${showVideo ? "call-overlay__panel--video" : ""}`}>
        {showVideo ? (
          <div ref={stageRef} className="call-overlay__stage">
            <CallVideoGrid participants={remoteParticipants} className="call-overlay__remote-grid" />
            {screenSharing ? (
              <p className="call-overlay__presenting">You are presenting your screen</p>
            ) : null}
            <video
              ref={localVideoRef}
              className="call-overlay__video-local"
              playsInline
              autoPlay
              muted
            />
            <span className="call-overlay__quality-badge">{qualityLabel}</span>
          </div>
        ) : null}
        <div className="call-overlay__center">
          {isVoiceOnly ? (
            <div className="call-overlay__voice-visual">
              <AudioWaveform
                stream={localStream}
                active={micLive}
                className="call-overlay__voice-wave call-overlay__voice-wave--local"
              />
              <Avatar name={peerName} size="lg" />
              {isGroup && remoteCount > 0 ? (
                <p className="call-overlay__participants">{remoteCount + 1} connected</p>
              ) : null}
            </div>
          ) : !showVideo ? (
            <Avatar name={peerName} size="lg" />
          ) : null}
          <h2>{peerName}</h2>
          <p className="call-overlay__status">
            {isGroup ? (isVoiceOnly ? "Group voice · " : "Group video · ") : ""}
            {type === "video" ? "Video" : "Voice"} · {mm}:{ss}
            {pushToTalk ? (pttTransmitting ? " · Speaking" : " · PTT") : ""}
            {screenSharing ? " · Sharing screen" : ""}
            {isGroup && type === "video" && remoteCount > 0 ? ` · ${remoteCount + 1} in call` : ""}
          </p>
        </div>
        <div className="call-overlay__actions">
          {isVoiceOnly && onTogglePushToTalk ? (
            <button
              type="button"
              className={`call-overlay__ptt-toggle ${pushToTalk ? "call-overlay__ptt-toggle--on" : ""}`}
              onClick={onTogglePushToTalk}
            >
              PTT
            </button>
          ) : null}
          {pushToTalk && isVoiceOnly ? (
            <button
              type="button"
              className={`call-overlay__ptt-hold ${pttTransmitting ? "call-overlay__ptt-hold--active" : ""}`}
              aria-label="Hold to talk"
              onPointerDown={(e) => {
                e.preventDefault();
                onPttDown?.();
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                onPttUp?.();
              }}
              onPointerLeave={() => onPttUp?.()}
            >
              <IconMic size={22} />
              Hold
            </button>
          ) : (
            <IconButton
              label={muted ? "Unmute" : "Mute"}
              variant="ghost"
              active={muted}
              onClick={onToggleMute}
            >
              {muted ? <IconMicOff size={22} /> : <IconMic size={22} />}
            </IconButton>
          )}
          {type === "video" ? (
            <IconButton
              label={videoOff ? "Turn camera on" : "Turn camera off"}
              variant="ghost"
              active={videoOff}
              onClick={onToggleVideo}
            >
              <IconVideo size={22} />
            </IconButton>
          ) : null}
          {type === "video" && onSwitchCamera ? (
            <IconButton
              label="Switch camera"
              variant="ghost"
              disabled={screenSharing}
              onClick={() => void onSwitchCamera()}
            >
              <IconFlipCamera size={22} />
            </IconButton>
          ) : null}
          {type === "video" ? (
            <IconButton
              label={screenSharing ? "Stop sharing" : "Share screen"}
              variant="ghost"
              active={screenSharing}
              onClick={() => void onToggleScreenShare()}
            >
              <span className="call-overlay__screen-icon" aria-hidden>
                ⎘
              </span>
            </IconButton>
          ) : null}
          {type === "video" ? (
            <IconButton
              label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              variant="ghost"
              active={fullscreen}
              onClick={() => void toggleFullscreen()}
            >
              <IconMaximize size={22} />
            </IconButton>
          ) : null}
          <IconButton label="End call" variant="primary" className="call-overlay__end" onClick={onEnd}>
            <IconX size={22} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

export function IncomingCallBanner({
  displayName,
  callType,
  onAccept,
  onReject,
}: {
  displayName: string;
  callType: CallType;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="call-incoming-banner" role="alert">
      <span>
        Incoming {callType === "video" ? "video" : "voice"} call from {displayName}
        {callType === "audio" ? " (voice chat)" : ""}
      </span>
      <div className="call-incoming-banner__actions">
        <Button type="button" onClick={onAccept}>
          Accept
        </Button>
        <Button type="button" variant="secondary" onClick={onReject}>
          Decline
        </Button>
      </div>
    </div>
  );
}
