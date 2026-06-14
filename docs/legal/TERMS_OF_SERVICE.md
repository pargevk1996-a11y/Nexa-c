# NEXA — Terms of Service

**Effective date:** 2026-06-14 · **Version:** 1.0 (draft)

> ⚠️ **LEGAL REVIEW REQUIRED before publishing.** Fields in `[[double brackets]]` MUST be
> filled with real legal information by the operator. This draft reflects the current technical
> state of the service but is **not** legal advice.

`[[LEGAL_ENTITY_NAME]]` ("NEXA", "we", "us", "our") operates the NEXA messenger at nexa-c.com.
By accessing or using the service you agree to these Terms. If you do not agree, do not use the service.

---

## 1. Acceptance of terms

These Terms of Service ("Terms") govern your access to and use of the NEXA messenger service,
including the website nexa-c.com, web application, mobile applications, and desktop applications
(collectively, the "Service"). By creating an account, clicking "Create account", or otherwise
accessing the Service, you confirm that you have read, understood, and agree to be bound by these
Terms and our [Privacy Policy](PRIVACY_POLICY.md).

---

## 2. Eligibility

You must be at least **16 years old** to use the Service. By registering, you represent and warrant
that:

- You are at least 16 years of age.
- You have the legal capacity to enter into a binding agreement under the laws of your jurisdiction.
- Your use of the Service does not violate any applicable law or regulation.
- If registering on behalf of an organisation, you have the authority to bind that organisation to
  these Terms.
- You are not located in a country subject to an embargo, export restriction, or sanction programme
  that would prohibit your use of the Service.

---

## 3. Account registration

To use the Service you must register with a valid email address and username. You agree to:

- Provide accurate, current, and complete registration information.
- Keep your registration information up to date.
- Maintain only one account per person or legal entity. Creating duplicate accounts to circumvent
  restrictions, bans, or rate limits is prohibited.
- Not register an account on behalf of another person without their explicit consent.

---

## 4. Account security and authentication

You are solely responsible for the security of your account credentials. You agree to:

- Keep your password, PIN, TOTP codes, WebAuthn keys, and all two-factor authentication credentials
  strictly confidential.
- Use a strong, unique password that is not used on any other service.
- Immediately notify us at **security@nexa-c.com** of any suspected unauthorised access or use of
  your account.
- Log out of shared or public devices at the end of each session.
- Take full responsibility for all activity that occurs under your account, whether or not
  authorised by you.
- Never share your account credentials with any third party.

NEXA uses industry-standard security measures including Argon2id password hashing, TOTP/WebAuthn
two-factor authentication, single-session enforcement, and reuse-detecting token rotation. These
measures are designed to protect your account, but they cannot substitute for good personal security
hygiene.

---

## 5. Acceptable use

You agree to use the Service only for lawful purposes and in a manner that respects the rights of
other users and complies with all applicable laws. You agree **not** to:

- Use the Service to transmit content that is illegal, defamatory, threatening, harassing, abusive,
  fraudulent, obscene, or otherwise objectionable.
- Impersonate any person or entity, or misrepresent your affiliation with any person or entity.
- Send unsolicited bulk messages, spam, chain letters, or automated commercial messages.
- Use the Service to distribute malware, ransomware, phishing content, exploit kits, or other
  malicious or harmful code.
- Attempt to access another user's account, private messages, or personal data without authorisation.
- Conduct, facilitate, or assist any denial-of-service or distributed denial-of-service attack
  against the Service or its users.
- Use automated bots, scrapers, crawlers, or other automated means to access, extract, or index
  data from the Service without our prior written consent.
- Circumvent, disable, reverse-engineer, or otherwise interfere with any security, authentication,
  rate-limiting, encryption, or access control feature.
- Resell, sublicense, or commercially exploit the Service without our prior written consent.
- Use the Service in any way that could damage, disable, overburden, or impair our servers,
  networks, or infrastructure.
- Facilitate or assist any third party in violating these Terms.

---

## 6. Prohibited content

The following categories of content are **strictly prohibited**. Violations will result in immediate
account termination and, where required by law, reporting to law enforcement authorities:

