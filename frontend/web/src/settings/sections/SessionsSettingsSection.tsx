import { ActiveSessionsPanel } from "@/components/auth/ActiveSessionsPanel";

export function SessionsSettingsSection() {
  return (
    <section className="settings-group">
      <h2>Session history</h2>
      <p className="settings-section__lead">
        Devices where you are signed in. Revoke any session you do not recognize.
      </p>
      <div className="settings-card settings-card--flush">
        <ActiveSessionsPanel />
      </div>
    </section>
  );
}
