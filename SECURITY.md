# Security Policy & Responsible Disclosure

NEXA is a security-first messenger. We welcome and reward good-faith security
research. This document is our public, machine-discoverable policy (linked from
[`/.well-known/security.txt`](https://nexa-c.com/.well-known/security.txt)).

## Reporting a vulnerability

Email **nexa@nexa-c.com** with:

- a description of the issue and its impact,
- step-by-step reproduction (PoC welcome),
- affected component / URL / commit.

We aim to:

| Stage | Target |
|-------|--------|
| Acknowledge receipt | within **72 hours** |
| Initial triage & severity | within **7 days** |
| Fix or mitigation for critical issues | within **30 days** |
| Public disclosure (coordinated) | after fix ships, by mutual agreement |

If you do not receive an acknowledgement within 72 hours, please re-send — do
not assume the report was received.

## Safe harbor

We will **not** pursue legal action or law-enforcement referral against
researchers who, in good faith:

- make a reasonable effort to avoid privacy violations, data destruction, and
  service degradation;
- only interact with accounts they own or have explicit permission to test;
- do **not** exfiltrate more data than is necessary to demonstrate the issue,
  and delete any retrieved data after reporting;
- give us a reasonable time to remediate before public disclosure;
- do not use the finding to access other users' data or for any non-research purpose.

Activity conducted consistent with this policy is considered authorized, and we
will not consider it a violation of applicable anti-hacking law.

## Scope

**In scope**

- `nexa-c.com` and its API (`/api/v1/*`), WebSocket gateway (`/api/v1/ws`).
- The web client (this repository), the backend microservices, and the
  cryptographic core once published (see `docs/security/SECURITY_ROADMAP.md`).

**Out of scope**

- Denial-of-service / volumetric attacks, traffic flooding.
- Social engineering of NEXA staff or users; physical attacks.
- Reports from automated scanners without a demonstrated, exploitable impact.
- Missing best-practice headers on endpoints that carry no sensitive data,
  absent a concrete exploit.
- Vulnerabilities in third-party infrastructure we do not control (e.g.
  Cloudflare, AWS) — report those to the respective vendor.

## Preferred disclosure

Coordinated disclosure. We will credit reporters in a published hall of fame
(opt-in) and, once a funded program launches (see roadmap Area 10), via the
HackerOne/Bugcrowd platform with monetary rewards.

## Independent Security Audit

Nexa has prepared a comprehensive audit scope document covering all E2EE
components, authentication flows, session management, and API security.

We are actively pursuing an independent third-party audit through
[OSTIF](https://ostif.org) (Open Source Technology Improvement Fund) and will
publish the full audit report when complete.

Auditors may request the current `AUDIT_SCOPE.md` by emailing security@nexa-c.com.

A detailed public security architecture document is available at:
**[nexa-c.com/security](https://nexa-c.com/security)**

## Encryption

A PGP key for encrypted reports will be published here and referenced from
`security.txt` (`Encryption:` field). Until then, request a key in your first
email and we will establish a secure channel.
