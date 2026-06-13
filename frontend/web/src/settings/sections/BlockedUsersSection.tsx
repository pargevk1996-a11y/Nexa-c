import { FormEvent, useCallback, useEffect, useState } from "react";
import { blockUser, listBlockedUsers, unblockUser, type BlockedUser } from "@/api/contacts";
import { getCachedSession } from "@/api/auth";
import { SettingRow } from "@/components/settings/SettingRow";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const DEMO_BLOCKS_KEY = "nexa:demo:blocks";

function loadDemoBlocks(): BlockedUser[] {
  try {
    const raw = localStorage.getItem(DEMO_BLOCKS_KEY);
    return raw ? (JSON.parse(raw) as BlockedUser[]) : [];
  } catch {
    return [];
  }
}

function saveDemoBlocks(list: BlockedUser[]) {
  localStorage.setItem(DEMO_BLOCKS_KEY, JSON.stringify(list));
}

export function BlockedUsersSection() {
  const session = getCachedSession();
  const live = Boolean(session?.user?.id && !session?.demoMode);
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (!live) {
      setBlocks(loadDemoBlocks());
      return;
    }
    try {
      setBlocks(await listBlockedUsers());
    } catch {
      setBlocks(loadDemoBlocks());
      setError("Using local block list (API unavailable)");
    }
  }, [live]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleBlock(e: FormEvent) {
    e.preventDefault();
    const id = userId.trim();
    if (!id) return;
    if (live) {
      try {
        await blockUser(id);
        setUserId("");
        await load();
        return;
      } catch {
        /* fall through demo */
      }
    }
    const next = [
      ...loadDemoBlocks(),
      { user_id: id, display_name: null, blocked_at: new Date().toISOString(), reason: null },
    ];
    saveDemoBlocks(next);
    setBlocks(next);
    setUserId("");
  }

  async function handleUnblock(id: string) {
    if (live) {
      try {
        await unblockUser(id);
        await load();
        return;
      } catch {
        /* demo */
      }
    }
    const next = loadDemoBlocks().filter((b) => b.user_id !== id);
    saveDemoBlocks(next);
    setBlocks(next);
  }

  return (
    <section className="settings-group">
      <h2>Blocked users</h2>
      <p className="settings-section__lead">Blocked users cannot message you or see your online status.</p>
      <div className="settings-card">
        <form onSubmit={(e) => void handleBlock(e)}>
          <SettingRow title="Block by user ID" description="Enter the user UUID to block.">
            <div className="settings-inline-form">
              <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID" />
              <Button type="submit">Block</Button>
            </div>
          </SettingRow>
        </form>
        {error ? <div className="auth-alert auth-alert--info">{error}</div> : null}
        {blocks.length === 0 ? (
          <p className="auth-hint">No blocked users</p>
        ) : (
          <ul className="sessions-list">
            {blocks.map((b) => (
              <li key={b.user_id} className="sessions-list__item">
                <div className="sessions-list__body">
                  <strong>{b.display_name ?? b.user_id}</strong>
                  <span className="sessions-list__meta">
                    Blocked {new Date(b.blocked_at).toLocaleString()}
                  </span>
                </div>
                <Button type="button" variant="secondary" onClick={() => void handleUnblock(b.user_id)}>
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
