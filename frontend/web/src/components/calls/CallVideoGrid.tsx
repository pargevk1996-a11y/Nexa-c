import { useEffect, useRef } from "react";

export interface RemoteParticipant {
  userId: string;
  stream: MediaStream;
  label: string;
  isScreen?: boolean;
}

interface CallVideoGridProps {
  participants: RemoteParticipant[];
  className?: string;
}

function RemoteTile({ participant }: { participant: RemoteParticipant }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el) {
      el.srcObject = participant.stream;
      void el.play().catch(() => undefined);
    }
  }, [participant.stream]);

  return (
    <div
      className={`call-video-grid__tile ${participant.isScreen ? "call-video-grid__tile--screen" : ""}`}
    >
      <video ref={videoRef} className="call-video-grid__video" playsInline autoPlay />
      <span className="call-video-grid__label">
        {participant.isScreen ? "Screen" : participant.label}
      </span>
    </div>
  );
}

export function CallVideoGrid({ participants, className = "" }: CallVideoGridProps) {
  const count = participants.length;
  const layoutClass =
    count <= 1
      ? "call-video-grid--1"
      : count === 2
        ? "call-video-grid--2"
        : count <= 4
          ? "call-video-grid--4"
          : "call-video-grid--many";

  if (count === 0) {
    return (
      <div className={`call-video-grid call-video-grid--empty ${className}`}>
        <div className="call-overlay__video-placeholder">Waiting for video…</div>
      </div>
    );
  }

  return (
    <div className={`call-video-grid ${layoutClass} ${className}`}>
      {participants.map((p) => (
        <RemoteTile key={p.userId} participant={p} />
      ))}
    </div>
  );
}
