export function AmbientBackground() {
  // Same star field as the home / auth screens so the whole app shares one look.
  return (
    <div className="ambient-bg" aria-hidden>
      <div className="auth-starfield">
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
      </div>
      <div className="ambient-bg__glow" />
    </div>
  );
}
