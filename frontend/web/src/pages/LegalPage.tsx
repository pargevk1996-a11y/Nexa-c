import { Link } from "react-router-dom";
import { BRAND_NAME } from "@/config/brand";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

type LegalKind = "privacy" | "terms" | "license";

interface LegalSection {
  h: string;
  p: string;
  items?: string[];
}

interface LegalDoc {
  title: string;
  effective?: string;
  version?: string;
  intro: string;
  sections: LegalSection[];
}

const COPY: Record<LegalKind, LegalDoc> = {
  privacy: {
    title: "Privacy Policy",
    effective: "2026-06-25",
    version: "1.5",
    intro: `${BRAND_NAME} is built privacy-first. This policy explains in full detail what personal data we collect, why we collect it, how we protect it, and what rights you have over it. We operate under EU GDPR and California CCPA/CPRA.`,
    sections: [
      {
        h: "1. Who is the data controller",
        p: `${BRAND_NAME} messenger (nexa-c.com) is operated by Nexa, United States. For all data protection and privacy inquiries, contact our Data Protection Officer (DPO) at nexa@nexa-c.com. EU residents may also contact the supervisory authority for their member state; California residents may file a complaint with the California Attorney General (oag.ca.gov).`,
      },
      {
        h: "2. Data we collect",
        p: "We collect the minimum data required to operate a secure messaging service. The categories are:",
        items: [
          "Account identity: email address, username, and an Argon2id-hashed password. Your plaintext password is never stored or transmitted in clear.",
          "Optional profile: display name, avatar image, biography text, and a public status message.",
          "Optional phone number: collected only if you choose to enable two-factor authentication (TOTP or SMS). A phone number is not required to register or use the service.",
          "Session and security data: session tokens stored as SHA-256 hashes only (raw tokens are never persisted), a truncated salted hash of your IP address (raw IP is never logged), device label, and user-agent string used for trusted device management.",
          "Social graph: your contact list, pending or accepted contact requests, and any accounts you have blocked.",
          "Message content: message bodies, media files, reactions, read receipts, and delivery status — required to deliver your messages to their intended recipients.",
          "Push notification tokens: device push tokens collected only when you explicitly enable notifications. Removed immediately when you disable notifications or delete your account.",
          "Security telemetry: anonymised event records of screenshot-blocking triggers and security alerts. These records contain no message content and are used solely for abuse detection.",
        ],
      },
      {
        h: "3. Data we do NOT collect",
        p: "We explicitly do not collect or store:",
        items: [
          "Raw IP addresses — only a truncated salted hash retained for a maximum of 90 days for abuse detection.",
          "Advertising identifiers, behavioural profiles, cross-site tracking data, or any form of interest-based profiling.",
          "Data for advertising, sale, or transfer to data brokers — ever.",
          "Children's personal data — the service is not directed to users under 16.",
          "Biometric data beyond the optional WebAuthn public key stored on your device.",
          "Location data — we do not request or store GPS or cell-tower location.",
        ],
      },
      {
        h: "4. Legal basis for processing (GDPR Art. 6)",
        p: "Where GDPR applies, we process your personal data under the following legal bases:",
        items: [
          "Contract (Art. 6(1)(b)): account creation and authentication, message delivery, contact management, session management.",
          "Legitimate interest (Art. 6(1)(f)): security monitoring, abuse and fraud detection, hashed-IP audit logging. We have conducted a balancing test; these interests do not override your fundamental rights.",
          "Consent (Art. 6(1)(a)): optional phone number for two-factor authentication, push notification tokens, optional profile fields. You may withdraw consent at any time in Settings.",
          "Legal obligation (Art. 6(1)(c)): retaining data required by applicable law (e.g., financial records, lawful authority requests).",
        ],
      },
      {
        h: "5. Message encryption and server access",
        p: `All message content and media files in both direct and group conversations are end-to-end encrypted (E2EE) with per-message forward secrecy and break-in recovery for DMs. Direct messages (v5 envelope) use the Double Ratchet Algorithm: each message advances a symmetric chain key (HMAC-SHA256), and when the peer replies a DH ratchet step refreshes the root key — giving both forward secrecy (past messages are safe after compromise) and break-in recovery (the session self-heals after one round-trip). Group messages (v4 envelope) use per-message multi-recipient ECIES: a random AES-256-GCM key is generated for each message, then individually ECIES-wrapped for every group member; the message key is discarded after encryption, giving equivalent per-message forward secrecy as DMs. Media files (images, video, voice messages, documents) are encrypted client-side with a separate per-file random AES-256-GCM key before upload; the file key is carried inside the encrypted message envelope and can only be recovered by conversation participants. Encryption and decryption happen exclusively on your device; ${BRAND_NAME} servers store only ciphertext and cannot read your messages or media. We commit to: (a) never accessing message or media content except under lawful legal compulsion; (b) publishing a transparency report for any such requests; and (c) never silently downgrading encryption. Current limitations: private keys are per-device and per-browser (clearing browser storage loses access to encrypted history); group chats have no break-in recovery (DMs do); no multi-device key synchronisation. The full technical architecture, threat model, and upgrade roadmap are published at /docs/security.`,
      },
      {
        h: "6. How we use your data",
        p: "Your personal data is used exclusively to:",
        items: [
          "Authenticate you and maintain your session securely across devices.",
          "Deliver messages, media, and notifications to your intended recipients.",
          "Display your online/offline presence and profile information to your contacts.",
          "Detect and prevent abuse, spam, account takeover, and other fraudulent activity.",
          "Send security alerts for events such as new device logins or failed authentication attempts.",
          "Deliver push notifications when you have explicitly enabled them.",
          "Fulfil lawful legal obligations and respond to lawful authority requests.",
        ],
      },
      {
        h: "7. Data retention",
        p: `We retain personal data only as long as necessary for the purpose collected. On account deletion: profile, contacts, messages, media, session tokens, and push tokens are purged within 30 days. Session tokens are invalidated immediately on deletion request. Hashed audit-log entries are retained for 90 days, then automatically deleted. Backups containing your data are overwritten within 30 days of deletion. We retain data longer only where required by applicable law (e.g., financial or legal record-keeping obligations).`,
      },
      {
        h: "8. Sharing with third parties",
        p: "We share your data only with the sub-processors required to operate the service, under contractual data processing agreements:",
        items: [
          "Amazon Web Services, Inc. (USA, region us-west-1): cloud infrastructure, compute, and object storage. AWS provides infrastructure only and has no access to message content.",
          "Cloudflare, Inc. (USA / global): edge TLS termination, CDN, and DDoS mitigation. Cloudflare may see encrypted traffic metadata but not content.",
          "Resend, Inc. (USA): transactional email delivery for account verification, password reset, and security alerts.",
        ],
      },
      {
        h: "9. International data transfers",
        p: "If you are located in the European Economic Area (EEA) or United Kingdom, your data may be transferred to countries outside the EEA, including the United States. We rely on Standard Contractual Clauses (SCCs) approved by the European Commission (Decision 2021/914) as the legal mechanism for such transfers. Transfer Impact Assessments are available on request at nexa@nexa-c.com.",
      },
      {
        h: "10. Cookies and local storage",
        p: `${BRAND_NAME} uses the following storage mechanisms:`,
        items: [
          "HttpOnly, Secure, SameSite=Strict cookies: encrypted AES-GCM access token and HttpOnly refresh token. These are strictly necessary and cannot be disabled.",
          "CSRF token cookie: prevents cross-site request forgery. Strictly necessary.",
          "localStorage / sessionStorage: UI preferences (theme, sidebar state), draft message content. No personal identifiers, no third-party access.",
          "No third-party cookies. No advertising cookies. No analytics tracking. Authentication and messaging pages make zero third-party requests — verifiable in DevTools → Network.",
        ],
      },
      {
        h: "11. Your rights",
        p: "Under GDPR (EEA and UK) and CCPA/CPRA (California) you have the following rights. To exercise any right, use the self-service tools in Settings or email nexa@nexa-c.com. We respond within 30 days (GDPR) / 45 days (CCPA).",
        items: [
          "Right of access: request a copy of the personal data we hold about you.",
          "Right to rectification: correct inaccurate or incomplete data.",
          "Right to erasure ('right to be forgotten'): request deletion of your account and all associated data. Self-service: Settings → Account → Delete my account.",
          "Right to restriction: ask us to restrict processing while a dispute is resolved.",
          "Right to data portability: receive your data in a structured, machine-readable format. To request a data export, email nexa@nexa-c.com.",
          "Right to object: object to processing based on legitimate interest.",
          "Right to withdraw consent: for processing based on consent (e.g., push tokens, optional phone number), withdraw at any time in Settings without affecting prior lawful processing.",
          "Right not to be subject to solely automated decision-making: we do not use automated profiling for consequential decisions.",
          "CCPA right to opt-out of sale: we do not sell personal information.",
          "CCPA right to non-discrimination: exercising your privacy rights will not result in denial of service.",
          "Right to lodge a complaint: with your national data protection authority (EU) or the California Attorney General (CA).",
        ],
      },
      {
        h: "12. Screenshot and screen-recording protection — consent",
        p: `${BRAND_NAME} activates technical measures to protect the confidentiality of your private conversations from being captured by screenshots or screen recordings. By accepting these measures during registration, you explicitly consent to the following:`,
        items: [
          "Browser-level interception: we intercept and block keyboard shortcuts and browser APIs commonly used to take screenshots or initiate screen recordings (e.g. PrintScreen, Win+Shift+S, Cmd+Shift+4, Ctrl+Shift+S, and recording hotkeys on all major operating systems and browsers).",
          "Keyboard Lock API: in supported browsers (Chromium-based) we request the Keyboard Lock API to suppress OS-level screenshot keys when the app is in full-screen or focus mode.",
          "Clipboard and drag protection: we block copy, cut, drag, and context-menu actions on message content to prevent indirect capture.",
          "Visibility blackout: when the app loses focus or is backgrounded, a privacy seal is applied instantly to prevent thumbnail capture in the OS task-switcher.",
          "OS-level protection on native apps: on Android the FLAG_SECURE window flag is set, preventing screenshots via both the Android system and third-party screen-capture apps. On macOS and Windows the Tauri desktop app applies NSWindowSharingNone / WDA_EXCLUDEFROMCAPTURE at OS level.",
          "Security telemetry: detected capture attempts are logged as anonymised events (no message content) and sent to our servers for abuse detection as described in section 2.",
          "Limitations: web-browser screen capture initiated via OS menus, hardware buttons, or external tools operating outside the browser process cannot be blocked. Native apps provide stronger protection. By consenting you acknowledge these technical limitations.",
          "Legal basis: your explicit consent at registration is the legal basis (GDPR Art. 6(1)(a)) for activating these measures. You may withdraw consent by deleting your account; continued use of the service after account creation constitutes ongoing consent to these measures being active.",
        ],
      },
      {
        h: "13. General security measures",
        p: "Our technical and organisational security measures include: TLS 1.3 (TLS 1.2 fallback) with HSTS preload (max-age 31536000, includeSubDomains, preload), strict Content Security Policy with no unsafe-inline or eval for scripts and SHA-256-hashed inline scripts only, CSP violation reporting (violations are automatically collected server-side for abuse detection), Cross-Origin-Opener-Policy (same-origin — prevents cross-origin windows from accessing our window object), Cross-Origin-Resource-Policy (same-origin — blocks cross-origin hotlinking of our assets), Cross-Origin-Embedder-Policy (require-corp — full cross-origin isolation; all fonts and assets are self-hosted to make this safe), HttpOnly + Secure + SameSite=Strict cookies, AES-GCM encrypted access-token cookies, Argon2id password hashing (memory 64 MB, 3 iterations), truncated-and-hashed (not raw) IP storage, per-service database isolation, brute-force rate limiting on all authentication endpoints, CSRF double-submit cookie protection, optional TOTP 2FA, end-to-end encryption of all messages and media files with per-message forward secrecy (DMs: Double Ratchet Algorithm v5; groups: per-message multi-recipient ECIES v4; media: per-file AES-256-GCM key in encrypted envelope), screenshot and screen-recording deterrents on web and native clients, and single-session enforcement with reuse-detection token rotation. See /docs/security for the full technical architecture.",
      },
      {
        h: "15. Children's privacy",
        p: `${BRAND_NAME} is not directed to children under 16. We do not knowingly collect personal data from children under 16. If you believe a child under 16 has created an account, contact nexa@nexa-c.com immediately and we will delete the account and all associated data without delay.`,
      },
      {
        h: "16. Changes to this policy",
        p: "We may update this Privacy Policy from time to time. For material changes, we will provide at least 14 days' advance notice in-app before the new version takes effect. Every revision is committed to our public repository (docs/legal/PRIVACY_POLICY.md) so the full audit trail is available via git history. The effective date at the top of this page indicates when the current version became effective. Continued use of the service after the effective date of a revised policy constitutes your acceptance of the changes.",
      },
      {
        h: "17. Contact",
        p: "Data Protection Officer: nexa@nexa-c.com. For EU supervisory authority contacts: edpb.europa.eu/about-edpb/board/members_en. For California residents: oag.ca.gov/privacy.",
      },
    ],
  },

  terms: {
    title: "Terms of Service",
    effective: "2026-06-25",
    version: "1.3",
    intro: `By accessing or using ${BRAND_NAME} messenger you agree to be bound by these Terms of Service and our Privacy Policy. Please read them carefully before using the service. If you do not agree, do not create an account or use the service.`,
    sections: [
      {
        h: "1. Acceptance of terms",
        p: `These Terms of Service ("Terms") govern your access to and use of the ${BRAND_NAME} messenger service, including the website nexa-c.com, web application, mobile applications, and desktop applications (collectively, the "Service"), operated by Nexa ("${BRAND_NAME}", "we", "us", "our"). By creating an account, clicking "Create account", or otherwise using the Service, you confirm that you have read, understood, and agree to be bound by these Terms and our Privacy Policy.`,
      },
      {
        h: "2. Eligibility",
        p: "You must be at least 16 years old to use the Service. By registering, you represent and warrant that:",
        items: [
          "You are at least 16 years of age.",
          "You have the legal capacity to enter into a binding agreement under the laws of your jurisdiction.",
          "Your use of the Service does not violate any applicable law or regulation.",
          "If you are registering on behalf of an organisation, you have the authority to bind that organisation to these Terms.",
          "You are not located in a country subject to an embargo or sanctions that would prohibit your use of the Service.",
        ],
      },
      {
        h: "3. Account registration",
        p: "To use the Service you must register an account with a valid email address and username. You agree to:",
        items: [
          "Provide accurate, current, and complete registration information.",
          "Keep your registration information updated at all times.",
          "Maintain only one account per person or legal entity. Creating duplicate accounts to circumvent restrictions, bans, or rate limits is prohibited.",
          "Not register an account on behalf of another person without their explicit consent.",
        ],
      },
      {
        h: "4. Account security and authentication",
        p: "You are solely responsible for the security of your account. You agree to:",
        items: [
          "Keep your password, PIN, TOTP codes, and two-factor authentication credentials strictly confidential.",
          "Use a strong, unique password not used on any other service.",
          "Immediately notify us at nexa@nexa-c.com of any suspected unauthorised access to or use of your account.",
          "Log out of shared or public devices after each session.",
          "Take responsibility for all activity that occurs under your account, whether or not authorised by you.",
          "Not share your account credentials with any third party.",
        ],
      },
      {
        h: "5. Acceptable use",
        p: "You agree to use the Service only for lawful purposes and in a manner that respects other users and complies with all applicable laws. You agree not to:",
        items: [
          "Use the Service to transmit any content that is illegal, defamatory, threatening, harassing, abusive, fraudulent, obscene, or otherwise objectionable.",
          "Impersonate any person or entity, or misrepresent your affiliation with any person or entity.",
          "Send unsolicited bulk messages, spam, chain letters, or automated commercial messages.",
          "Use the Service to distribute malware, ransomware, phishing content, or other malicious code.",
          "Attempt to access another user's account, messages, or personal data without authorisation.",
          "Conduct, facilitate, or assist any denial-of-service attack against the Service or its users.",
          "Use automated bots, scrapers, crawlers, or other automated means to access, extract, or index data from the Service.",
          "Circumvent, disable, reverse-engineer, or otherwise interfere with any security, authentication, rate-limiting, or access control feature.",
          "Resell, sublicense, or commercially exploit the Service without our prior written consent.",
          "Use the Service in any way that could damage, disable, overburden, or impair our infrastructure.",
        ],
      },
      {
        h: "6. Prohibited content",
        p: "The following categories of content are strictly prohibited on the Service. Violation may result in immediate account termination and report to law enforcement:",
        items: [
          "Child sexual abuse material (CSAM) or any content that sexually exploits, endangers, or grooms minors.",
          "Content that promotes, incites, glorifies, or facilitates violence, terrorism, or hate crimes.",
          "Content that incites discrimination, hatred, or violence based on race, ethnicity, national origin, religion, gender, sexual orientation, disability, or other protected characteristics.",
          "Non-consensual intimate imagery ('revenge porn') or any intimate images shared without the depicted person's explicit consent.",
          "Content that infringes the copyright, trademark, patent, trade secret, or other intellectual property rights of any party.",
          "Personal data of third parties shared without their consent in violation of applicable privacy law.",
          "Fraudulent offers, pyramid schemes, or other deceptive commercial practices.",
        ],
      },
      {
        h: "7. Content and intellectual property",
        p: `You retain full ownership of the content you create and send through the Service. By using the Service, you grant ${BRAND_NAME} a limited, non-exclusive, worldwide, royalty-free licence to store, transmit, route, and display your content solely as technically necessary to operate the Service and deliver your messages. This licence does not grant us the right to use your content for advertising, training AI models, or any purpose other than operating the Service. You represent and warrant that: (a) you own or have all rights necessary to share the content you submit; (b) your content does not infringe any third-party rights; and (c) your content complies with these Terms. ${BRAND_NAME}'s name, logo, trademarks, and software are our exclusive property and may not be used without prior written permission.`,
      },
      {
        h: "8. Privacy",
        p: "Your use of the Service is governed by our Privacy Policy, which is incorporated into these Terms by reference. Our Privacy Policy explains what data we collect, why, how we protect it, and your rights over it. By using the Service you also agree to the Privacy Policy.",
      },
      {
        h: "9. Encryption and security disclosures",
        p: "We are committed to transparency about our security capabilities:",
        items: [
          "All data is encrypted in transit using TLS 1.3 (TLS 1.2 fallback) with HSTS preload (max-age 31536000, includeSubDomains, preload).",
          "Text messages in direct and group conversations are end-to-end encrypted (E2EE) using ECDH P-256 + AES-256-GCM. Encryption and decryption happen exclusively on your device; our servers store ciphertext only and cannot read text message content.",
          "Media files (images, video, voice messages, documents) are end-to-end encrypted. Each file is encrypted client-side with a per-file random AES-256-GCM key before upload; the key is wrapped inside the message envelope, encrypted with the conversation key. Our servers store and transmit only ciphertext and cannot access media content.",
          "E2EE private keys are stored per-device in your browser. Clearing browser storage or switching devices will result in loss of access to your encrypted message history. There is no key backup or multi-device sync at this time.",
          "Both DMs and group messages have per-message forward secrecy. DMs (v5 envelope) use the Double Ratchet Algorithm: each message derives a one-time key via HMAC-SHA256; when the peer replies, a DH ratchet step regenerates the root key — giving forward secrecy and break-in recovery (session self-heals after one round-trip). Groups (v4 envelope): a fresh random AES-256-GCM key is generated per message and ECIES-wrapped individually for each member; the message key is discarded after encryption, giving the same per-message forward secrecy as DMs. Group chats do not yet have break-in recovery (DH ratchet) — if a device key is actively compromised mid-session, future group messages in that session may be exposed until the device is replaced. Group break-in recovery (Sender Keys) is on the roadmap.",
          "Browser-level cross-origin isolation: we apply Cross-Origin-Opener-Policy (same-origin), Cross-Origin-Resource-Policy (same-origin), and Cross-Origin-Embedder-Policy (require-corp) on all responses. This prevents cross-origin pages from accessing our window context and enables Spectre mitigations in supported browsers.",
          "Content Security Policy violations are automatically collected server-side via a dedicated report endpoint, so policy violations are detected and remediated promptly.",
          "Screenshot and screen-recording deterrents on the web client are best-effort technical measures. Operating system-level screen capture cannot be blocked by a web application; users should be aware of this limitation.",
          "Native mobile and desktop applications provide stronger OS-level screen-capture protection.",
        ],
      },
      {
        h: "10. Reporting violations",
        p: `If you encounter content or behaviour that violates these Terms, you may report it via in-app reporting tools or by emailing nexa@nexa-c.com. We review all reports and will take appropriate action, which may include content removal, account suspension, or referral to law enforcement. ${BRAND_NAME} reserves the right to proactively moderate content where required by applicable law.`,
      },
      {
        h: "11. Service availability and modifications",
        p: `The Service is provided on an "as is" and "as available" basis. We strive to maintain high availability but do not guarantee uninterrupted, error-free, or loss-free service. We reserve the right to:`,
        items: [
          "Modify, update, or discontinue any feature or part of the Service at any time.",
          "Perform scheduled or emergency maintenance that may temporarily interrupt availability.",
          "Impose reasonable limits on usage, storage, or message volume to protect the integrity of the Service.",
          "Permanently discontinue the Service with at least 90 days' notice to registered users.",
        ],
      },
      {
        h: "12. Disclaimer of warranties",
        p: `TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, ${BRAND_NAME.toUpperCase()} PROVIDES THE SERVICE WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, SECURITY, ACCURACY, OR AVAILABILITY. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE, THAT DEFECTS WILL BE CORRECTED, OR THAT THE SERVICE OR THE SERVERS THAT MAKE IT AVAILABLE ARE FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.`,
      },
      {
        h: "13. Limitation of liability",
        p: `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ${BRAND_NAME.toUpperCase()} AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, AND LICENSORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, LOSS OF PROFITS, LOSS OF REVENUE, LOSS OF GOODWILL, OR LOSS OF BUSINESS OPPORTUNITY, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES AND EVEN IF A REMEDY FAILS OF ITS ESSENTIAL PURPOSE. IN NO EVENT SHALL OUR TOTAL AGGREGATE LIABILITY TO YOU EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM, OR (B) EUR 100. SOME JURISDICTIONS DO NOT ALLOW LIMITATION OF LIABILITY FOR CONSUMER CLAIMS; IN SUCH JURISDICTIONS, OUR LIABILITY IS LIMITED TO THE MAXIMUM EXTENT PERMITTED BY LAW.`,
      },
      {
        h: "14. Indemnification",
        p: `You agree to indemnify, defend, and hold harmless ${BRAND_NAME} and its affiliates, officers, directors, employees, and agents from and against any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable legal fees) arising out of or relating to: (a) your use of the Service; (b) your violation of these Terms; (c) your violation of any applicable law or regulation; or (d) any content you submit that infringes the rights of any third party. We reserve the right to assume exclusive defence and control of any matter subject to indemnification by you, at your expense.`,
      },
      {
        h: "15. Termination",
        p: "Either party may terminate your access to the Service:",
        items: [
          "You may close your account at any time via Settings → Account → Delete my account. Deletion is permanent and initiates data purge per our Privacy Policy.",
          `${BRAND_NAME} may suspend or terminate your account, with or without notice, if we determine you have violated these Terms, engaged in fraudulent or harmful behaviour, or for any other lawful reason.`,
          "Upon termination, your licence to use the Service terminates immediately. Sections 7, 12, 13, 14, and 16 survive termination.",
          `We will not refund any fees paid for the period after termination unless required by applicable law.`,
        ],
      },
      {
        h: "16. Governing law and disputes",
        p: `These Terms are governed by the laws of California, United States, without regard to its conflict-of-law rules. Any dispute arising from or relating to these Terms or the Service shall be subject to the exclusive jurisdiction of the courts of California, United States. For consumers in the EU: nothing in these Terms overrides mandatory consumer protection rights in your country of residence; you may also use the EU Online Dispute Resolution platform at ec.europa.eu/odr. For consumers in the UK: the Consumer Rights Act 2015 and other applicable UK consumer law protections apply.`,
      },
      {
        h: "17. Changes to these terms",
        p: "We may revise these Terms at any time. For material changes we will provide at least 14 days' advance notice in-app before the revised Terms take effect. The date of the most recent revision appears at the top of this page. Your continued use of the Service after the effective date of any revised Terms constitutes your acceptance of the changes. If you do not agree to the revised Terms, you must stop using the Service and delete your account before they take effect.",
      },
      {
        h: "18. General",
        p: "These Terms, together with the Privacy Policy and any additional terms you agree to in connection with specific features, constitute the entire agreement between you and NEXA relating to the Service. If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force. Our failure to enforce any right or provision is not a waiver of that right. You may not assign your rights or obligations under these Terms without our prior written consent. We may assign our rights and obligations without restriction.",
      },
      {
        h: "19. Contact",
        p: "For questions about these Terms: nexa@nexa-c.com. For security issues: nexa@nexa-c.com. For abuse reports: nexa@nexa-c.com.",
      },
    ],
  },

  license: {
    title: "Open Source License",
    intro: `${BRAND_NAME} is free software. The source code is published under the GNU Affero General Public License v3.0 (AGPL-3.0), which guarantees your freedom to study, modify, and redistribute the software. This page provides the Appropriate Legal Notices required by Section 0 of the AGPL-3.0.`,
    sections: [
      {
        h: "Copyright notice",
        p: `Copyright © 2026 ${BRAND_NAME}. All rights reserved by respective contributors. This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.`,
      },
      {
        h: "No warranty (AGPL §15–16)",
        p: "This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. To the extent permitted by applicable law, the authors and contributors provide the program as-is, without any warranty of any kind, either express or implied. The entire risk as to the quality and performance of the program is with you. Should the program prove defective, you assume the cost of all necessary servicing, repair, or correction.",
      },
      {
        h: "Network use and source code (AGPL §13)",
        p: "In accordance with Section 13 of the GNU Affero General Public License, users who interact with this software remotely through a computer network are offered the opportunity to receive a copy of the corresponding source code. The source code is available at https://github.com/pargevk1996-a11y/Nexa-c. If you have difficulty accessing the repository, you may request a copy by emailing nexa@nexa-c.com.",
      },
      {
        h: "Full license text",
        p: "The complete text of the GNU Affero General Public License v3.0 is available at gnu.org/licenses/agpl-3.0.html and is also included in the root of the source repository in the file named LICENSE.",
      },
      {
        h: "Third-party software",
        p: "This software incorporates open-source components from third parties, each governed by their own license. All third-party licenses are compatible with AGPL-3.0 for their inclusion in this project. A full list of dependencies and their licenses is maintained in the project repository.",
      },
      {
        h: "Trademarks",
        p: `The name "${BRAND_NAME}", the ${BRAND_NAME} logo, and associated branding are trademarks of Nexa. The AGPL-3.0 license does not grant permission to use these trademarks. You may use the source code under the AGPL-3.0, but distribution of modified versions must not use the ${BRAND_NAME} name or logo in a way that implies endorsement or association with the original authors.`,
      },
    ],
  },
};

export function LegalPage({ kind }: { kind: LegalKind }) {
  const copy = COPY[kind];
  useDocumentTitle(copy.title);

  return (
    <main className="legal-page">
      <article className="legal-page__card">
        <h1>{copy.title}</h1>
        {(copy.effective || copy.version) && (
          <p className="legal-page__meta">
            {copy.effective && (
              <>
                Effective: <time dateTime={copy.effective}>{copy.effective}</time>
              </>
            )}
            {copy.version && <> · Version {copy.version}</>}
          </p>
        )}
        <p className="legal-page__intro">{copy.intro}</p>
        {copy.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            <p>{s.p}</p>
            {s.items && (
              <ul className="legal-page__list">
                {s.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <p className="legal-page__back">
          <Link to="/">← Back to {BRAND_NAME}</Link>
        </p>
      </article>
    </main>
  );
}
