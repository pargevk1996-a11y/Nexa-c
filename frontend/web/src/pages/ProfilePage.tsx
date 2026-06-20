import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/api/client";
import { getCachedSession } from "@/api/auth";
import { clearMyAvatar } from "@/api/profile";
import { ProfileBadgeLegend } from "@/components/profile/ProfileBadgeLegend";
import { VerificationBadge } from "@/components/profile/VerificationBadge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useProfile } from "@/store/ProfileContext";
import { uploadFileResumable } from "@/media/resumableUpload";
import { displayName, formatLastSeen } from "@/utils/presenceText";
import type { AvatarKind, ProfilePrivacy } from "@/types/profile";
import { DEFAULT_PROFILE_PRIVACY } from "@/types/profile";
import {
  IconSettings,
  IconBell,
  IconShield,
  IconLock,
  IconStar,
  IconSun,
} from "@/components/icons/Icons";

export function ProfilePage() {
  const session = getCachedSession();
  const { profile, loading, save, refresh } = useProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const animRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [statusText, setStatusText] = useState("");
  const [isOnline, setIsOnline] = useState(false);
  const [privacy, setPrivacy] = useState<ProfilePrivacy>(DEFAULT_PROFILE_PRIVACY);
  const [saving, setSaving] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secureMode, setSecureMode] = useState(false);
  const [editing, setEditing] = useState(false);

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

  // Mobile: two-finger swipe → open edit mode
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    let startX = 0;
    let lastX = 0;
    let two = false;
    const mid = (e: TouchEvent) => (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const onStart = (e: TouchEvent) => {
      if (window.innerWidth > 768) { two = false; return; }
      two = e.touches.length === 2;
      if (two) startX = lastX = mid(e);
    };
    const onMove = (e: TouchEvent) => {
      if (two && e.touches.length === 2) lastX = mid(e);
    };
    const onEnd = () => {
      if (!two) return;
      two = false;
      const dx = lastX - startX;
      if (Math.abs(dx) < 50) return;
      if (dx < 0) setEditing(true);   // swipe left → open edit
      else setEditing(false);          // swipe right → close edit
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

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
      setEditing(false);
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

  async function handleSavePrivacy() {
    setSavingPrivacy(true);
    setError(null);
    try {
      await save({ privacy: { ...privacy, secure_mode: secureMode } });
      setMessage("Privacy updated");
    } catch {
      setError("Could not save privacy");
    } finally {
      setSavingPrivacy(false);
    }
  }

  async function handleAvatar(file: File, animated: boolean) {
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFileResumable(file);
      const url = uploaded.stream_url || uploaded.preview_url;
      const isGif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
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



  function togglePrivacy(key: keyof ProfilePrivacy) {
    setPrivacy((p) => ({ ...p, [key]: !p[key] }));
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
    <div className="page-shell page-shell__inner glass-panel profile-page" ref={pageRef}>
      {loading && !profile ? <p className="auth-hint">Loading profile…</p> : null}

      {profile ? (
        <>
          {/* ── HERO ─────────────────────────────────────────────── */}
          <div className="profile-hero">
            <div className="profile-hero__av-wrap">
              <button
                type="button"
                className="profile-hero__av-btn"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label="Change photo"
              >
                <Avatar
                  name={displayName({ username, nickname })}
                  size="xl"
                  online={isOnline}
                  avatarUrl={profile.avatar_url}
                  animatedUrl={profile.animated_avatar_url}
                  avatarKind={profile.avatar_kind}
                />
                <span className="profile-hero__cam" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
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
            </div>

            <h1 className="profile-hero__name">
              {displayName({ username, nickname })}
              <VerificationBadge badge={profile.verification_badge} />
            </h1>
            <p className="profile-hero__handle">@{username.replace(/^\$/, "")}</p>
            <p className="profile-hero__status">
              <span className={`profile-hero__dot${isOnline ? " profile-hero__dot--on" : ""}`} />
              {isOnline ? "Online" : (formatLastSeen(profile.last_seen_at) || "Offline")}
            </p>
          </div>

          <div className="profile-page__main">
          {/* ── ALERTS ───────────────────────────────────────────── */}
          {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
          {message ? <div className="auth-alert auth-alert--success">{message}</div> : null}

          {/* ── INFO CARD ────────────────────────────────────────── */}
          <form className="profile-card" onSubmit={handleSave}>
            <div className="profile-card__head">
              <span className="profile-card__title">Profile info</span>
              {!editing && (
                <button type="button" className="profile-card__edit-btn" onClick={() => setEditing(true)}>
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="profile-card__edit-body">
                <Input
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/^\$/, ""))}
                  hint="Unique handle — shown as $username"
                />
                <Input
                  label="Display name"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  hint="Name shown in chats and calls"
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
                  hint="Shown when you are online"
                />
                <div className="profile-card__edit-actions">
                  <Button type="submit" loading={saving}>Save</Button>
                  <button
                    type="button"
                    className="profile-card__cancel"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="profile-card__view">
                {profile.phone_number ? (
                  <div className="profile-info-row">
                    <span className="profile-info-row__label">Phone</span>
                    <span className="profile-info-row__value">{profile.phone_number}</span>
                  </div>
                ) : null}
                <div className="profile-info-row">
                  <span className="profile-info-row__label">Username</span>
                  <span className="profile-info-row__value">@{username.replace(/^\$/, "")}</span>
                </div>
                {bio ? (
                  <div className="profile-info-row">
                    <span className="profile-info-row__label">Bio</span>
                    <span className="profile-info-row__value">{bio}</span>
                  </div>
                ) : null}
                {statusText ? (
                  <div className="profile-info-row">
                    <span className="profile-info-row__label">Status</span>
                    <span className="profile-info-row__value profile-info-row__value--accent">{statusText}</span>
                  </div>
                ) : null}
                {profile.uid ? (
                  <div className="profile-info-row">
                    <span className="profile-info-row__label">User ID</span>
                    <span className="profile-info-row__value profile-info-row__value--mono">{profile.uid}</span>
                  </div>
                ) : null}
              </div>
            )}
          </form>

          {/* ── PRIVACY CARD ─────────────────────────────────────── */}
          <div className="profile-card">
            <div className="profile-card__head">
              <span className="profile-card__title">Privacy</span>
            </div>
            <ul className="profile-privacy-list">
              {(
                [

                  ["show_bio", "Bio visible"],
                  ["show_status_text", "Status text visible"],
                  ["show_avatar", "Photo visible"],
                  ["allow_search_by_username", "Searchable by username"],
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
            <button
              type="button"
              className="profile-card__save-privacy"
              onClick={() => void handleSavePrivacy()}
              disabled={savingPrivacy}
            >
              {savingPrivacy ? "Saving…" : "Save privacy"}
            </button>
          </div>

          {/* ── SECURE MODE CARD ─────────────────────────────────── */}
          <div className={`profile-card${secureMode ? " profile-card--danger" : ""}`}>
            <div className="profile-card__head">
              <span className="profile-card__title">Secure Mode</span>
              <label className="profile-toggle" aria-label="Secure mode">
                <input
                  type="checkbox"
                  checked={secureMode}
                  onChange={() => setSecureMode((v) => !v)}
                />
                <span className="profile-toggle__track">
                  <span className="profile-toggle__thumb" />
                </span>
              </label>
            </div>
            <p className="profile-card__hint">
              Hides your avatar, bio, status and online presence. Only your user ID and username stay visible.
            </p>
            {secureMode ? (
              <div className="profile-secure-mode__notice">
                Profile hidden — only <strong>@{username.replace(/^\$/, "")}</strong> is visible to others.
              </div>
            ) : null}
          </div>

          {/* ── NAV CARDS ────────────────────────────────────────── */}
          <nav className="profile-nav" aria-label="Account">
            <Link to="/app/settings" className="profile-nav__item">
              <span className="profile-nav__icon profile-nav__icon--blue"><IconBell size={20} /></span>
              <div className="profile-nav__text">
                <span className="profile-nav__label">Notifications</span>
                <span className="profile-nav__desc">Sounds, badges and alerts</span>
              </div>
              <span className="profile-nav__chevron" aria-hidden>›</span>
            </Link>
            <Link to="/app/settings" className="profile-nav__item">
              <span className="profile-nav__icon profile-nav__icon--orange"><IconSun size={20} /></span>
              <div className="profile-nav__text">
                <span className="profile-nav__label">Appearance</span>
                <span className="profile-nav__desc">Theme, font size, wallpaper</span>
              </div>
              <span className="profile-nav__chevron" aria-hidden>›</span>
            </Link>
            <Link to="/app/settings" className="profile-nav__item">
              <span className="profile-nav__icon profile-nav__icon--green"><IconShield size={20} /></span>
              <div className="profile-nav__text">
                <span className="profile-nav__label">Security</span>
                <span className="profile-nav__desc">2FA, active sessions, login history</span>
              </div>
              <span className="profile-nav__chevron" aria-hidden>›</span>
            </Link>
            <Link to="/app/settings" className="profile-nav__item">
              <span className="profile-nav__icon profile-nav__icon--indigo"><IconLock size={20} /></span>
              <div className="profile-nav__text">
                <span className="profile-nav__label">Devices</span>
                <span className="profile-nav__desc">Trusted access points</span>
              </div>
              <span className="profile-nav__chevron" aria-hidden>›</span>
            </Link>
            <Link to="/app/chats" className="profile-nav__item">
              <span className="profile-nav__icon profile-nav__icon--teal"><IconStar size={20} /></span>
              <div className="profile-nav__text">
                <span className="profile-nav__label">Saved Messages</span>
                <span className="profile-nav__desc">Your personal cloud notes</span>
              </div>
              <span className="profile-nav__chevron" aria-hidden>›</span>
            </Link>
            <Link to="/app/settings" className="profile-nav__item">
              <span className="profile-nav__icon profile-nav__icon--purple"><IconSettings size={20} /></span>
              <div className="profile-nav__text">
                <span className="profile-nav__label">Settings</span>
                <span className="profile-nav__desc">All preferences</span>
              </div>
              <span className="profile-nav__chevron" aria-hidden>›</span>
            </Link>
          </nav>

          {/* ── PHOTO MANAGEMENT ─────────────────────────────────── */}
          <div className="profile-card profile-card--minimal">
            <div className="profile-card__head">
              <span className="profile-card__title">Photo</span>
            </div>
            <div className="profile-av-actions">
              <button
                type="button"
                className="profile-av-btn"
                onClick={() => animRef.current?.click()}
                disabled={uploading}
              >
                Upload GIF / animated
              </button>
              {(profile.avatar_url || profile.animated_avatar_url) ? (
                <button
                  type="button"
                  className="profile-av-btn profile-av-btn--danger"
                  onClick={() => void handleRemoveAvatar()}
                  disabled={uploading}
                >
                  Remove photo
                </button>
              ) : null}
            </div>
          </div>

          {/* ── VERIFICATION ─────────────────────────────────────── */}
          <div className="profile-card profile-card--minimal">
            <div className="profile-card__head">
              <span className="profile-card__title">Verification</span>
            </div>
            <ProfileBadgeLegend />
            {profile.verification_badge !== "none" ? (
              <p className="profile-page__your-badge">
                Your badge: <VerificationBadge badge={profile.verification_badge} />
              </p>
            ) : null}
          </div>
          </div>{/* profile-page__main */}
        </>
      ) : null}
    </div>
  );
}
