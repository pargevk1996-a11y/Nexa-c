import { FormEvent, useState } from "react";
import { sendPhoneCode, verifyPhone } from "@/api/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function PhoneVerificationPanel() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const msg = await sendPhoneCode(phone.trim());
      setHint(msg);
      setStep("code");
    } catch {
      setError("Could not send SMS code");
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const msg = await verifyPhone(phone.trim(), code.trim());
      setHint(msg);
    } catch {
      setError("Invalid code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="phone-verify-panel">
      {step === "phone" ? (
        <form className="auth-form" onSubmit={sendCode}>
          <Input
            label="Phone number"
            type="tel"
            placeholder="+1 555 000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading}
          />
          <Button type="submit" loading={loading}>
            Send code
          </Button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={verify}>
          <Input
            label="SMS code"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={loading}
          />
          <Button type="submit" loading={loading}>
            Verify phone
          </Button>
          <Button type="button" variant="ghost" onClick={() => setStep("phone")}>
            Change number
          </Button>
        </form>
      )}
      {hint ? <div className="auth-alert auth-alert--info">{hint}</div> : null}
      {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
    </div>
  );
}
