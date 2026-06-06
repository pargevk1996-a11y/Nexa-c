import { FormEvent, useState } from "react";
import { createSpace, type SpaceType } from "@/api/groups";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const SPACE_OPTIONS: { value: SpaceType; label: string; hint: string }[] = [
  { value: "private_group", label: "Private group", hint: "Invite-only members" },
  { value: "public_group", label: "Public group", hint: "Anyone can join" },
  { value: "channel", label: "Channel", hint: "Admins post; members comment in threads" },
  { value: "broadcast", label: "Broadcast", hint: "One-way announcements" },
  { value: "community", label: "Community", hint: "Hub for linked channels" },
  { value: "supergroup", label: "Supergroup", hint: "Large public group" },
];

interface CreateSpaceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (spaceId: string) => void;
  parentCommunityId?: string;
}

export function CreateSpaceModal({
  open,
  onClose,
  onCreated,
  parentCommunityId,
}: CreateSpaceModalProps) {
  const [type, setType] = useState<SpaceType>(parentCommunityId ? "channel" : "public_group");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [slowMode, setSlowMode] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setLoading(true);
    try {
      const isPublic = type === "public_group" || type === "supergroup" || type === "channel" || type === "broadcast";
      const space = await createSpace({
        type: parentCommunityId ? "channel" : type,
        title: title.trim(),
        description: description.trim() || undefined,
        slug: slug.trim() || undefined,
        is_public: isPublic,
        parent_id: parentCommunityId,
        settings: {
          slow_mode_seconds: slowMode,
          anti_spam_enabled: true,
          auto_mod_level: 1,
        },
      });
      onCreated(space.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create space");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h2>{parentCommunityId ? "New channel" : "Create space"}</h2>
        <form className="auth-form" onSubmit={handleSubmit}>
          {!parentCommunityId && (
            <label className="input-label">
              Type
              <select
                className="input"
                value={type}
                onChange={(e) => setType(e.target.value as SpaceType)}
                disabled={loading}
              >
                {SPACE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} — {o.hint}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={loading} />
          <Input
            label="Slug (optional)"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            disabled={loading}
            placeholder="my-community"
          />
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={loading}
          />
          <label className="input-label">
            Slow mode (seconds, 0 = off)
            <input
              type="number"
              className="input"
              min={0}
              max={3600}
              value={slowMode}
              onChange={(e) => setSlowMode(Number(e.target.value))}
              disabled={loading}
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
