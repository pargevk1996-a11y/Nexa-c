import { useNavigate } from "react-router-dom";
import { AuthSecurityOverview } from "@/components/auth/AuthSecurityOverview";
import { BiometricSettingsPanel } from "@/components/auth/BiometricSettingsPanel";
import { ChangePasswordPanel } from "@/components/auth/ChangePasswordPanel";
import { PhoneVerificationPanel } from "@/components/auth/PhoneVerificationPanel";
import { QrLinkDevicePanel } from "@/components/auth/QrLinkDevicePanel";
import { TwoFactorSetupPanel } from "@/components/auth/TwoFactorSetupPanel";
import { SettingRow } from "@/components/settings/SettingRow";
import { BRAND_NAME } from "@/config/brand";
import { biometricLabel, isBiometricUnlockSupported, isQrLoginEnabled } from "@/config/features";
import { Button } from "@/components/ui/Button";

export function SecuritySettingsSection() {
  const navigate = useNavigate();

  return (
    <section className="settings-group">
      <h2>Security</h2>
      <p className="settings-section__lead">Password, two-factor authentication, and sign-in methods.</p>
      <div className="settings-card">
        <AuthSecurityOverview />
        <SettingRow title="Change password" description="Use a strong unique password.">
          <ChangePasswordPanel />
        </SettingRow>
        <SettingRow title="Two-factor authentication" description="Authenticator app (TOTP).">
          <TwoFactorSetupPanel />
        </SettingRow>
        {isBiometricUnlockSupported() ? (
          <SettingRow
            title={`Unlock with ${biometricLabel()}`}
            description="Open the app with biometrics instead of your PIN."
          >
            <BiometricSettingsPanel />
          </SettingRow>
        ) : null}
        <SettingRow title="Phone verification" description="Link and verify your phone number.">
          <PhoneVerificationPanel />
        </SettingRow>
        {isQrLoginEnabled() ? (
          <SettingRow title="Link device (QR)" description="Approve sign-in from another device.">
            <QrLinkDevicePanel />
          </SettingRow>
        ) : null}
        <SettingRow
          title="Sign-in methods"
          description={`Email and password — managed by ${BRAND_NAME} auth.`}
        >
          <Button variant="secondary" type="button" onClick={() => navigate("/login")}>
            Switch account
          </Button>
        </SettingRow>
      </div>
    </section>
  );
}
