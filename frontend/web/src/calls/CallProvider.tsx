import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CallSession, CallType } from "@/api/calls";
import { getCachedSession } from "@/security/sessionCache";
import type { WsFrame } from "@/realtime/types";
import { RealtimeWsClient } from "@/realtime/wsClient";
import { callEngine } from "./CallEngine";
import { callDemoEngine } from "./CallDemoEngine";

export interface IncomingCall {
  callId: string;
  callType: CallType;
  callerId: string;
  displayName: string;
  isGroup: boolean;
}

interface CallContextValue {
  incoming: IncomingCall | null;
  active: {
    callType: CallType;
    displayName: string;
    isGroup: boolean;
  } | null;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  participantLabels: Record<string, string>;
  muted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
  qualityTier: number;
  startCall: (opts: {
    participantIds: string[];
    callType: CallType;
    displayName: string;
    conversationId?: string;
    participantLabels?: Record<string, string>;
  }) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  rejectIncoming: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => Promise<void>;
  switchCamera: () => Promise<void>;
  pushToTalk: boolean;
  pttTransmitting: boolean;
  setPushToTalk: (enabled: boolean) => void;
  startPtt: () => void;
  stopPtt: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const session = getCachedSession();

  if (session?.demoMode) {
    return <CallProviderDemo>{children}</CallProviderDemo>;
  }

  return <CallProviderLive>{children}</CallProviderLive>;
}

