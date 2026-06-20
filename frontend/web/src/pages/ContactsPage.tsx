import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { searchProfiles } from "@/api/profile";
import {
  type BlockedUser,
  type ContactRequest,
  type ContactStatus,
  acceptContactRequest,
  cancelContactRequest,
  declineContactRequest,
  getContactStatus,
  listBlockedUsers,
  listIncomingRequests,
  sendContactRequest,
  unblockUser,
} from "@/api/contacts";
import { VerificationBadge } from "@/components/profile/VerificationBadge";
import { Avatar } from "@/components/ui/Avatar";
import { useChat } from "@/store/ChatContext";
import { getCachedSession } from "@/api/auth";
import { displayName, presenceLine } from "@/utils/presenceText";
import type { PublicProfile } from "@/types/profile";
import type { Conversation } from "@/types";
import { conversationMatchesSearch } from "@/utils/userSearch";
import { createConversation } from "@/api/chat";

type ProfileWithStatus = PublicProfile & { contactStatus?: ContactStatus; requestId?: string; conversationId?: string };

export function ContactsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = getCachedSession();
  const { visibleConversations, selectConversation, refreshConversations } = useChat();
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<ProfileWithStatus[]>([]);
  const [searching, setSearching] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState<ContactRequest[]>([]);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const showBlocked = searchParams.get("v") === "blocked";
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);

  // Load the blocked list whenever the blocked view is opened.
  useEffect(() => {
    if (!showBlocked) return;
    listBlockedUsers()
      .then(setBlocked)
      .catch(() => setError("Failed to load blocked users"));
  }, [showBlocked]);

  const handleUnblock = useCallback(async (userId: string) => {
    try {
      await unblockUser(userId);
      setBlocked((list) => list.filter((b) => b.user_id !== userId));
    } catch {
      setError("Failed to unblock");
    }
  }, []);

  const localContacts = useMemo(() => {
    return visibleConversations
      .filter((c) => !c.isGroup && !c.isSecret)
      .filter((c) => conversationMatchesSearch(c, query));
  }, [visibleConversations, query]);

  // Load incoming requests on mount
  useEffect(() => {
    if (!session?.user?.id || session?.demoMode) return;
    listIncomingRequests().then(setIncomingRequests).catch(() => {});
  }, [session?.user?.id, session?.demoMode]);

  // Search with debounce + fetch contact statuses
  useEffect(() => {
    const q = query.trim().replace(/^\$/, "");
    if (q.length < 2 || session?.demoMode || !session?.user?.id) {
      setRemote([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = window.setTimeout(() => {
      void searchProfiles(q)
        .then(async (list) => {
          if (cancelled) return;
          // Fetch contact status for each result
          const withStatus: ProfileWithStatus[] = await Promise.all(
            list.map(async (p) => {
              try {
                const s = await getContactStatus(p.id);
                return { ...p, contactStatus: s.status, requestId: s.request_id ?? undefined, conversationId: s.conversation_id ?? undefined };
              } catch {
                return { ...p, contactStatus: "none" as ContactStatus };
              }
            }),
          );
          if (!cancelled) setRemote(withStatus);
        })
        .catch(() => {
          if (!cancelled) setRemote([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, session?.user?.id, session?.demoMode]);

  async function openExistingChat(peerUserId: string, conversationId?: string | null) {
    const findIn = (convs: Conversation[]) =>
      (conversationId ? convs.find((c) => c.id === conversationId) : null) ??
      convs.find((c) => c.peerUserId === peerUserId);

    const match = findIn(visibleConversations);
    if (match) {
      selectConversation(match.id);
      navigate("/app/chats");
      return;
    }

    // Conversations might be stale — refresh and use fresh data directly
    const fresh = await refreshConversations();
    const afterRefresh = findIn(fresh);
    if (afterRefresh) {
      selectConversation(afterRefresh.id);
      navigate("/app/chats");
      return;
    }

    // DM was never created (request failed silently) — create it now
    try {
      const created = await createConversation({ type: "dm", member_ids: [peerUserId] });
      await refreshConversations();
      selectConversation(created.id);
      navigate("/app/chats");
    } catch {
      // ignore
    }
  }

  const handleSendRequest = useCallback(async (p: ProfileWithStatus) => {
    setError(null);
    setPendingActions((s) => new Set(s).add(p.id));
    try {
      const myUsername = session?.user?.username ?? "";
      const result = await sendContactRequest(p.id, myUsername);
      setRemote((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? { ...x, contactStatus: "pending_sent", conversationId: result.conversation_id ?? undefined }
            : x,
        ),
      );
      const fresh = await refreshConversations();
      const conv =
        (result.conversation_id ? fresh.find((c) => c.id === result.conversation_id) : null) ??
        fresh.find((c) => c.peerUserId === p.id);
      if (conv) {
        selectConversation(conv.id);
        navigate("/app/chats");
      }
    } catch (e) {
      setError(`Failed to send contact request: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setPendingActions((s) => { const n = new Set(s); n.delete(p.id); return n; });
    }
  }, [session?.user?.username, refreshConversations, selectConversation, navigate]);

  const handleCancelRequest = useCallback(async (p: ProfileWithStatus) => {
    if (!p.requestId) return;
    setError(null);
    setPendingActions((s) => new Set(s).add(p.id));
    try {
      await cancelContactRequest(p.requestId);
      setRemote((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, contactStatus: "none", requestId: undefined } : x)),
      );
    } catch (e) {
      setError(`Failed to cancel request: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setPendingActions((s) => { const n = new Set(s); n.delete(p.id); return n; });
    }
  }, []);

  const handleAcceptIncoming = useCallback(async (req: ContactRequest) => {
    setPendingActions((s) => new Set(s).add(req.id));
    try {
      const accepted = await acceptContactRequest(req.id);
      setIncomingRequests((prev) => prev.filter((r) => r.id !== req.id));
      const fresh = await refreshConversations();
      const convId = accepted.conversation_id ?? req.conversation_id;
      if (convId) {
        selectConversation(convId);
        navigate("/app/chats");
      } else {
        // DM was never created — find by peer or create one now
        const peerConv = fresh.find((c) => c.peerUserId === req.from_user_id);
        if (peerConv) {
          selectConversation(peerConv.id);
          navigate("/app/chats");
        } else {
          try {
            const created = await createConversation({ type: "dm", member_ids: [req.from_user_id] });
            await refreshConversations();
            selectConversation(created.id);
            navigate("/app/chats");
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      setError(`Failed to accept contact request: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setPendingActions((s) => { const n = new Set(s); n.delete(req.id); return n; });
    }
  }, [selectConversation, navigate, refreshConversations]);

  const handleDeclineIncoming = useCallback(async (req: ContactRequest) => {
    setPendingActions((s) => new Set(s).add(req.id));
    try {
      await declineContactRequest(req.id);
      setIncomingRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (e) {
      setError(`Failed to decline request: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setPendingActions((s) => { const n = new Set(s); n.delete(req.id); return n; });
    }
  }, []);

  return (
    <div className="page-shell">
      <div className="page-shell__inner contacts-page glass-panel">
        <header className="contacts-page__head">
          <h1>Contacts</h1>
          <p>Find people by @username — search the global directory</p>
          <input
            type="search"
            className="field__input contacts-page__search"
            placeholder="@username or nickname…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search contacts"
          />
        </header>

        {error ? (
          <div className="contacts-page__error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">✕</button>
          </div>
        ) : null}

        {showBlocked ? (
          <section className="contacts-page__blocked">
            <div className="contacts-page__blocked-head">
              <h2 className="contacts-page__subtitle">Blocked users</h2>
              <button
                type="button"
                className="btn contacts-page__blocked-back"
                onClick={() => setSearchParams({}, { replace: true })}
              >
                Back
              </button>
            </div>
            {blocked.length === 0 ? (
              <p className="auth-hint">No blocked users.</p>
            ) : (
              <ul className="contacts-page__list">
                {blocked.map((b) => (
                  <li key={b.user_id} className="contacts-page__row">
                    <Avatar name={b.display_name || "User"} />
                    <div className="contacts-page__row-text">
                      <span className="privacy-no-copy">{b.display_name || b.user_id}</span>
                      {b.reason ? (
                        <span className="contacts-page__presence">{b.reason}</span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void handleUnblock(b.user_id)}
                    >
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <>
            {searching ? <p className="auth-hint">Searching…</p> : null}

        {/* Incoming contact requests */}
        {incomingRequests.length > 0 ? (
          <>
            <h2 className="contacts-page__subtitle">Contact requests</h2>
            <ul className="contacts-page__list">
              {incomingRequests.map((req) => (
                <li key={req.id}>
                  <div className="contacts-page__row contacts-page__row--request">
                    <Avatar name={req.from_user_id} />
                    <div className="contacts-page__row-text">
                      <strong className="privacy-no-copy">{req.from_user_id}</strong>
                      <span className="contacts-page__presence">Wants to connect</span>
                    </div>
                    <div className="contacts-page__request-actions">
                      <button
                        type="button"
                        className="contacts-page__action-btn contacts-page__action-btn--accept"
                        disabled={pendingActions.has(req.id)}
                        onClick={() => handleAcceptIncoming(req)}
                        aria-label="Accept"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="contacts-page__action-btn contacts-page__action-btn--decline"
                        disabled={pendingActions.has(req.id)}
                        onClick={() => handleDeclineIncoming(req)}
                        aria-label="Decline"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {/* Search results */}
        {remote.length > 0 ? (
          <>
            <h2 className="contacts-page__subtitle">People</h2>
            <ul className="contacts-page__list">
              {remote.map((p) => (
                <li key={p.id}>
                  <div className="contacts-page__row">
                    <button
                      type="button"
                      className="contacts-page__row-main"
                      onClick={() => {
                        if (p.contactStatus === "contacts" || p.contactStatus === "pending_sent") {
                          void openExistingChat(p.id, p.conversationId);
                        }
                      }}
                    >
                      <Avatar
                        name={displayName(p)}
                        online={p.is_online}
                        avatarUrl={p.avatar_url}
                        animatedUrl={p.animated_avatar_url}
                        avatarKind={p.avatar_kind}
                      />
                      <div className="contacts-page__row-text">
                        <strong className="privacy-no-copy">
                          {displayName(p)}
                          <VerificationBadge badge={p.verification_badge} />
                        </strong>
                        <span className="contacts-page__handle">@{p.username}</span>
                        <span className="contacts-page__presence">{presenceLine(p)}</span>
                      </div>
                    </button>

                    {/* Action buttons based on contact status */}
                    <div className="contacts-page__request-actions">
                      {p.contactStatus === "none" && (
                        <button
                          type="button"
                          className="contacts-page__action-btn contacts-page__action-btn--accept"
                          disabled={pendingActions.has(p.id)}
                          onClick={() => handleSendRequest(p)}
                          aria-label="Send contact request"
                        >
                          ✓
                        </button>
                      )}
                      {p.contactStatus === "pending_sent" && (
                        <button
                          type="button"
                          className="contacts-page__action-btn contacts-page__action-btn--pending"
                          disabled={pendingActions.has(p.id)}
                          onClick={() => handleCancelRequest(p)}
                          aria-label="Cancel request"
                          title="Request sent — click to cancel"
                        >
                          ⏳
                        </button>
                      )}
                      {p.contactStatus === "pending_received" && (
                        <>
                          <button
                            type="button"
                            className="contacts-page__action-btn contacts-page__action-btn--accept"
                            disabled={pendingActions.has(p.id)}
                            onClick={() => {
                              const req =
                                incomingRequests.find((r) => r.from_user_id === p.id) ??
                                (p.requestId
                                  ? {
                                      id: p.requestId,
                                      from_user_id: p.id,
                                      to_user_id: session?.user?.id ?? "",
                                      status: "pending" as const,
                                      conversation_id: p.conversationId ?? null,
                                      created_at: "",
                                      resolved_at: null,
                                    }
                                  : null);
                              if (req) handleAcceptIncoming(req);
                            }}
                            aria-label="Accept"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className="contacts-page__action-btn contacts-page__action-btn--decline"
                            disabled={pendingActions.has(p.id)}
                            onClick={() => {
                              const req =
                                incomingRequests.find((r) => r.from_user_id === p.id) ??
                                (p.requestId
                                  ? {
                                      id: p.requestId,
                                      from_user_id: p.id,
                                      to_user_id: session?.user?.id ?? "",
                                      status: "pending" as const,
                                      conversation_id: p.conversationId ?? null,
                                      created_at: "",
                                      resolved_at: null,
                                    }
                                  : null);
                              if (req) handleDeclineIncoming(req);
                            }}
                            aria-label="Decline"
                          >
                            ✕
                          </button>
                        </>
                      )}
                      {p.contactStatus === "contacts" && (
                        <span className="contacts-page__status-label">✓ Connected</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <h2 className="contacts-page__subtitle">Your chats</h2>
        <ul className="contacts-page__list">
          {localContacts.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="contacts-page__row"
                onClick={() => {
                  selectConversation(c.id);
                  navigate("/app/chats");
                }}
              >
                <Avatar name={c.name} online={c.online} />
                <div className="contacts-page__row-text">
                  <strong className="privacy-no-copy">{c.name}</strong>
                  {c.username ? (
                    <span className="contacts-page__handle">@{c.username}</span>
                  ) : null}
                  <span className="privacy-no-copy">{c.uid}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
          </>
        )}
      </div>
    </div>
  );
}
