const VERSION = import.meta.env.VITE_APP_VERSION ?? "1.0.0";

const FAQS = [
  {
    q: "How do I start an encrypted chat?",
    a: "All chats in Nexa are end-to-end encrypted by default. Just tap any contact to begin.",
  },
  {
    q: "How do I delete a message?",
    a: "Long-press (or right-click) any message and choose Delete.",
  },
  {
    q: "Can I use Nexa on multiple devices?",
    a: "Yes. Sign in on any device — your chats sync automatically.",
  },
  {
    q: "How do I block someone?",
    a: "Open their profile, scroll down, and tap Block. You can manage blocked users in Settings → Privacy → Blocked users.",
  },
];

export function HelpSettingsSection() {
  return (
    <div className="settings-section">
      <p className="settings-section__lead">
        Find answers, contact support, or send us feedback.
      </p>

      <div className="settings-group">
        <h3 className="settings-group__title">Frequently asked questions</h3>
        {FAQS.map((faq) => (
          <details key={faq.q} className="settings-faq">
            <summary className="settings-faq__q">{faq.q}</summary>
            <p className="settings-faq__a">{faq.a}</p>
          </details>
        ))}
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">Get in touch</h3>
        <div className="settings-help-links">
          <a
            href="mailto:support@nexa.app"
            className="settings-nav-link"
          >
            <span>Contact support</span>
            <span className="settings-nav-link__chevron">›</span>
          </a>
          <button
            type="button"
            className="settings-nav-link"
            onClick={() => alert("Bug report — coming soon")}
          >
            <span>Report a bug</span>
            <span className="settings-nav-link__chevron">›</span>
          </button>
          <button
            type="button"
            className="settings-nav-link"
            onClick={() => alert("Feature request — coming soon")}
          >
            <span>Suggest a feature</span>
            <span className="settings-nav-link__chevron">›</span>
          </button>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">Legal</h3>
        <div className="settings-help-links">
          <a href="/legal" className="settings-nav-link">
            <span>Terms of service</span>
            <span className="settings-nav-link__chevron">›</span>
          </a>
          <a href="/legal" className="settings-nav-link">
            <span>Privacy policy</span>
            <span className="settings-nav-link__chevron">›</span>
          </a>
        </div>
      </div>

      <p className="settings-version">Nexa {VERSION}</p>
    </div>
  );
}
