# NEXA — Terms of Service

**Effective date:** 2026-06-25 · **Version:** 1.3

Nexa ("NEXA", "we", "us", "our") operates the NEXA messenger at nexa-c.com.
By accessing or using the service you agree to these Terms and our Privacy Policy.
If you do not agree, do not create an account or use the service.

---

## 1. Acceptance of terms

These Terms of Service ("Terms") govern your access to and use of the NEXA messenger service, including the website nexa-c.com, web application, mobile applications, and desktop applications (collectively, the "Service"). By creating an account, clicking "Create account", or otherwise using the Service, you confirm that you have read, understood, and agree to be bound by these Terms and our [Privacy Policy](PRIVACY_POLICY.md).

---

## 2. Eligibility

You must be at least **16 years old** to use the Service. By registering, you represent and warrant that:

- You are at least 16 years of age.
- You have the legal capacity to enter into a binding agreement under the laws of your jurisdiction.
- Your use of the Service does not violate any applicable law or regulation.
- If registering on behalf of an organisation, you have the authority to bind that organisation to these Terms.
- You are not located in a country subject to an embargo or sanctions that would prohibit your use of the Service.

---

## 3. Account registration

To use the Service you must register an account with a valid email address and username. You agree to:

- Provide accurate, current, and complete registration information.
- Keep your registration information updated at all times.
- Maintain only one account per person or legal entity. Creating duplicate accounts to circumvent restrictions, bans, or rate limits is prohibited.
- Not register an account on behalf of another person without their explicit consent.

---

## 4. Account security and authentication

You are solely responsible for the security of your account credentials. NEXA uses Argon2id password hashing, TOTP / WebAuthn two-factor authentication, single-session enforcement, and reuse-detecting token rotation. You agree to:

- Keep your password, PIN, TOTP codes, WebAuthn keys, and all two-factor authentication credentials strictly confidential.
- Use a strong, unique password not used on any other service.
- Immediately notify us at nexa@nexa-c.com of any suspected unauthorised access to or use of your account.
- Log out of shared or public devices after each session.
- Take full responsibility for all activity that occurs under your account, whether or not authorised by you.
- Never share your account credentials with any third party.

---

## 5. Acceptable use

You agree to use the Service only for lawful purposes and in a manner that respects other users and complies with all applicable laws. You agree **not** to:

- Transmit content that is illegal, defamatory, threatening, harassing, abusive, fraudulent, obscene, or otherwise objectionable.
- Impersonate any person or entity, or misrepresent your affiliation with any person or entity.
- Send unsolicited bulk messages, spam, chain letters, or automated commercial messages.
- Distribute malware, ransomware, phishing content, exploit kits, or other malicious code.
- Attempt to access another user's account, messages, or personal data without authorisation.
- Conduct, facilitate, or assist any denial-of-service attack against the Service or its users.
- Use automated bots, scrapers, crawlers, or other automated means to access, extract, or index data from the Service without prior written consent.
- Circumvent, disable, reverse-engineer, or otherwise interfere with any security, authentication, rate-limiting, encryption, or access control feature.
- Resell, sublicense, or commercially exploit the Service without prior written consent.
- Use the Service in any way that could damage, disable, overburden, or impair our infrastructure.

---

## 6. Prohibited content

The following categories of content are **strictly prohibited**. Violations will result in immediate account termination and, where required by law, reporting to law enforcement:

| Category | Description |
|----------|-------------|
| CSAM | Child sexual abuse material, or any content that sexually exploits, endangers, or grooms minors. |
| Violence & terrorism | Content that promotes, incites, glorifies, or facilitates violence, terrorism, or mass casualty events. |
| Hate speech | Content inciting discrimination, hatred, or violence based on race, ethnicity, national origin, religion, gender, sexual orientation, disability, or other protected characteristics. |
| Non-consensual imagery | Non-consensual intimate imagery ("revenge porn") or any intimate media shared without explicit consent. |
| IP infringement | Content that infringes copyright, trademark, patent, trade secret, or other intellectual property rights. |
| Privacy violations | Personal data of third parties shared without their consent in violation of applicable privacy law. |
| Fraud | Fraudulent offers, pyramid schemes, impersonation for financial gain, or other deceptive practices. |

---

## 7. Content and intellectual property

You retain full ownership of the content you create and send through the Service. By using the Service, you grant NEXA a limited, non-exclusive, worldwide, royalty-free licence to store, transmit, route, and display your content solely as technically necessary to operate the Service and deliver your messages. This licence does **not** grant us the right to use your content for advertising, AI model training, or any purpose other than operating the Service.

You represent and warrant that: (a) you own or have all rights necessary to share the content you submit; (b) your content does not infringe any third-party rights; (c) your content complies with these Terms.

NEXA's name, logo, trademarks, and software are our exclusive property. The source code is published under AGPL-3.0; trademark and branding rights are not granted by that licence and may not be used without prior written permission.

---

## 8. Privacy

Your use of the Service is governed by our [Privacy Policy](PRIVACY_POLICY.md), which is incorporated into these Terms by reference. By using the Service you also agree to the Privacy Policy.

---

## 9. Encryption and security disclosures

We are committed to transparency about our security capabilities:

