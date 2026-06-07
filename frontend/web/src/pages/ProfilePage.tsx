import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/api/client";
import { getCachedSession } from "@/api/auth";
import { clearMyAvatar, updatePresence } from "@/api/profile";
import { ProfileBadgeLegend } from "@/components/profile/ProfileBadgeLegend";
import { VerificationBadge } from "@/components/profile/VerificationBadge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useProfile } from "@/store/ProfileContext";
import { uploadFileResumable } from "@/media/resumableUpload";
import { displayName, formatLastSeen, presenceLine } from "@/utils/presenceText";
import type { AvatarKind, ProfilePrivacy } from "@/types/profile";
import { DEFAULT_PROFILE_PRIVACY } from "@/types/profile";

export function ProfilePage() {
  const session = getCachedSession();
  const { profile, loading, save, refresh } = useProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const animRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [statusText, setStatusText] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [privacy, setPrivacy] = useState<ProfilePrivacy>(DEFAULT_PROFILE_PRIVACY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secureMode, setSecureMode] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username);
    setNickname(profile.nickname);
    setBio(profile.bio);
    setStatusText(profile.status_text);
    setIsOnline(profile.is_online);
    const p = profile.privacy ?? DEFAULT_PROFILE_PRIVACY;
    setPrivacy(p);
    setSecureMode(p.secure_mode ?? false);
  }, [profile]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await save({
        username: username.trim().replace(/^\$/, ""),
        nickname: nickname.trim(),
        bio: bio.trim(),
        status_text: statusText.trim(),
        privacy: { ...privacy, secure_mode: secureMode },
      });
      setMessage("Profile saved");
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "USERNAME_TAKEN"
          ? "Username already taken"
          : "Could not save profile",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatar(file: File, animated: boolean) {
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFileResumable(file);
      const url = uploaded.stream_url || uploaded.preview_url;
      const isGif =
        file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
      const isWebp = file.type === "image/webp";
      const kind: AvatarKind = animated || isGif || isWebp ? "animated" : "image";
      await save(
        kind === "animated"
          ? { animated_avatar_url: url, avatar_url: url, avatar_kind: "animated" }
          : { avatar_url: url, animated_avatar_url: null, avatar_kind: "image" },
      );
      setMessage(animated ? "Animated avatar updated" : "Photo updated");
      await refresh();
    } catch {
      setError("Avatar upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveAvatar() {
    setUploading(true);
    try {
      await clearMyAvatar();
      await refresh();
      setMessage("Avatar removed");
    } catch {
      setError("Could not remove avatar");
    } finally {
      setUploading(false);
    }
  }

  async function handleOnlineToggle(online: boolean) {
    setIsOnline(online);
    try {
      const updated = await updatePresence(online, statusText.trim());
      await refresh();
      setMessage(online ? "You appear online" : "You appear offline");
      setIsOnline(updated.is_online);
    } catch {
      setError("Could not update presence");
    }
  }

  function togglePrivacy(key: keyof ProfilePrivacy) {
    setPrivacy((p) => ({ ...p, [key]: !p[key] }));
  }

  function toggleSecureMode() {
    setSecureMode((v) => !v);
  }

  if (!session) {
    return (
      <div className="page-shell page-shell__inner">
        <p>
          <Link to="/login">Sign in</Link> to edit your profile.
        </p>
      </div>
    );
  }

  if (session.demoMode) {
    return (
      <div className="page-shell page-shell__inner glass-panel profile-page">
        <h1>Profile</h1>
        <p className="auth-hint">Profile API requires a registered account (not demo mode).</p>
        <Link to="/register">Create account</Link>
      </div>
    );
  }

  return (
    <div className="page-shell page-shell__inner glass-panel profile-page">
      <header className="profile-page__header">
        <h1>My profile</h1>
        <Link to="/app/settings" className="profile-page__back">
          ← Settings
        </Link>
      </header>

      {loading && !profile ? <p className="auth-hint">Loading profile…</p> : null}
      {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
      {message ? <div className="auth-alert auth-alert--success">{message}</div> : null}

      {profile ? (
        <form className="profile-page__form" onSubmit={handleSave}>
          <div className="profile-page__hero">
            <div className="profile-page__avatar-col">
              <button
                type="button"
                className="profile-page__avatar-btn"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Avatar
                  name={displayName({ username, nickname })}
                  size="xl"
                  online={isOnline}
                  avatarUrl={profile.avatar_url}
                  animatedUrl={profile.animated_avatar_url}
                  avatarKind={profile.avatar_kind}
                />
                <span className="profile-page__avatar-hint">
                  {uploading ? "Uploading…" : "Photo"}
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleAvatar(f, false);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="profile-page__avatar-secondary"
                onClick={() => animRef.current?.click()}
                disabled={uploading}
              >
                Upload GIF / animated
              </button>
              <input
                ref={animRef}
                type="file"
                accept="image/gif,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleAvatar(f, true);
                  e.target.value = "";
                }}
              />
              {(profile.avatar_url || profile.animated_avatar_url) && (
                <button
                  type="button"
                  className="profile-page__avatar-remove"
                  onClick={() => void handleRemoveAvatar()}
                  disabled={uploading}
                >
                  Remove avatar
                </button>
              )}
            </div>
            <div className="profile-page__titles">
              <h2>
                {displayName({ username, nickname })}
                <VerificationBadge badge={profile.verification_badge} />
              </h2>
              <p className="profile-page__handle">${username.replace(/^\$/, "")}</p>
              <p className="profile-page__presence">{presenceLine({ ...profile, is_online: isOnline, status_text: statusText })}</p>
              <p className="profile-page__uid">UID {profile.uid}</p>
              {profile.phone_number ? (
                <p className="profile-page__phone">{profile.phone_number}</p>
              ) : null}
              {profile.last_seen_at && !isOnline ? (
                <p className="profile-page__last-seen">{formatLastSeen(profile.last_seen_at)}</p>
              ) : null}
            </div>
          </div>

          <section className="profile-page__section">
            <h3>Presence</h3>
            <div className="profile-presence-toggle">
              <button
                type="button"
                className={`profile-presence-toggle__btn ${isOnline ? "profile-presence-toggle__btn--on" : ""}`}
                onClick={() => void handleOnlineToggle(true)}
              >
                Online
              </button>
              <button
                type="button"
                className={`profile-presence-toggle__btn ${!isOnline ? "profile-presence-toggle__btn--on" : ""}`}
                onClick={() => void handleOnlineToggle(false)}
              >
                Away
              </button>
            </div>
            <p className="field__hint">Others see this when your privacy allows online status and last seen.</p>
          </section>

          <section className="profile-page__section">
            <h3>Identity</h3>
            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/^\$/, ""))}
              hint="Unique handle — shown as $username"
            />
            <Input
              label="Nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              hint="Display name in chats and calls"
            />
            <Input
              label="Bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              hint="Up to 500 characters"
            />
            <Input
              label="Status"
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              hint="Shown when you are online (e.g. At work)"
            />
          </section>

          <section className="profile-page__section">
            <h3>Verification</h3>
            <p className="field__hint">Badges are assigned by NEXA for trusted accounts.</p>
            <ProfileBadgeLegend />
            {profile.verification_badge !== "none" ? (
              <p className="profile-page__your-badge">
                Your badge: <VerificationBadge badge={profile.verification_badge} />
              </p>
            ) : null}
          </section>

          <section className="profile-page__section">
            <h3>Secure Mode</h3>
            <p className="field__hint">
              When enabled, only your User ID and username are visible to others. All other profile
              fields — avatar, bio, status, online status — are hidden.
            </p>
            <label className="profile-secure-mode__toggle">
              <input
                type="checkbox"
                checked={secureMode}
                onChange={toggleSecureMode}
              />
              <span className={`profile-secure-mode__label${secureMode ? " profile-secure-mode__label--on" : ""}`}>
                {secureMode ? "Secure mode is ON — profile is hidden" : "Secure mode is OFF"}
              </span>
            </label>
            {secureMode ? (
              <div className="profile-secure-mode__notice">
                Only visible to others: <strong>User ID</strong> and <strong>@{username}</strong>
              </div>
            ) : null}
          </section>

          <section className="profile-page__section">
            <h3>Privacy</h3>
            <ul className="profile-privacy-list">
              {(
                [
                  ["show_online_status", "Show online status"],
                  ["show_last_seen", "Show last seen"],
                  ["show_bio", "Show bio to others"],
                  ["show_status_text", "Show status text"],
                  ["show_avatar", "Show avatar"],
                  ["allow_search_by_username", "Allow search by username"],
                ] as const
              ).map(([key, label]) => (
                <li key={key}>
                  <label className="profile-privacy-list__row">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={privacy[key]}
                      onChange={() => togglePrivacy(key)}
                    />
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <Button type="submit" loading={saving}>
            Save profile
          </Button>
        </form>
      ) : null}
    </div>
  );
}
