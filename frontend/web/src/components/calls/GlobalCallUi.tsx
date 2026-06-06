import { CallOverlay, IncomingCallBanner } from "@/components/chat/CallOverlay";
import { useCall } from "@/calls/CallProvider";

/** App-wide incoming banner and active call overlay (any route). */
export function GlobalCallUi() {
  const call = useCall();

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