- All data is encrypted in transit using TLS 1.3 (TLS 1.2 fallback) with HSTS preload (max-age 31536000, includeSubDomains, preload).
- Text messages in direct and group conversations are end-to-end encrypted (E2EE) using ECDH P-256 + AES-256-GCM. Encryption and decryption happen exclusively on your device; our servers store ciphertext only and cannot read text message content.
- Media files (images, video, voice messages, documents) are end-to-end encrypted. Each file is encrypted client-side with a per-file random AES-256-GCM key before upload; the key is wrapped inside the encrypted message envelope. Our servers store only ciphertext and cannot access media content.
- E2EE private keys are stored per-device in your browser. Clearing browser storage or switching devices will result in loss of access to encrypted message history. There is no key backup or multi-device sync at this time.
- Both DMs and group messages have per-message forward secrecy. DMs (v5 envelope) use the Double Ratchet Algorithm: each message derives a one-time key via HMAC-SHA256; when the peer replies, a DH ratchet step regenerates the root key — giving forward secrecy and break-in recovery. Groups (v4 envelope): a fresh random AES-256-GCM key is generated per message and ECIES-wrapped individually for each member; the message key is discarded after encryption. Group chats do not yet have break-in recovery (DH ratchet) — this is on the roadmap.
- Browser-level cross-origin isolation: we apply Cross-Origin-Opener-Policy (same-origin), Cross-Origin-Resource-Policy (same-origin), and Cross-Origin-Embedder-Policy (require-corp) on all responses. This prevents cross-origin pages from accessing our window context and enables Spectre mitigations in supported browsers.
- Content Security Policy violations are automatically collected server-side via a dedicated report endpoint, enabling prompt detection and remediation.
- Screenshot and screen-recording deterrents on the web client are best-effort technical measures. Operating system-level screen capture cannot be blocked by a web application.
- Native mobile and desktop applications provide stronger OS-level screen-capture protection via FLAG_SECURE (Android) and WDA_EXCLUDEFROMCAPTURE (Windows) / NSWindowSharingNone (macOS).

We will never silently downgrade any security measure. Material changes to our security capabilities will be communicated in-app and in our public changelog.

---

## 10. Reporting violations

If you encounter content or behaviour that violates these Terms, report it via in-app reporting tools or by emailing nexa@nexa-c.com. We review all reports and may take action including content removal, account suspension, or referral to law enforcement. NEXA reserves the right to proactively moderate content where required by applicable law.

---

## 11. Service availability and modifications

The Service is provided on an "as is" and "as available" basis. We strive to maintain high availability but make no guarantee of uninterrupted or error-free service. We reserve the right to:

- Modify, update, or discontinue any feature or part of the Service at any time.
- Perform scheduled or emergency maintenance that may temporarily interrupt availability.
- Impose reasonable usage, storage, or rate limits to protect the integrity of the Service.
- Permanently discontinue the Service with at least **90 days' notice** to registered users.

---

## 12. Disclaimer of warranties

TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, NEXA PROVIDES THE SERVICE WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, SECURITY, ACCURACY, OR AVAILABILITY. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE.

Nothing in this section affects any mandatory statutory rights you may have under applicable consumer protection law.

---

## 13. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, NEXA AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, AND LICENSORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, LOSS OF PROFITS, LOSS OF REVENUE, OR LOSS OF GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE.

IN NO EVENT SHALL OUR TOTAL AGGREGATE LIABILITY TO YOU EXCEED THE GREATER OF: (A) THE AMOUNT YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM; OR (B) EUR 100.

Some jurisdictions do not allow exclusion or limitation of implied warranties or consequential damages for consumer claims; in such jurisdictions our liability is limited to the maximum extent permitted by law.

---

## 14. Indemnification

You agree to indemnify, defend, and hold harmless NEXA and its affiliates, officers, directors, employees, and agents from and against any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable legal fees) arising out of or relating to: (a) your use of the Service in violation of these Terms; (b) your violation of any applicable law or regulation; (c) any content you submit that infringes the rights of any third party; or (d) any misrepresentation made by you in connection with the Service.

---

## 15. Termination

**You** may close your account at any time via **Settings → Account → Delete my account**. Deletion is permanent and initiates data purge per our Privacy Policy.

**NEXA** may suspend or terminate your access, with or without prior notice, if we determine in our reasonable discretion that you have: violated these Terms; engaged in fraudulent, harmful, or abusive behaviour; repeatedly infringed third-party intellectual property rights; or provided false registration information.

Upon termination, your licence to use the Service terminates immediately. Sections 7, 12, 13, 14, and 17 survive termination.

---

## 16. Governing law and disputes

These Terms are governed by the laws of California, United States, without regard to its conflict-of-law provisions. Any dispute arising from or relating to these Terms or the Service shall be subject to the exclusive jurisdiction of the courts of California, United States.

**EU consumers:** nothing in these Terms overrides mandatory consumer protection rights in your country of residence; you may also use the EU Online Dispute Resolution platform at ec.europa.eu/odr.

**UK consumers:** the Consumer Rights Act 2015 and other applicable UK consumer law protections apply.

---

## 17. Changes to these terms

We may revise these Terms at any time. For material changes we will provide at least **14 days' advance notice** in-app before the revised Terms take effect. The effective date at the top of this page indicates when the current version became effective. Your continued use of the Service after the effective date constitutes acceptance. Every revision is committed to our public repository (`docs/legal/TERMS_OF_SERVICE.md`) so the full audit trail is available via git history.

---

## 18. General

These Terms, together with the Privacy Policy, constitute the entire agreement between you and NEXA relating to the Service. If any provision is found unenforceable, the remaining provisions remain in full force. Our failure to enforce any right or provision is not a waiver of that right. You may not assign your rights under these Terms without our prior written consent. We may assign ours without restriction.

---

## 19. Contact

| Purpose | Contact |
|---------|---------|
| General legal questions | nexa@nexa-c.com |
| Privacy & data rights | nexa@nexa-c.com |
| Security vulnerabilities | nexa@nexa-c.com |
| Abuse reports | nexa@nexa-c.com |
| Source code requests (AGPL §13) | nexa@nexa-c.com |
