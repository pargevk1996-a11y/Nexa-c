import { useState } from "react";
import { banMember, setSlowMode, type SpaceDetail } from "@/api/groups";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface SpaceAdminPanelProps {
  space: SpaceDetail;
  onUpdated: (space: SpaceDetail) => void;
}

export function SpaceAdminPanel({ space, onUpdated }: SpaceAdminPanelProps) {
  const [slowMode, setSlowModeLocal] = useState(space.settings.slow_mode_seconds);
  const [banUserId, setBanUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const canAdmin = space.my_role === "owner" || space.my_role === "admin";
  const canMod = canAdmin || space.my_role === "moderator";

  if (!canMod) return null;

  async function applySlowMode() {
    setLoading(true);
    try {
      const updated = await setSlowMode(space.id, slowMode);
      onUpdated(updated);
    } finally {
      setLoading(false);
    }
  }

  async function handleBan() {
    if (!banUserId.trim()) return;
    setLoading(true);
    try {
      await banMember(space.id, banUserId.trim(), "moderation");
      setBanUserId("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-admin-panel">
      <h3>Moderation</h3>
      {canAdmin && (
        <div className="space-admin-row">
          <label className="input-label">
            Slow mode (seconds)
            <input
              type="number"
              className="input"
              min={0}
              max={3600}
              value={slowMode}
              onChange={(e) => setSlowModeLocal(Number(e.target.value))}
            />
          </label>
          <Button type="button" variant="secondary" loading={loading} onClick={() => void applySlowMode()}>
            Apply
          </Button>
        </div>
      )}
      <div className="space-admin-row">
        <Input
          label="Ban user ID"
          value={banUserId}
          onChange={(e) => setBanUserId(e.target.value)}
          disabled={loading}
        />
        <Button type="button" variant="danger" loading={loading} onClick={() => void handleBan()}>
          Ban
        </Button>
      </div>
      <p className="auth-hint">
        Anti-spam: {space.settings.anti_spam_enabled ? "on" : "off"} · Auto-mod level:{" "}
        {space.settings.auto_mod_level}
        {space.verified && " · Verified space"}
      </p>
    </section>
  );
}
