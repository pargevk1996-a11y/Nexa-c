import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { IconPhone, IconVideo } from "@/components/icons/Icons";
import { listCalls, type CallSession } from "@/api/calls";
import { getCachedSession } from "@/security/sessionCache";
import { useCall } from "@/calls/CallProvider";
import { resolveDemoCallPeers } from "@/calls/demoCallPeers";
import { useChat } from "@/store/ChatContext";
import type { CallType } from "@/types";

function isMissedCall(c: CallSession, meId: string): boolean {
  if (c.status === "missed" || c.status === "no_answer" || c.status === "declined") return true;
  if (c.caller_id && c.caller_id !== meId && c.status !== "completed") return true;
  return false;
}

function formatCallTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `Today, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short" });
}

function callLabel(session: CallSession, meId: string): string {
  if (session.is_group) return "Group call";
  const other = session.participant_ids.find((id) => id !== meId);
  return other ? other.slice(0, 8) : "Unknown";
}

export function CallsPage() {
  const { visibleConversations } = useChat();
  const call = useCall();
  const session = getCachedSession();
  const [recent, setRecent] = useState<CallSession[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const showMissed = searchParams.get("v") === "missed";
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session?.user?.id || session?.demoMode) return;
    void listCalls()
      .then(setRecent)
      .catch(() => setRecent([]));
  }, [session?.user?.id, session?.demoMode]);

  // Mobile: two-finger horizontal swipe → missed / all calls
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    let startX = 0;
    let lastX = 0;
    let two = false;
    const mid = (e: TouchEvent) => (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const onStart = (e: TouchEvent) => {
      if (window.innerWidth > 768) { two = false; return; }
      two = e.touches.length === 2;
      if (two) startX = lastX = mid(e);
    };
    const onMove = (e: TouchEvent) => {
      if (two && e.touches.length === 2) lastX = mid(e);
    };
    const onEnd = () => {
      if (!two) return;
      two = false;
      const dx = lastX - startX;
      if (Math.abs(dx) < 50) return;
      setSearchParams(dx < 0 ? { v: "missed" } : {}, { replace: true });
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [setSearchParams]);

  function startCall(
    conversationId: string,
    peerName: string,
    type: CallType,
    conv: {
      id: string;
      name: string;
      peerUserId?: string;
      memberIds?: string[];
      isGroup?: boolean;
    },
  ) {
    const meId = session?.user.id;
    let participantIds: string[];
    let participantLabels: Record<string, string> | undefined;
    if (session?.demoMode) {
      const resolved = resolveDemoCallPeers(conv, meId);
      participantIds = resolved.peerIds;
      participantLabels = resolved.labels;
    } else {
      participantIds = conv.isGroup ? (conv.memberIds ?? []) : conv.peerUserId ? [conv.peerUserId] : [];
      participantIds = meId ? participantIds.filter((id) => id !== meId) : participantIds;
    }
    if (!participantIds.length) {
      window.alert("No callable participants for this conversation.");
      return;
    }
    void call.startCall({
      participantIds,
      callType: type,
      displayName: peerName,
      conversationId,
      participantLabels,
    });
  }

  const meId = session?.user.id ?? "";
  const displayedCalls = showMissed ? recent.filter((c) => isMissedCall(c, meId)) : recent;

  return (
    <div className="page-shell" ref={pageRef}>
      <div className="page-shell__inner calls-page glass-panel">
        <header className="calls-page__head">
          <h1>{showMissed ? "Missed calls" : "Calls"}</h1>
          <p>
            Voice and video over WebRTC (STUN/TURN, adaptive bitrate)
            {session?.demoMode ? " — demo uses local preview + simulated peers" : ""}
          </p>
        </header>
        <section className="calls-page__recent">
          <h2>Recent</h2>
          {displayedCalls.length === 0 ? (
            <p className="calls-page__empty">
              {showMissed ? "No missed calls." : "No calls yet — use quick dial below."}
            </p>
          ) : (
            <ul>
              {displayedCalls.slice(0, 20).map((c) => {
                const missed = isMissedCall(c, meId);
                return (
                <li key={c.id} className={`calls-page__item${missed ? " calls-page__item--missed" : ""}`}>
                  <Avatar name={callLabel(c, meId)} />
                  <div className="calls-page__item-body">
                    <strong>{callLabel(c, meId)}</strong>
                    <span>
                      {formatCallTime(c.created_at)}
                      {" · "}
                      {c.call_type === "video" ? "Video" : "Audio"}
                      {missed ? <span className="calls-page__missed-label"> · missed</span> : null}
                    </span>
                  </div>
                  <IconButton
                    label={
                      c.call_type === "video"
                        ? `Video call ${callLabel(c, meId)} again`
                        : `Call ${callLabel(c, meId)} again`
                    }
                    variant="ghost"
                    onClick={() => {
                      const others = c.participant_ids.filter((id) => id !== meId);
                      if (others.length) {
                        const labels: Record<string, string> = {};
                        for (const id of others) {
                          labels[id] = id.slice(0, 8);
                        }
                        void call.startCall({
                          participantIds: others,
                          callType: c.call_type,
                          displayName: callLabel(c, meId),
                          conversationId: c.conversation_id ?? undefined,
                          participantLabels: labels,
                        });
                      }
                    }}
                  >
                    {c.call_type === "video" ? <IconVideo size={20} /> : <IconPhone size={20} />}
                  </IconButton>
                </li>
              );
              })}
            </ul>
          )}
        </section>
        <section className="calls-page__quick">
          <h2>Quick dial</h2>
          <div className="calls-page__list">
            {visibleConversations
              .filter((c) => !c.isSecret)
              .slice(0, 8)
              .map((c) => (
                <div key={c.id} className="calls-page__quick-row">
                  <Avatar name={c.name} size="sm" />
                  <span className="calls-page__quick-name">{c.name}</span>
                  <div className="calls-page__item-actions">
                    <IconButton
                      label={`Voice call ${c.name}`}
                      variant="ghost"
                      onClick={() =>
                        startCall(c.id, c.name, "audio", c)
                      }
                    >
                      <IconPhone size={20} />
                    </IconButton>
                    <IconButton
                      label={`Video call ${c.name}`}
                      variant="ghost"
                      onClick={() =>
                        startCall(c.id, c.name, "video", c)
                      }
                    >
                      <IconVideo size={20} />
                    </IconButton>
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
