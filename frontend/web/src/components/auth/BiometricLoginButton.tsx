import { useState } from "react";
import { finishWebAuthnLogin, startWebAuthnLogin } from "@/api/auth";
import { isWebAuthnAvailable, signInWithPlatformAuthenticator } from "@/security/webauthn";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface BiometricLoginButtonProps {
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function BiometricLoginButton({ onSuccess, onError }: BiometricLoginButtonProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isWebAuthnAvailable()) return null;

  async function handleBiometricLogin() {
    const trimmed = email.trim();
    if (!trimmed) {
      onError("Enter your email to use biometric sign-in");
      return;
    }
    setLoading(true);
    try {
      const start = await startWebAuthnLogin(trimmed);
      const assertion = await signInWithPlatformAuthenticator(
        trimmed,
        start.challenge,
        start.credential_ids,
      );
      if (!assertion) {
        onError("Biometric verification cancelled or failed");
        return;
      }
      const result = await finishWebAuthnLogin(trimmed, assertion.credentialId, start.challenge);
      if (result.ok) {
        onSuccess();
        return;
      }
      if ("message" in result) onError(result.message);
    } catch {
      onError("Biometric sign-in is not available for this account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="biometric-login">
      <Input
        label="Email for biometric sign-in"
        type="email"
        autoComplete="email webauthn"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading}
      />
      <Button type="button" variant="secondary" fullWidth loading={loading} onClick={() => void handleBiometricLogin()}>
        Sign in with fingerprint / Face ID
      </Button>
    </div>
  );
}