| Category | Description |
|----------|-------------|
| CSAM | Child sexual abuse material, or any content that sexually exploits, endangers, or grooms minors. |
| Violence & terrorism | Content that promotes, incites, glorifies, or facilitates violence, terrorism, or mass casualty events. |
| Hate speech | Content that incites discrimination, hatred, or violence based on race, ethnicity, national origin, religion, gender, sexual orientation, disability, or other protected characteristics. |
| Non-consensual imagery | Non-consensual intimate imagery ("revenge porn") or any intimate media shared without the depicted person's explicit consent. |
| IP infringement | Content that infringes copyright, trademark, patent, trade secret, or other intellectual property rights. |
| Privacy violations | Personal data of third parties shared without their consent, in violation of applicable privacy law. |
| Fraud | Fraudulent offers, pyramid schemes, impersonation for financial gain, or other deceptive commercial practices. |

---

## 7. Content ownership and licence

You retain full ownership of the content you create and send through the Service. By using the
Service, you grant NEXA a limited, non-exclusive, worldwide, royalty-free, sub-licensable licence
to:

- Store your content on our servers.
- Transmit and route your content to its intended recipients.
- Display or render your content on the receiving device(s).

This licence extends only as far as technically necessary to operate and deliver the Service. It
does **not** grant us the right to use your content for advertising, analytics, AI model training,
or any purpose other than operating the Service.

You represent and warrant that: (a) you own or hold all rights necessary to share the content you
submit; (b) your content does not infringe any third-party rights; and (c) your content complies
with these Terms and all applicable law.

---

## 8. Intellectual property of NEXA

NEXA's name, logo, trademarks, service marks, and software are the exclusive property of
`[[LEGAL_ENTITY_NAME]]` and its licensors. The source code of the Service is published under the
GNU Affero General Public License v3.0 (AGPL-3.0); the trademark and branding rights above are
separate from and not granted by that licence. You may not use NEXA's name, logo, or branding in
any way that suggests endorsement or affiliation without our prior written consent.

---

## 9. Privacy

Your use of the Service is governed by our [Privacy Policy](PRIVACY_POLICY.md), which is
incorporated into these Terms by reference. Our Privacy Policy explains what data we collect, why,
how we protect it, and what rights you have. By using the Service you agree to the Privacy Policy.

---

## 10. Encryption and security disclosures

We are committed to transparency about our security capabilities and limitations:

| Feature | Status |
|---------|--------|
| TLS 1.2/1.3 (in transit) | ✅ Enabled, HSTS preload |
| AES-GCM field encryption (at rest) | ✅ Enabled |
| End-to-end encryption (E2EE) | 🔶 In development (Phase 2) |
| Screenshot blocking — native (Android, Tauri) | ✅ OS-level via FLAG\_SECURE / content protection |
| Screenshot blocking — web | 🔶 Best-effort deterrent (OS-level capture cannot be blocked by web apps) |
| WebAuthn hardware key support | 🔶 Rolling out |

We will never silently downgrade any security measure. Material changes to our encryption
capabilities will be communicated in-app and in our public changelog.

---

## 11. Reporting violations

If you encounter content or behaviour that violates these Terms, please report it via:

- **In-app reporting tools** (where available).
- **abuse@nexa-c.com** for content violations.
- **security@nexa-c.com** for security vulnerabilities or account compromise.

We review all reports and may take action including content removal, account suspension, or
referral to law enforcement. NEXA reserves the right to proactively moderate content where required
by applicable law.

---

## 12. Service availability and modifications

The Service is provided on an "as is" and "as available" basis. We strive to maintain high
availability but make no guarantee of uninterrupted or error-free service. We reserve the right to:

- Modify, update, or discontinue any feature or part of the Service at any time.
- Perform scheduled or emergency maintenance that may temporarily interrupt availability.
- Impose reasonable usage, storage, or rate limits to protect the integrity of the Service.
- Permanently discontinue the Service with at least **90 days' notice** to registered users.

---

## 13. Disclaimer of warranties

TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, NEXA PROVIDES THE SERVICE WITHOUT WARRANTIES
OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, SECURITY, ACCURACY, OR AVAILABILITY.
WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE, THAT
DEFECTS WILL BE CORRECTED, OR THAT THE SERVICE OR THE SERVERS THAT MAKE IT AVAILABLE ARE FREE OF
VIRUSES OR OTHER HARMFUL COMPONENTS.

Nothing in this section affects any mandatory statutory rights you may have under applicable
consumer protection law that cannot be excluded by contract.

---

