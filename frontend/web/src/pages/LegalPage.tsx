import { Link } from "react-router-dom";
import { BRAND_NAME } from "@/config/brand";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

type LegalKind = "privacy" | "terms";

interface LegalPageProps {
  kind: LegalKind;
}

const COPY: Record<LegalKind, { title: string; intro: string; sections: { h: string; p: string }[] }> = {
  privacy: {
    title: "Privacy Policy",
    intro: `${BRAND_NAME} is built privacy-first. This page summarizes what we collect, why, and the controls you have.`,
    sections: [
      {
        h: "What we collect",
        p: "Account identifiers (email, username), the minimum metadata required to route messages, and device/session information used for security. Message content is end-to-end-encryption-ready and is not used for advertising.",
      },
      {
        h: "How we use data",
        p: "Strictly to operate the service: authentication, delivery, abuse prevention, and security telemetry. We do not sell personal data.",
      },
      {
        h: "Your controls",
        p: "You can review active sessions, revoke devices, export or delete your account from Settings at any time.",
      },
      {
        h: "Contact",
        p: "Privacy questions can be sent to privacy@nexa-c.com.",
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    intro: `By using ${BRAND_NAME} you agree to these terms. They exist to keep the service safe and lawful for everyone.`,
    sections: [
      {
        h: "Acceptable use",
        p: "Do not use the service for illegal activity, harassment, spam, or attempts to compromise other users or the platform.",
      },
      {
        h: "Accounts & security",
        p: "You are responsible for safeguarding your credentials and signature PIN. Notify us promptly of any unauthorized access.",
      },
      {
        h: "Availability",
        p: "The service is provided on an \"as is\" basis. We work to maximize uptime but do not guarantee uninterrupted availability.",
      },
      {
        h: "Changes",
        p: "We may update these terms; material changes will be surfaced in-app before they take effect.",
      },
    ],
  },
};

export function LegalPage({ kind }: LegalPageProps) {
  const copy = COPY[kind];
  useDocumentTitle(copy.title);

  return (
    <main className="legal-page">
      <article className="legal-page__card">
        <h1>{copy.title}</h1>
        <p className="legal-page__intro">{copy.intro}</p>
        {copy.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            <p>{s.p}</p>
          </section>
        ))}
        <p className="legal-page__back">
          <Link to="/">← Back to {BRAND_NAME}</Link>
        </p>
      </article>
    </main>
  );
}
