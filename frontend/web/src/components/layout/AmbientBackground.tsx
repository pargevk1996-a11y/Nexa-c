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
      {/* Single NEXA wordmark across the whole page background (the only one in
          the app — the rail label and the chat-panel watermark were removed). */}
      <div className="ambient-bg__wordmark">NEXA</div>
    </div>
  );
}
