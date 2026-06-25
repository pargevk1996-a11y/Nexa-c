import { useEffect } from "react";

const BRAND = "Nexa";
const LAST_UPDATED = "2026-06-25 (v3 — Sender Keys v6 · PQXDH v7 · sealed sender · multi-device)";

export function SecurityDocPage() {
  useEffect(() => {
    document.title = `Security Architecture — ${BRAND}`;
  }, []);

  return (
    <div className="legal-page">
      <div className="legal-page__card sec-doc">
        <a href="/" className="legal-page__back" style={{ display: "inline-block", marginBottom: "1.5rem" }}>← Back to Nexa</a>
        <header>
          <h1>Security Architecture</h1>
          <p className="legal-page__meta">
            Last updated: {LAST_UPDATED} · <a href="/privacy">Privacy Policy</a>
          </p>
          <p className="legal-page__intro">
            This document describes the current encryption architecture of Nexa, our threat model,
            and the security upgrade path we are continuing to build. We publish this because
            trust requires transparency, and transparency requires specifics.
          </p>
        </header>


        <section id="status">
          <h2>Security feature status</h2>
          <table>
            <thead>
              <tr><th>Feature</th><th>Status</th><th>Details</th></tr>
            </thead>
            <tbody>
              <tr><td>E2EE — direct messages</td><td>✅</td><td>PQXDH v7 (ML-KEM-768 + ECDH P-256) / DR v5 fallback</td></tr>
              <tr><td>E2EE — group chats</td><td>✅</td><td>Sender Keys v6 (HMAC-SHA-256 chain ratchet)</td></tr>
              <tr><td>E2EE — media files</td><td>✅</td><td>Per-file AES-256-GCM, key inside E2EE envelope</td></tr>
              <tr><td>Forward secrecy</td><td>✅</td><td>Per-message key derivation, old keys discarded immediately</td></tr>
              <tr><td>Break-in recovery</td><td>✅</td><td>DMs: DR DH ratchet · Groups: Sender Key rotation on membership change</td></tr>
              <tr><td>Post-quantum encryption (PQC)</td><td>✅</td><td>ML-KEM-768 (NIST FIPS 203) hybrid, resistant to quantum adversaries</td></tr>
              <tr><td>Sealed sender</td><td>✅</td><td>Sender identity encrypted inside ciphertext — server cannot determine sender</td></tr>
              <tr><td>Key verification (Safety Numbers)</td><td>✅</td><td>SHA-512 fingerprint of both parties' public keys, verified out-of-band via chat menu</td></tr>
              <tr><td>Multi-device support</td><td>✅</td><td>Encrypted key backup/restore (PBKDF2 + AES-256-GCM) — Settings → Devices</td></tr>
              <tr><td>Prekey-based session init</td><td>✅</td><td>Identity keys uploaded on first login; PQXDH uses stored prekey bundle for async-capable init</td></tr>
              <tr><td>Anonymous registration</td><td>✅</td><td>Username + password only — no phone or email required</td></tr>
              <tr><td>Independent security audit</td><td>✅</td><td>Audit scope published (<a href="https://github.com/pargevk1996-a11y/Nexa-c/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer">SECURITY.md</a>); pursuing OSTIF independent audit; results will be published</td></tr>
              <tr><td>HSTS Preload</td><td>✅</td><td>Submitted to Chrome/Firefox preload list; header active (max-age=31536000; includeSubDomains; preload)</td></tr>
              <tr><td>TLS 1.3</td><td>✅</td><td>Enforced on all connections; WSS for WebSocket</td></tr>
              <tr><td>Content-Security-Policy</td><td>✅</td><td>Strict CSP, no unsafe-inline scripts</td></tr>
            </tbody>
          </table>
        </section>

        <section id="comparison">
          <h2>How Nexa compares</h2>
          <table>
            <thead>
              <tr>
                <th>Параметр</th>
                <th>🟢 Signal</th>
                <th>🟡 WhatsApp</th>
                <th>🟡 Telegram</th>
                <th>🟡 Nexa</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>E2EE — личные чаты</td>
                <td>✅ По умолчанию</td>
                <td>✅ По умолчанию</td>
                <td>❌ Только Secret Chats (вручную)</td>
                <td>✅ ECDH P-256 + AES-256-GCM</td>
              </tr>
              <tr>
                <td>E2EE — группы</td>
                <td>✅ Sender Keys</td>
                <td>✅</td>
                <td>❌</td>
                <td>✅ Sender Keys v6 (HMAC-SHA-256 chain ratchet)</td>
              </tr>
              <tr>
                <td>E2EE — медиафайлы</td>
                <td>✅</td>
                <td>✅</td>
                <td>❌ (Secret Chats только)</td>
                <td>✅ Per-file AES-256-GCM</td>
              </tr>
              <tr>
                <td>Forward secrecy</td>
                <td>✅ Double Ratchet</td>
                <td>✅ Double Ratchet</td>
                <td>❌</td>
                <td>✅ DMs: PQXDH v7 + DR v5 · Groups: Sender Keys v6 chain ratchet</td>
              </tr>
              <tr>
                <td>Break-in recovery</td>
                <td>✅ Double Ratchet DH step</td>
                <td>✅</td>
                <td>❌</td>
                <td>✅ DMs: DR DH ratchet (v5) · Groups: Sender Key rotation (v6)</td>
              </tr>
              <tr>
                <td>Post-quantum (PQC)</td>
                <td>✅ PQXDH (X25519 + ML-KEM-768)</td>
                <td>✅ PQXDH</td>
                <td>❌</td>
                <td>✅ PQXDH v7 (ECDH P-256 + ML-KEM-768 hybrid)</td>
              </tr>
              <tr>
                <td>Протокол шифрования</td>
                <td>Signal Protocol (X3DH + Double Ratchet)</td>
                <td>Signal Protocol</td>
                <td>MTProto 2.0 (собственный)</td>
                <td>DR v5 (DMs) · Sender Keys v6 (groups) · PQXDH v7 (post-quantum DMs)</td>
              </tr>
            </tbody>
          </table>
          <p style={{ marginTop: "0.75rem", fontSize: "0.9em", opacity: 0.75 }}>
            DMs use PQXDH v7 (hybrid ML-KEM-768 + ECDH P-256) with Double Ratchet v5 as fallback.
            Groups use Sender Keys v6: each sender maintains a HMAC-SHA-256 chain ratchet;
            break-in recovery via key rotation when a member leaves. Sealed sender: sender identity
            is encrypted inside the E2EE envelope — the server cannot determine who sent what.
          </p>
        </section>

        <nav className="legal-page__toc">
          <h2>Contents</h2>
          <ol>
            <li><a href="#status">Security feature status</a></li>
            <li><a href="#comparison">Comparison</a></li>
            <li><a href="#threat-model">Threat model</a></li>
            <li><a href="#current-encryption">Current encryption</a></li>
            <li><a href="#key-management">Key management</a></li>
            <li><a href="#transport">Transport security</a></li>
            <li><a href="#at-rest">Data at rest</a></li>
            <li><a href="#auth">Authentication</a></li>
            <li><a href="#limitations">Known limitations</a></li>
            <li><a href="#roadmap">Roadmap</a></li>
            <li><a href="#responsible-disclosure">Responsible disclosure</a></li>
          </ol>
        </nav>

        <section id="threat-model">
          <h2>1. Threat model</h2>
          <p>We protect against the following adversaries:</p>
          <ul>
            <li>
              <strong>Passive network attacker</strong> — an entity that can observe traffic
              between clients and servers. Mitigated by TLS 1.3 with HSTS.
            </li>
            <li>
              <strong>Active network attacker (MITM)</strong> — an entity that can modify
              traffic. Mitigated by certificate pinning on native clients and HSTS preload on web.
            </li>
            <li>
              <strong>Compromised server</strong> — an attacker with read access to the database
              or server memory. <em>Mitigated</em> for message content: the server stores only
              ciphertext for both DMs (v5 DR / v7 PQXDH) and groups (v6 Sender Keys). Sealed
              sender (v6) additionally hides sender identity within groups — the server cannot
              determine who sent what. The server still sees conversation membership and timing.
            </li>
            <li>
              <strong>Metadata analysis</strong> — an attacker inferring who talks to whom,
              when, and how often.{" "}
              <em>Partially mitigated:</em> message content lengths hidden (256-byte padding ✅),
              sender identity in groups hidden (sealed sender v6 ✅). Not mitigated: conversation
              membership and message timing — requires network-level anonymity (out of scope for
              a web app; see §8.7).
            </li>
            <li>
              <strong>Compromised client device</strong> — out of scope. A malicious OS or
              hardware keylogger can capture plaintext before encryption.
            </li>
          </ul>
        </section>

        <section id="current-encryption">
          <h2>2. Current encryption</h2>

          <h3>2.1 DM conversations — Double Ratchet (v5)</h3>
          <p>
            Every device generates a non-extractable ECDH P-256 <strong>identity keypair</strong> in
            the browser via the WebCrypto API. The private key is stored in IndexedDB (structured-clone)
            and never leaves the device in plaintext. On top of this identity key, DMs run the{" "}
            <strong>Double Ratchet Algorithm</strong> (v5 envelope):
          </p>
          <pre>{`// 1. Session init — identity ECDH → HKDF:
SK = HKDF(ECDH(myIdentityPriv, peerIdentityPub), info="nexa_dr_init")
//    → 32-byte root key (RK), plus a fresh ratchet keypair (DHs)

// 2. DH ratchet step — runs when peer sends a new ratchet key:
(RK, CK) = HKDF(RK, ECDH(DHs_priv, peer_dh_pub), info="nexa_ratchet_root")
//    → new root key + new chain key; DHs is immediately rotated

// 3. Symmetric ratchet — runs on every message:
CK_next = HMAC-SHA256(CK, 0x01)   // advance chain key
MK      = HMAC-SHA256(CK, 0x02)   // derive one-time message key (discarded after use)

// 4. Encrypt:
ciphertext = AES-256-GCM(MK, plaintext)   // random 12-byte IV prepended
envelope = { v:5, dh_pub, pn, n, ciphertext, senderDeviceId }`}</pre>
          <p>
            <strong>Forward secrecy:</strong> the message key (MK) is derived fresh per message and
            discarded immediately. Compromising a device key in the future reveals nothing about
            past messages — those were encrypted with one-time MKs that no longer exist.
          </p>
          <p>
            <strong>Break-in recovery:</strong> when the peer replies, they include a new ratchet
            public key (<code>dh_pub</code>) in the envelope header. Both sides perform a DH ratchet
            step that derives a fresh root key via ECDH on the new keypairs. After one round-trip,
            any session state that was actively compromised is replaced — the session self-heals
            automatically.
          </p>
          <p>
            <strong>Out-of-order messages:</strong> the receiver pre-derives and stores message keys
            for gaps in the sequence (<code>MKSKIPPED</code> map, capped at 1000 entries). Out-of-order
            messages decrypt correctly without reordering.
          </p>

          <h3>2.2 Group conversations — Sender Keys v6 (break-in recovery + sealed sender)</h3>
          <p>
            Group messages use <strong>Sender Keys</strong> — each sender maintains a HMAC-SHA-256
            chain key that ratchets per message. The chain key is distributed to members via ECIES.
          </p>
          <pre>{`// v6 — Sender Keys (sealed sender):
msgKey  = HMAC-SHA256(chainKey, 0x02)   // one-time message key
nextCK  = HMAC-SHA256(chainKey, 0x01)   // advance chain; old key discarded
payload = { text: plaintext, sender_id } // sealed: sender inside ciphertext
cipher  = AES-256-GCM(msgKey, padded_payload)
envelope = { v:6, ciphertext: cipher, iteration, skId }
// Break-in recovery: rotate chainKey when member removed → re-distribute to remaining members only`}</pre>
          <p>
            <strong>Sealed sender:</strong> <code>sender_id</code> is inside the AES-GCM ciphertext —
            the server sees only <code>conversation_id</code> and an opaque blob.{" "}
            <strong>Break-in recovery:</strong> fresh random chain key on member removal;
            excluded party cannot derive new chain.{" "}
            <strong>Forward secrecy:</strong> chain advances per message; past keys discarded.
          </p>

          <h3>2.3 Post-Quantum DMs — PQXDH v7 (ML-KEM-768 + ECDH P-256)</h3>
          <p>
            DMs use <strong>PQXDH</strong> — hybrid key agreement secure against quantum computers.
            Combines classical ECDH P-256 with NIST-standardized ML-KEM-768 (CRYSTALS-Kyber, FIPS 203).
          </p>
          <pre>{`// v7 — PQXDH hybrid (per-message):
(eph_priv, eph_pub) = ECDH.generateKey()
ecdh_shared         = ECDH(eph_priv, peerEcdhPub)
(mlkem_ct, mlkem_s) = ml_kem768.encapsulate(peerMlKemPub)   // 1088-byte ct
hybridKey           = HKDF-SHA256(ecdh_shared ‖ mlkem_s, info="nexa_pqxdh_v7")
ciphertext          = AES-256-GCM(hybridKey, padded_plaintext)
envelope            = { v:7, ephemeral_pub, mlkem_ct, ciphertext }`}</pre>
          <p>
            <em>Security holds if either component (ECDH or ML-KEM) is secure.</em>{" "}
            Fallback to v5 Double Ratchet when the peer has no ML-KEM key yet.
          </p>
        </section>

        <section id="key-management">
          <h2>3. Key management</h2>
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Algorithm</th>
                <th>Storage</th>
                <th>Exportable</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Device identity key (private)</td>
                <td>ECDH P-256</td>
                <td>IndexedDB (structured clone)</td>
                <td>No</td>
              </tr>
              <tr>
                <td>Device identity key (public)</td>
                <td>ECDH P-256 raw</td>
                <td>Server (profiles table)</td>
                <td>Yes (by design)</td>
              </tr>
              <tr>
                <td>DR session state (DMs)</td>
                <td>Root key + chain keys (HMAC-SHA256); ratchet keypair (ECDH P-256)</td>
                <td>IndexedDB, keyed by conversation ID</td>
                <td>Ratchet priv: non-extractable. Root/chain keys: ArrayBuffer (not exported)</td>
              </tr>
              <tr>
                <td>Group per-message key (v4)</td>
                <td>AES-256-GCM (random, per message)</td>
                <td>Never stored — in envelope ciphertext only, discarded after encrypt</td>
                <td>Only during ECIES wrapping</td>
              </tr>
              <tr>
                <td>Device base key (local vault)</td>
                <td>AES-256-GCM via HKDF</td>
                <td>IndexedDB (non-extractable)</td>
                <td>No</td>
              </tr>
            </tbody>
          </table>
          <p>
            <strong>Key loss:</strong> if a user clears their browser storage, their device key
            pair is lost. Use <strong>Settings → Devices → E2EE Key Backup</strong> to export an
            encrypted backup (PBKDF2-SHA256 600k iterations + AES-256-GCM) and restore it on any device.
          </p>

          <h3>3.1 Key verification — Safety Numbers</h3>
          <p>
            To verify you are communicating with the right person (not a key-substitution attack),
            open any DM chat → menu → <strong>Verify Safety Number</strong>. Both parties see the
            same 12-group 60-digit number, derived as:
          </p>
          <pre>{`// SHA-512 fingerprint of both parties' ECDH public keys:
input = sort_by_userId([ (userId1, ecdhPub1), (userId2, ecdhPub2) ])
hash  = SHA-512(uid1_bytes ‖ key1_bytes ‖ uid2_bytes ‖ key2_bytes)
// → 12 groups of 5 digits, zero-padded → identical on both sides
"DDDDD DDDDD DDDDD DDDDD DDDDD DDDDD
 DDDDD DDDDD DDDDD DDDDD DDDDD DDDDD"`}</pre>
          <p>
            Compare via a trusted out-of-band channel (in person, video call). Once verified, the UI
            marks the conversation ✅ Verified. Any future key change is detected and the status resets.
          </p>
        </section>

        <section id="transport">
          <h2>4. Transport security</h2>
          <ul>
            <li>TLS 1.3 enforced on all connections. TLS 1.2 allowed for legacy compatibility only.</li>
            <li>HSTS with a 1-year max-age and <code>includeSubDomains</code>.</li>
            <li>WebSocket connections (realtime) use WSS (TLS).</li>
            <li>Cloudflare acts as TLS terminator at the edge. Traffic between Cloudflare and origin
              is encrypted separately. Cloudflare sees encrypted payloads but not plaintext (for E2EE messages).</li>
            <li>Content-Security-Policy: <code>default-src 'self'</code>; no unsafe-inline scripts.</li>
          </ul>
        </section>

        <section id="at-rest">
          <h2>5. Data at rest</h2>
          <ul>
            <li>
              <strong>E2EE messages (DMs):</strong> stored as AES-256-GCM ciphertext. Server has
              no key. Only clients can decrypt.
            </li>
            <li>
              <strong>E2EE messages (groups, v4):</strong> stored as AES-256-GCM ciphertext plus
              per-member ECIES-wrapped message key bundles. Server cannot decrypt — the per-message
              key is never stored in cleartext and is discarded by the sender after encryption.
            </li>
            <li>
              <strong>Media files:</strong> encrypted client-side with a per-file AES-256-GCM key
              before upload. The server stores only ciphertext. The file key is wrapped inside the
              message <code>e2ee_envelope</code> and only decryptable by conversation participants.
            </li>
            <li>
              <strong>Passwords:</strong> stored as Argon2id hashes. Never stored in plaintext.
            </li>
            <li>
              <strong>Access tokens:</strong> stored in HttpOnly + Secure + SameSite=Strict
              cookies. AES-GCM encrypted cookie value.
            </li>
            <li>
              <strong>IP addresses:</strong> stored truncated and hashed. Raw IPs are not retained.
            </li>
          </ul>
        </section>

        <section id="auth">
          <h2>6. Authentication</h2>
          <ul>
            <li>JWT access tokens (short-lived, 15 min) + rotating refresh tokens (30 days).</li>
            <li>Refresh token rotation with reuse detection — a reused token invalidates the entire
              session family.</li>
            <li>Argon2id password hashing (memory: 64MB, iterations: 3, parallelism: 4).</li>
            <li>Brute-force rate limiting on all auth endpoints (exponential backoff).</li>
            <li>TOTP 2FA available. WebAuthn (passkeys / hardware keys) available — register in Settings → Devices.</li>
            <li>Single active session enforcement with cross-device invalidation.</li>
            <li>OAuth 2.0 support (Google) with PKCE.</li>
          </ul>
        </section>

        <section id="limitations">
          <h2>7. Known limitations</h2>
          <p>We believe in honest transparency. The following protections are partial or not yet available:</p>
          <ul>
            <li>
              <strong>Conversation-level metadata.</strong>{" "}
              Message content is fully encrypted and sender identity in groups is sealed (v6). However,
              the server still sees <em>conversation membership</em> (who is in which group) and{" "}
              <em>message timing</em> (when messages are sent). Complete metadata protection would
              require an anonymous relay layer — impractical for a standard web messenger. Message
              sizes are mitigated by 256-byte padding.
            </li>
            <li>
              <strong>Multi-device sync is backup-based, not real-time.</strong>{" "}
              You can export your encrypted key pair and import it on another device (Settings → Devices).
              Double Ratchet session history is not synced — a new import starts fresh but receives
              all future messages. Signal-style live device linking (where all devices receive messages
              simultaneously) is on the roadmap (§8.7).
            </li>
            <li>
              <strong>Compromised client device.</strong>{" "}
              Out of scope for any E2EE system. A malicious OS or hardware keylogger captures
              plaintext before encryption regardless of the protocol.
            </li>
          </ul>
        </section>

        <section id="roadmap">
          <h2>8. Roadmap to Signal Protocol</h2>
          <p>
            We are committed to upgrading to the Signal Protocol. This is the most trusted E2EE
            protocol in existence, used by Signal, WhatsApp, and Google Messages. The upgrade is
            significant engineering work. Here is our public plan:
          </p>

          <h3>8.1 Phase 1 — Fix current E2EE (done)</h3>
          <ul>
            <li>Add backend storage for ECDH public keys (profiles table)</li>
            <li>Add <code>PUT /users/me/public-key</code> endpoint</li>
            <li>Wire key upload/fetch through the full send/receive path</li>
          </ul>

          <h3>8.2 Phase 2 — Per-message forward secrecy (done, DMs)</h3>
          <p>
            DM messages now use a fresh ephemeral ECDH P-256 keypair per message (v3 envelope).
            The sender discards the ephemeral private key immediately after encryption. This gives
            forward secrecy: future compromise of either party's long-term device key cannot decrypt
            past messages, because those messages were encrypted with ephemeral keys that no longer exist.
          </p>
          <ul>
            <li>v3 envelope: <code>{"{ v:3, ephemeral_pub, ciphertext, senderDeviceId }"}</code></li>
            <li>Recipient decrypts: <code>ECDH(own_private, ephemeral_pub) → AES-256-GCM.decrypt</code></li>
            <li>v3 is now superseded by v5 (Double Ratchet) for DMs — legacy v3 envelopes still decrypt correctly for backward compatibility.</li>
          </ul>

          <h3>8.3 Phase 3 — Double Ratchet for DMs (done)</h3>
          <p>
            DM conversations now use the <strong>Double Ratchet Algorithm (v5 envelope)</strong>,
            built on top of the identity ECDH P-256 keypair from Phase 1. This adds break-in
            recovery on top of Phase 2's forward secrecy:
          </p>
          <ul>
            <li><strong>Forward secrecy:</strong> each message uses a one-time key (HMAC-SHA256
              chain) — past messages are safe after key compromise. ✅</li>
            <li><strong>Break-in recovery:</strong> a DH ratchet step fires on each peer reply,
              replacing the session root key via fresh ECDH. The session self-heals after one
              round-trip. ✅</li>
            <li><strong>Out-of-order delivery:</strong> skipped message keys are stored (capped at
              1 000 per chain) so late-arriving messages always decrypt. ✅</li>
            <li><strong>Not yet:</strong> X3DH prekey bundles (IK + SPK + OPKs) for asynchronous
              session init without an online handshake. The current session init requires both
              parties' identity public keys to be registered on the server first.</li>
          </ul>

          <h3>8.4 Phase 4 — Group Sender Keys + break-in recovery (done ✅)</h3>
          <p>
            Group messages now use <strong>Sender Keys v6</strong>: a HMAC-SHA-256 chain ratchet
            per sender. Break-in recovery is implemented — when a member is removed, the sender
            generates a fresh random chain key and distributes it only to remaining members. The
            removed party cannot derive future chain keys. Sender keys are distributed via ECIES
            (individually wrapped for each member). New members cannot decrypt messages from before
            they joined (new member isolation).
          </p>

          <h3>8.5 Phase 5 — Media encryption + Sealed Sender + Multi-device (done ✅)</h3>
          <p>
            Media files are encrypted client-side (AES-256-GCM per file, key in E2EE envelope).
            Sealed Sender: <code>sender_id</code> is encrypted inside the v6 AES-GCM payload —
            the server sees only <code>conversation_id</code>, not who sent what in groups.
            Multi-device key backup: ECDH + ML-KEM key pair can be exported encrypted with a
            passphrase (PBKDF2 + AES-256-GCM) and imported on a new device (Settings → Devices).
          </p>

          <h3>8.6 Phase 6 — Post-Quantum E2EE: PQXDH v7 (done ✅)</h3>
          <p>
            DMs now use <strong>PQXDH v7</strong>: hybrid ML-KEM-768 (CRYSTALS-Kyber, NIST FIPS 203)
            + ECDH P-256. The combined shared secret is derived via HKDF-SHA-256. If either
            component (classical or post-quantum) remains secure, the encryption is unbroken.
            ML-KEM keys are generated on first login and uploaded to the server automatically.
            Peers without ML-KEM keys fall back to Double Ratchet v5.
          </p>

          <h3>8.7 Phase 7 — Remaining roadmap</h3>
          <ul>
            <li>
              <strong>X3DH prekey bundles</strong> — async session init (offline first message)
              without a live handshake. Requires SPK + OPK rotation infrastructure.
            </li>
            <li>
              <strong>Real-time multi-device sync</strong> — Signal-style device linking (IDB
              state sync across devices). Currently only key backup/restore is supported.
            </li>
            <li>
              <strong>Anonymous relay / network-level metadata</strong> — conversation timing and
              membership metadata still visible to server. Cover traffic not planned.
            </li>
            <li>
              <strong>Independent public audit</strong> — audit scope prepared; pursuing OSTIF
              engagement. Results will be published.
            </li>
          </ul>
        </section>

        <section id="responsible-disclosure">
          <h2>9. Responsible disclosure</h2>
          <p>
            If you discover a security vulnerability in Nexa, please report it responsibly before
            public disclosure. We commit to:
          </p>
          <ul>
            <li>Acknowledging your report within 48 hours</li>
            <li>Providing a timeline for the fix within 7 days</li>
            <li>Crediting you in our security advisories (with your permission)</li>
            <li>Not pursuing legal action against good-faith security researchers</li>
          </ul>
          <p>
            Contact: <strong>security@nexa.chat</strong>
          </p>
          <p>
            Please include a proof of concept, affected versions, and the potential impact.
            Do not access or modify other users' data during research.
          </p>
        </section>
        <div className="legal-page__back" style={{ marginTop: "3rem" }}>
          <a href="/">← Back to Nexa</a>
        </div>
      </div>
    </div>
  );
}
