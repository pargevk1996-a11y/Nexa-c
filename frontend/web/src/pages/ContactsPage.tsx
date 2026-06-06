import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchProfiles } from "@/api/profile";
import { VerificationBadge } from "@/components/profile/VerificationBadge";
import { Avatar } from "@/components/ui/Avatar";
import { useChat } from "@/store/ChatContext";
import { getCachedSession } from "@/api/auth";
import { displayName, presenceLine } from "@/utils/presenceText";
import type { PublicProfile } from "@/types/profile";
import { conversationMatchesSearch } from "@/utils/userSearch";

export function ContactsPage() {
  const navigate = useNavigate();
  const session = getCachedSession();
  const { visibleConversations, selectConversation } = useChat();
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const localContacts = useMemo(() => {
    return visibleConversations
      .filter((c) => !c.isGroup && !c.isSecret)
      .filter((c) => conversationMatchesSearch(c, query));
  }, [visibleConversations, query]);

  useEffect(() => {
    const q = query.trim().replace(/^\$/, "");
    if (q.length < 2 || session?.demoMode || !session?.accessToken) {
      setRemote([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = window.setTimeout(() => {
      void searchProfiles(q)
        .then((list) => {
          if (!cancelled) setRemote(list);
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
  }, [query, session?.accessToken, session?.demoMode]);

  function openProfileUser(p: PublicProfile) {
    const match = visibleConversations.find((c) => c.peerUserId === p.id);
    if (match) {
      selectConversation(match.id);
      navigate("/app/chats");
    }
  }

  return (
    <div className="page-shell">
      <div className="page-shell__inner contacts-page glass-panel">
        <header className="contacts-page__head">
          <h1>Contacts</h1>
          <p>Find people by $username — search the global directory</p>
          <input
            type="search"
            className="field__input contacts-page__search"
            placeholder="$username or nickname…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search contacts"
          />
        </header>

        {searching ? <p className="auth-hint">Searching…</p> : null}

        {remote.length > 0 ? (
          <>
            <h2 className="contacts-page__subtitle">People</h2>
            <ul className="contacts-page__list">
              {remote.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="contacts-page__row"
                    onClick={() => openProfileUser(p)}
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
                      <span className="contacts-page__handle">${p.username}</span>
                      <span className="contacts-page__presence">{presenceLine(p)}</span>
                    </div>
                  </button>
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
                    <span className="contacts-page__handle">${c.username}</span>
                  ) : null}
                  <span className="privacy-no-copy">{c.uid}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
