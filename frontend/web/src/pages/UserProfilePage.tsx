import { useNavigate, useParams } from "react-router-dom";
import { Avatar } from "@/components/ui/Avatar";
import { VerificationBadge } from "@/components/profile/VerificationBadge";
import { usePublicProfile } from "@/hooks/usePublicProfile";
import { displayName, presenceLine } from "@/utils/presenceText";

export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { profile, loading } = usePublicProfile(userId);
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="profile-page">
        <p className="auth-hint">Loading profile…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-page">
        <p className="auth-hint">Profile not found.</p>
      </div>
    );
  }

  const name = displayName(profile);

  return (
    <div className="profile-page">
      <div className="profile-page__inner">
        <button
          type="button"
          className="profile-page__back-btn"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ← Back
        </button>

        <div className="profile-page__hero">
          <Avatar
            name={name}
            online={profile.is_online}
            size="xl"
            avatarUrl={profile.avatar_url}
            animatedUrl={profile.animated_avatar_url}
            avatarKind={profile.avatar_kind}
          />
          <h1 className="profile-page__name">
            {name}
            <VerificationBadge badge={profile.verification_badge} />
          </h1>
          {profile.username ? (
            <p className="profile-page__uid">${profile.username}</p>
          ) : null}
          <p className="profile-page__presence">{presenceLine(profile)}</p>
        </div>

        {profile.bio ? (
          <section className="profile-page__section">
            <h2 className="profile-page__section-title">Bio</h2>
            <p className="profile-page__bio">{profile.bio}</p>
          </section>
        ) : null}

        {profile.status_text ? (
          <section className="profile-page__section">
            <h2 className="profile-page__section-title">Status</h2>
            <p className="profile-page__status-text">{profile.status_text}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
