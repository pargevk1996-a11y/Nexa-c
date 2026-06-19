import { useEffect } from "react";
import { CallOverlay, IncomingCallBanner } from "@/components/chat/CallOverlay";
import { useCall } from "@/calls/CallProvider";
import { startRingback, startRingtone, stopRingback, stopRingtone } from "@/calls/ringtone";

/** App-wide incoming banner and active call overlay (any route). */
export function GlobalCallUi() {
  const call = useCall();

  // Standard ringtone while an incoming call is pending; stops on
  // accept / decline / caller hang-up (and on unmount as a safety net).
  useEffect(() => {
    if (call.incoming) startRingtone();
    else stopRingtone();
    return stopRingtone;
  }, [call.incoming]);

  // Ringback ("гудок") for the caller while the outgoing call is connecting;
  // stops the moment the peer answers (or the call ends).
  useEffect(() => {
    if (call.active && call.connecting) startRingback();
    else stopRingback();
    return stopRingback;
  }, [call.active, call.connecting]);

  return (
    <>
      {call.incoming ? (
        <IncomingCallBanner
          displayName={call.incoming.displayName}
          callType={call.incoming.callType}
          onAccept={() => void call.acceptIncoming()}
          onReject={() => void call.rejectIncoming()}
        />
      ) : null}
      {call.active ? (
        <CallOverlay
          type={call.active.callType}
          peerName={call.active.displayName}
          isGroup={call.active.isGroup}
          connecting={call.connecting}
          localStream={call.localStream}
          remoteStreams={call.remoteStreams}
          participantLabels={call.participantLabels}
          muted={call.muted}
          videoOff={call.videoOff}
          screenSharing={call.screenSharing}
          qualityTier={call.qualityTier}
          pushToTalk={call.pushToTalk}
          pttTransmitting={call.pttTransmitting}
          onToggleMute={call.toggleMute}
          onToggleVideo={call.toggleVideo}
          onToggleScreenShare={() => void call.toggleScreenShare()}
          onSwitchCamera={() => void call.switchCamera()}
          onTogglePushToTalk={() => call.setPushToTalk(!call.pushToTalk)}
          onPttDown={call.startPtt}
          onPttUp={call.stopPtt}
          onEnd={() => void call.endCall()}
        />
      ) : null}
    </>
  );
}