function CallProviderDemo({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<CallContextValue["active"]>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [participantLabels, setParticipantLabels] = useState<Record<string, string>>({});
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [qualityTier, setQualityTier] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [pushToTalk, setPushToTalkState] = useState(false);
  const [pttTransmitting, setPttTransmitting] = useState(false);

  const refreshLocal = useCallback(() => {
    setLocalStream(callDemoEngine.getLocalStream());
  }, []);

  useEffect(() => {
    callDemoEngine.setHandlers({
      onRemoteStream: (userId, stream) => {
        setRemoteStreams((prev) => new Map(prev).set(userId, stream));
      },
      onStateChange: () => {
        refreshLocal();
        setScreenSharing(callDemoEngine.isScreenSharing());
      },
      onQualityTierChange: (tier) => setQualityTier(tier),
    });
  }, [refreshLocal]);

  useEffect(() => {
    callDemoEngine.applyMicState({ muted, pushToTalk, transmitting: pttTransmitting });
  }, [muted, pushToTalk, pttTransmitting]);

  const startCall = useCallback(
    async (opts: {
      participantIds: string[];
      callType: CallType;
      displayName: string;
      conversationId?: string;
      participantLabels?: Record<string, string>;
    }) => {
      if (!opts.participantIds.length) return;
      setParticipantLabels(opts.participantLabels ?? {});
      setQualityTier(0);
      try {
        await callDemoEngine.start(opts.participantIds, opts.callType, opts.participantLabels ?? {});
      } catch (err) {
        window.alert(
          err instanceof Error ? err.message : "Could not access microphone or camera for demo call.",
        );
        return;
      }
      setActive({
        callType: opts.callType,
        displayName: opts.displayName,
        isGroup: opts.participantIds.length > 1,
      });
      refreshLocal();
      setScreenSharing(callDemoEngine.isScreenSharing());
    },
    [refreshLocal],
  );

  const endCall = useCallback(async () => {
    await callDemoEngine.cleanup();
    setActive(null);
    setRemoteStreams(new Map());
    setScreenSharing(false);
  }, []);

  const toggleMute = useCallback(() => {
    if (pushToTalk) return;
    setMuted((m) => !m);
  }, [pushToTalk]);

  const setPushToTalk = useCallback((enabled: boolean) => {
    setPushToTalkState(enabled);
    if (enabled) {
      setMuted(true);
      setPttTransmitting(false);
    }
  }, []);

  const startPtt = useCallback(() => {
    if (!pushToTalk) return;
    setPttTransmitting(true);
  }, [pushToTalk]);

  const stopPtt = useCallback(() => {
    setPttTransmitting(false);
  }, []);

  const toggleVideo = useCallback(() => {
    setVideoOff((v) => {
      callDemoEngine.setVideoEnabled(v);
      return !v;
    });
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      await callDemoEngine.stopScreenShare();
      setScreenSharing(false);
    } else {
      await callDemoEngine.startScreenShare();
      setScreenSharing(true);
    }
    refreshLocal();
  }, [screenSharing, refreshLocal]);

  const switchCamera = useCallback(async () => {
    await callDemoEngine.switchCamera();
    refreshLocal();
  }, [refreshLocal]);

  const value = useMemo(
    () => ({
      incoming: null,
      active,
      localStream,
      remoteStreams,
      participantLabels,
      muted,
      videoOff,
      screenSharing,
      qualityTier,
      startCall,
      acceptIncoming: async () => undefined,
      rejectIncoming: async () => undefined,
      endCall,
      toggleMute,
      toggleVideo,
      toggleScreenShare,
      switchCamera,
      pushToTalk,
      pttTransmitting,
      setPushToTalk,
      startPtt,
      stopPtt,
    }),
    [
      active,
      localStream,
      remoteStreams,
      participantLabels,
      muted,
      videoOff,
      screenSharing,
      qualityTier,
      startCall,
      endCall,
      toggleMute,
      toggleVideo,
      toggleScreenShare,
      switchCamera,
      pushToTalk,
      pttTransmitting,
      setPushToTalk,
      startPtt,
      stopPtt,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

function CallProviderLive({ children }: { children: ReactNode }) {
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [active, setActive] = useState<CallContextValue["active"]>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [participantLabels, setParticipantLabels] = useState<Record<string, string>>({});
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [qualityTier, setQualityTier] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [pushToTalk, setPushToTalkState] = useState(false);
  const [pttTransmitting, setPttTransmitting] = useState(false);
  const wsRef = useRef<RealtimeWsClient | null>(null);

  const refreshLocal = useCallback(() => {
    setLocalStream(callEngine.getLocalStream());
  }, []);

  useEffect(() => {
    callEngine.setHandlers({
      onRemoteStream: (userId, stream) => {
        setRemoteStreams((prev) => new Map(prev).set(userId, stream));
      },
      onStateChange: () => {
        refreshLocal();
        setScreenSharing(callEngine.isScreenSharing());
      },
      onQualityTierChange: (tier) => setQualityTier(tier),
    });
  }, [refreshLocal]);

  useEffect(() => {
    callEngine.applyMicState({ muted, pushToTalk, transmitting: pttTransmitting });
  }, [muted, pushToTalk, pttTransmitting]);

  const handleWsEvent = useCallback(
    async (frame: WsFrame) => {
      const p = frame.payload;
      if (frame.name === "call.incoming") {
        setIncoming({
          callId: String(p.call_id),
          callType: (p.call_type as CallType) ?? "audio",
          callerId: String(p.caller_id),
          displayName: String(p.caller_id).slice(0, 8),
          isGroup: Boolean(p.is_group),
        });
        await callEngine.attachIncomingCall({
          id: String(p.call_id),
          call_type: (p.call_type as CallType) ?? "audio",
          status: "ringing",
          caller_id: String(p.caller_id),
          participant_ids: (p.participant_ids as string[]) ?? [],
          conversation_id: null,
          is_group: Boolean(p.is_group),
          created_at: new Date().toISOString(),
        });
      }
      if (frame.name === "call.accepted") {
        const uid = String(p.user_id);
        await callEngine.onPeerJoined(uid);
      }
      if (frame.name === "call.signal") {
        await callEngine.handleSignal(p);
      }
      if (frame.name === "call.ended" || frame.name === "call.rejected") {
        await callEngine.cleanup();
        setActive(null);
        setIncoming(null);
        setRemoteStreams(new Map());
      }
    },
    [],
  );

  useEffect(() => {
    const session = getCachedSession();
    if (!session?.accessToken || session.demoMode) return;
    const client = new RealtimeWsClient({ onEvent: handleWsEvent });
    wsRef.current = client;
    client.connect();
    return () => {
      client.disconnect();
      wsRef.current = null;
    };
  }, [handleWsEvent]);

  const startCall = useCallback(
    async (opts: {
      participantIds: string[];
      callType: CallType;
      displayName: string;
      conversationId?: string;
      participantLabels?: Record<string, string>;
    }) => {
      if (!opts.participantIds.length) return;
      setParticipantLabels(opts.participantLabels ?? {});
      setQualityTier(0);
      await callEngine.startOutgoing(opts.participantIds, opts.callType, opts.conversationId);
      setActive({
        callType: opts.callType,
        displayName: opts.displayName,
        isGroup: opts.participantIds.length > 1,
      });
      refreshLocal();
      setScreenSharing(callEngine.isScreenSharing());
    },
    [refreshLocal],
  );

  const acceptIncoming = useCallback(async () => {
    if (!incoming) return;
    const call = callEngine.getCall();
    if (!call) return;
    await callEngine.acceptIncoming(call, incoming.callType);
    setActive({
      callType: incoming.callType,
      displayName: incoming.displayName,
      isGroup: incoming.isGroup,
    });
    setIncoming(null);
    refreshLocal();
    const me = getCachedSession()?.user.id;
    for (const pid of call.participant_ids) {
      if (pid !== me && pid !== incoming.callerId) {
        await callEngine.onPeerJoined(pid);
      }
    }
  }, [incoming, refreshLocal]);

  const rejectIncoming = useCallback(async () => {
    await callEngine.reject();
    setIncoming(null);
  }, []);

  const endCall = useCallback(async () => {
    await callEngine.hangup();
    setActive(null);
    setRemoteStreams(new Map());
    setScreenSharing(false);
  }, []);

  const toggleMute = useCallback(() => {
    if (pushToTalk) return;
    setMuted((m) => !m);
  }, [pushToTalk]);

  const setPushToTalk = useCallback((enabled: boolean) => {
    setPushToTalkState(enabled);
    if (enabled) {
      setMuted(true);
      setPttTransmitting(false);
    }
  }, []);

  const startPtt = useCallback(() => {
    if (!pushToTalk) return;
    setPttTransmitting(true);
  }, [pushToTalk]);

  const stopPtt = useCallback(() => {
    setPttTransmitting(false);
  }, []);

  const toggleVideo = useCallback(() => {
    setVideoOff((v) => {
      callEngine.setVideoEnabled(v);
      return !v;
    });
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      await callEngine.stopScreenShare();
      setScreenSharing(false);
    } else {
      await callEngine.startScreenShare();
      setScreenSharing(true);
    }
    refreshLocal();
  }, [screenSharing, refreshLocal]);

  const switchCamera = useCallback(async () => {
    await callEngine.switchCamera();
    refreshLocal();
  }, [refreshLocal]);

  const value = useMemo(
    () => ({
      incoming,
      active,
      localStream,
      remoteStreams,
      participantLabels,
      muted,
      videoOff,
      screenSharing,
      qualityTier,
      startCall,
      acceptIncoming,
      rejectIncoming,
      endCall,
      toggleMute,
      toggleVideo,
      toggleScreenShare,
      switchCamera,
      pushToTalk,
      pttTransmitting,
      setPushToTalk,
      startPtt,
      stopPtt,
    }),
    [
      incoming,
      active,
      localStream,
      remoteStreams,
      participantLabels,
      muted,
      videoOff,
      screenSharing,
      qualityTier,
      startCall,
      acceptIncoming,
      rejectIncoming,
      endCall,
      toggleMute,
      toggleVideo,
      toggleScreenShare,
      switchCamera,
      pushToTalk,
      pttTransmitting,
      setPushToTalk,
      startPtt,
      stopPtt,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}

export function useCallOptional() {
  return useContext(CallContext);
}
