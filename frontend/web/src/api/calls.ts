import { apiFetch } from "./client";

export type CallType = "audio" | "video";

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface CallSession {
  id: string;
  call_type: CallType;
  status: string;
  caller_id: string;
  participant_ids: string[];
  conversation_id: string | null;
  is_group: boolean;
  created_at: string;
}

export async function listCalls(): Promise<CallSession[]> {
  return apiFetch<CallSession[]>("/calls/calls");
}

export async function getIceConfig(): Promise<{ ice_servers: IceServer[] }> {
  return apiFetch("/calls/ice");
}

export async function createCall(body: {
  call_type: CallType;
  participant_ids: string[];
  conversation_id?: string;
}): Promise<CallSession> {
  return apiFetch<CallSession>("/calls/calls", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function acceptCall(callId: string): Promise<CallSession> {
  return apiFetch<CallSession>(`/calls/calls/${callId}/accept`, { method: "POST", body: "{}" });
}

export async function rejectCall(callId: string): Promise<void> {
  await apiFetch(`/calls/calls/${callId}/reject`, { method: "POST", body: "{}" });
}

export async function endCall(callId: string): Promise<void> {
  await apiFetch(`/calls/calls/${callId}/end`, { method: "POST", body: "{}" });
}

export async function sendCallSignal(
  callId: string,
  body: {
    to_user_id: string;
    signal_type: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  },
): Promise<void> {
  await apiFetch(`/calls/calls/${callId}/signal`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
