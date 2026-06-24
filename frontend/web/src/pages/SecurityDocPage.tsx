import { useEffect } from "react";

const BRAND = "Nexa";
const LAST_UPDATED = "2026-06-24 (v2 — DR v5 live)";

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
            and the planned upgrade path to full Signal Protocol E2EE. We publish this because
            trust requires transparency, and transparency requires specifics.
          </p>
        </header>


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
                <td>✅ Per-message ECIES (multi-recipient)</td>
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
                <td>✅ Per-message (DMs: Double Ratchet v5 · Groups: ECIES per recipient v4)*</td>
              </tr>
              <tr>
                <td>Break-in recovery</td>
                <td>✅ Double Ratchet DH step</td>
                <td>✅</td>
                <td>❌</td>
                <td>✅ DMs: Double Ratchet DH ratchet (v5) · Groups: planned</td>
              </tr>
              <tr>
                <td>Протокол шифрования</td>
                <td>Signal Protocol (X3DH + Double Ratchet)</td>
                <td>Signal Protocol</td>
                <td>MTProto 2.0 (собственный)</td>
                <td>Double Ratchet (DMs, v5) + ECIES (Groups, v4)</td>
              </tr>
            </tbody>
          </table>
          <p style={{ marginTop: "0.75rem", fontSize: "0.9em", opacity: 0.75 }}>
            * DMs use the Double Ratchet Algorithm (v5 envelope): each message advances a symmetric
            chain key (HMAC-SHA256) and a DH ratchet step occurs when the peer replies, giving both
            forward secrecy and break-in recovery. Groups use per-message multi-recipient ECIES (v4
            envelope): a fresh random AES-256-GCM key per message, individually ECIES-wrapped for
            each member and discarded after encryption — forward secrecy equivalent to v3, without
            a ratchet per sender.
          </p>
        </section>

        <nav className="legal-page__toc">
          <h2>Contents</h2>
          <ol>
            <li><a href="#comparison">Comparison</a></li>
            <li><a href="#threat-model">Threat model</a></li>
            <li><a href="#current-encryption">Current encryption (v2)</a></li>
            <li><a href="#key-management">Key management</a></li>
            <li><a href="#transport">Transport security</a></li>
            <li><a href="#at-rest">Data at rest</a></li>
            <li><a href="#auth">Authentication</a></li>
            <li><a href="#limitations">Current limitations</a></li>
            <li><a href="#roadmap">Roadmap to Signal Protocol</a> (§8.6 — metadata)</li>
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
              or server memory. <em>Partially mitigated</em> by client-side ECDH encryption for
              DMs (the server stores ciphertext only). Group chats have weaker guarantees (see
              §6). Full mitigation requires Signal Protocol (see §8).
            </li>
            <li>
              <strong>Metadata analysis</strong> — an attacker inferring who talks to whom,
              when, and how often.{" "}
              <em>Partially mitigated:</em> message content lengths are now hidden (plaintext
              is padded to 256-byte blocks before encryption — all short messages produce
              identical-length ciphertext). Not mitigated: the server still sees conversation
              membership (who talks to whom), message timing, and online presence. Full
              protection requires network-level anonymity (anonymous relay / Sealed Sender
              + unidentified delivery) — on the roadmap (§8.6).
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

          <h3>2.2 Group conversations — v4 multi-recipient ECIES</h3>
          <p>
            Each group message uses a <strong>fresh random AES-256-GCM key</strong> generated
            at send time. This key is ECIES-wrapped individually for every group member (in
            parallel) and the entire bundle is stored in the <code>e2ee_envelope</code> field
            alongside the ciphertext. The message key is discarded immediately after encryption.
          </p>
          <pre>{`// v4 envelope — per-message multi-recipient ECIES:
msgKey  = AES-256-GCM.generateKey()           // fresh per message, discarded after
body    = AES-GCM.encrypt(msgKey, plaintext)  // iv prepended

recipients = members.map(member => {
  ephemeralKey  = ECDH.generateKey()          // fresh per recipient
  wrappingKey   = ECDH(ephemeral.private, member.publicKey)
  key_ct        = AES-GCM.encrypt(wrappingKey, rawMsgKey)
  return { user_id, ephemeral_pub, key_ct }
})

envelope = { v:4, ciphertext: body, recipients, senderDeviceId }`}</pre>
          <p>
            <strong>Forward secrecy:</strong> the message key is never stored or transmitted in
            the clear. Compromising a device key in the future reveals nothing about messages
            sent before the compromise — the ECIES ephemeral key used to wrap each message key
            is also discarded immediately. This is equivalent forward secrecy to v3 DMs.
          </p>
          <p>
            <strong>New member isolation:</strong> a member who joins after a message is sent
            is not in that message's <code>recipients</code> list and cannot decrypt it.
            Membership changes (join, leave, ban) also still trigger a{" "}
            <code>member.changed</code> WS event so all clients clear any cached state.
          </p>
          <p>
            <strong>Remaining limitation for groups:</strong> the multi-recipient ECIES (v4)
            provides per-message forward secrecy but <em>no DH ratchet step</em> — if a device key
            is actively compromised mid-session, future group messages in that session may be exposed
            until the device is replaced. DMs do not have this limitation (see §2.1 — v5 DR
            self-heals after one round-trip). Group break-in recovery (Sender Keys) is planned.
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
            pair is lost. They will generate a new key pair on next login and cannot decrypt
            messages encrypted to the old key. Multi-device and key backup are not yet
            implemented.
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
          <h2>7. Current limitations (honest disclosure)</h2>
          <p>We want you to know exactly what we <em>don't</em> protect against today:</p>
          <ul>
            <li>
              <strong>No break-in recovery for group chats.</strong> DM conversations use the
              Double Ratchet Algorithm (v5): if a device key is compromised mid-session, the
              session self-heals after the peer's next reply — no action needed. Group conversations
              (v4 ECIES) have per-message forward secrecy but <em>no DH ratchet step</em>: a
              mid-session device compromise keeps future group messages in that session exposed
              until the device key is rotated. Sender Keys (group ratchet) is on the roadmap.
            </li>
            <li>
              <strong>Partial metadata protection.</strong>{" "}
              <em>Message sizes:</em> ✅ mitigated — all plaintext is padded to 256-byte
              blocks before AES-GCM encryption, so every short message (≤ 255 chars) produces
              identical-length ciphertext (274 bytes after IV + tag).{" "}
              <em>Social graph:</em> ❌ the server knows who talks to whom (conversation
              membership), when messages are sent, and online presence. Hiding the social graph
              requires network-level anonymity (anonymous relay servers, Sealed Sender +
              unidentified delivery) — this cannot be done in a standard web app without a
              trusted relay layer. See §8.6.
            </li>
            <li>
              <strong>Media key forward secrecy depends on message forward secrecy.</strong> Each
              media file has a random per-file AES-256-GCM key, carried inside the message
              envelope. Since message envelopes are per-message ephemeral (v3/v4), the media
              key has the same forward secrecy guarantees as the message.
            </li>
            <li>
              <strong>Single device only.</strong> The ECDH key pair is per-browser. There is no
              multi-device key synchronization or key backup. Clearing browser storage loses access
              to encrypted history.
            </li>
            <li>
              <strong>Key verification not implemented.</strong> There is no mechanism (safety
              numbers, QR code) for users to verify each other's public keys out-of-band. A
              malicious server could substitute a key.
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

          <h3>8.4 Phase 4 — Group per-message forward secrecy (done)</h3>
          <p>
            Implemented as <strong>multi-recipient ECIES (v4 envelope)</strong>. Each group
            message generates a fresh random AES-256-GCM key, ECIES-wrapped in parallel for
            every group member using their long-term ECDH public key plus a per-recipient
            ephemeral keypair. The message key is discarded after encryption. This gives the
            same per-message forward secrecy as v3 DMs without requiring shared ratchet state.
            New members cannot decrypt messages sent before they joined. Sender Keys (Signal
            SKDM + per-sender ratchet chain) remain a future option for very large groups.
          </p>

          <h3>8.5 Phase 5 — Media encryption (done) + key verification</h3>
          <p>
            Media files (images, voice, video, documents) are now encrypted client-side with a
            per-file random AES-256-GCM key before upload. The file key is included in the
            message <code>e2ee_envelope</code> (encrypted with the conversation key), so
            only conversation participants can decrypt it. The server receives and stores only
            ciphertext. Next: key verification (safety numbers) so users can confirm
            they're talking to the right person.
          </p>

          <h3>8.6 Phase 6 — Metadata protection (social graph)</h3>
          <p>
            The server currently sees conversation membership, message timing, and online presence.
            Meaningful reduction requires:
          </p>
          <ul>
            <li>
              <strong>Message size padding</strong> (done ✅) — all plaintext padded to 256-byte
              blocks before encryption. Every short message produces identical-length ciphertext.
            </li>
            <li>
              <strong>Sealed Sender + unidentified delivery</strong> — sender identity encrypted
              inside the E2EE envelope; the server routes by recipient only, not sender. Requires
              unidentified delivery tokens (signed by identity key, not linked to session).
            </li>
            <li>
              <strong>Anonymous relay</strong> — messages submitted through a relay that strips IP
              and session metadata. The relay sees destination but not sender; no single server
              sees both. Requires a trusted (or distributed) relay infrastructure.
            </li>
            <li>
              <strong>Cover traffic</strong> — periodic dummy messages to hide timing. High
              bandwidth cost; impractical for mobile without aggressive scheduling.
            </li>
          </ul>
          <p>
            Items 2–3 are on the roadmap. Cover traffic is not planned (bandwidth/battery cost).
            Note: message sizes are already protected (padding done ✅).
          </p>
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