## 14. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, NEXA AND ITS AFFILIATES, OFFICERS, DIRECTORS,
EMPLOYEES, AGENTS, AND LICENSORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, LOSS OF
PROFITS, LOSS OF REVENUE, LOSS OF GOODWILL, OR LOSS OF BUSINESS OPPORTUNITY, ARISING OUT OF OR IN
CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF
SUCH DAMAGES.

IN NO EVENT SHALL OUR TOTAL AGGREGATE LIABILITY TO YOU EXCEED THE GREATER OF: (A) THE AMOUNT YOU
PAID TO US IN THE 12 MONTHS IMMEDIATELY PRECEDING THE CLAIM; OR (B) EUR 100.

SOME JURISDICTIONS DO NOT ALLOW EXCLUSION OR LIMITATION OF IMPLIED WARRANTIES OR CONSEQUENTIAL
DAMAGES FOR CONSUMER CLAIMS; IN SUCH JURISDICTIONS OUR LIABILITY IS LIMITED TO THE MAXIMUM EXTENT
PERMITTED BY LAW.

---

## 15. Indemnification

You agree to indemnify, defend, and hold harmless NEXA and its affiliates, officers, directors,
employees, and agents from and against any and all claims, liabilities, damages, losses, costs,
and expenses (including reasonable legal fees) arising out of or relating to:

- Your use of the Service in violation of these Terms.
- Your violation of any applicable law or regulation.
- Any content you submit that infringes the rights of any third party.
- Any misrepresentation made by you in connection with the Service.

We reserve the right to assume exclusive defence and control of any matter subject to
indemnification by you, at your expense, in which case you agree to cooperate fully with us.

---

## 16. Termination

**You** may close your account at any time via **Settings → Account → Delete my account**.
Deletion is permanent and initiates data purge in accordance with our Privacy Policy.

**NEXA** may suspend or terminate your access to the Service, with or without prior notice, if we
determine in our reasonable discretion that you have:

- Violated these Terms or our Community Guidelines.
- Engaged in fraudulent, harmful, or abusive behaviour.
- Repeatedly infringed third-party intellectual property rights.
- Provided false registration information.

Upon termination, your licence to use the Service terminates immediately. Sections 7, 8, 13, 14,
15, and 17 survive termination.

---

## 17. Governing law and dispute resolution

These Terms are governed by and construed in accordance with the laws of `[[JURISDICTION]]`,
without regard to its conflict-of-law provisions.

Any dispute arising from or relating to these Terms or the Service shall be subject to the exclusive
jurisdiction of the courts of `[[JURISDICTION]]`.

**EU consumers:** Nothing in these Terms overrides mandatory consumer protection rights in your
country of residence that cannot be waived by contract. You may also use the European Commission's
Online Dispute Resolution platform: **ec.europa.eu/odr**.

**UK consumers:** The Consumer Rights Act 2015 and other applicable UK consumer law protections
apply and are not excluded by these Terms.

---

## 18. General provisions

| Provision | Details |
|-----------|---------|
| Entire agreement | These Terms, the Privacy Policy, and any supplemental terms constitute the entire agreement between you and NEXA regarding the Service. |
| Severability | If any provision is found unenforceable, the remaining provisions remain in full force. |
| No waiver | Failure to enforce any right or provision is not a waiver of that right. |
| Assignment | You may not assign your rights under these Terms without our prior written consent. We may assign ours without restriction. |
| Force majeure | Neither party is liable for delays caused by events beyond their reasonable control. |
| Language | These Terms are provided in English. Translations are for convenience only; the English version governs. |

---

## 19. Changes to these terms

We may revise these Terms at any time. For **material changes** we will provide at least **14 days'
advance notice** in-app before the revised Terms take effect. The effective date at the top of this
page indicates when the current version became effective. Your continued use of the Service after
the effective date constitutes your acceptance of the changes. If you do not agree to the revised
Terms, you must stop using the Service and delete your account before they take effect.

Every revision is committed to our public repository (`docs/legal/TERMS_OF_SERVICE.md`) so the
full audit trail is available via git history.

---

## 20. Contact

| Purpose | Contact |
|---------|---------|
| General legal questions | legal@nexa-c.com |
| Privacy & data rights | privacy@nexa-c.com |
| Security vulnerabilities | security@nexa-c.com |
| Abuse reports | abuse@nexa-c.com |
| Source code requests (AGPL §13) | source@nexa-c.com |
| Postal address | `[[POSTAL_ADDRESS]]` |
