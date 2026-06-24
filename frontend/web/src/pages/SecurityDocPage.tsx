import { useEffect } from "react";

const BRAND = "Nexa";
const LAST_UPDATED = "2026-06-24";

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
                <td>✅ Per-message (DM: ephemeral ECDH · Groups: ECIES per recipient)*</td>
              </tr>
              <tr>
                <td>Протокол шифрования</td>
                <td>Signal Protocol (X3DH + Double Ratchet)</td>
                <td>Signal Protocol</td>
                <td>MTProto 2.0 (собственный)</td>
                <td>ECDH P-256 + AES-256-GCM (v2 own)</td>
              </tr>
            </tbody>
          </table>
          <p style={{ marginTop: "0.75rem", fontSize: "0.9em", opacity: 0.75 }}>
            * Forward secrecy: DMs use a fresh ephemeral ECDH keypair per message (v3 envelope) —
            the ephemeral private key is discarded immediately, so past messages cannot be decrypted
            even if a long-term key is later compromised. Groups use per-message multi-recipient
            ECIES (v4 envelope): a random AES-256-GCM key is generated for each message, then
            individually ECIES-wrapped for each member; the message key is discarded after
            encryption — equivalent forward secrecy for groups. Break-in recovery (Double Ratchet
            DH step) is not yet implemented.
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
            <li><a href="#roadmap">Roadmap to Signal Protocol</a></li>
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
              <strong>Metadata analysis</strong> — an attacker inferring who talks to whom.
              Currently <em>not mitigated</em>. Server sees all conversation membership.
              Sealed Sender (Signal Protocol) is on the roadmap.
            </li>
            <li>
              <strong>Compromised client device</strong> — out of scope. A malicious OS or
              hardware keylogger can capture plaintext before encryption.
            </li>
          </ul>
        </section>

        <section id="current-encryption">
          <h2>2. Current encryption (v2) — ECDH-P256 + AES-256-GCM</h2>

          <h3>2.1 DM conversations</h3>
          <p>
            Every device generates a non-extractable ECDH P-256 keypair in the browser using the
            WebCrypto API. The private key is stored in IndexedDB using the structured-clone
            algorithm — it never leaves the device in plaintext.
          </p>
          <p>The shared secret is derived as follows:</p>
          <pre>{`// Both sides run this independently and get the same AES key:
sharedSecret = ECDH(myPrivateKey, peerPublicKey)
aesKey = WebCrypto.deriveKey(ECDH, sharedSecret) → AES-256-GCM`}</pre>
          <p>
            Each message is encrypted with a random 12-byte IV:
          </p>
          <pre>{`iv = crypto.getRandomValues(12 bytes)
ciphertext = AES-256-GCM.encrypt(aesKey, iv, plaintext)
envelope = { v:2, ciphertext: base64(iv || ct), senderDeviceId }`}</pre>
          <p>
            The server stores only the ciphertext and the envelope metadata. It cannot decrypt
            message content for DMs as long as private keys remain on devices.
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
            <strong>Remaining limitation:</strong> no break-in recovery (no Double Ratchet DH
            ratchet step) — if a long-term device key is actively compromised while in use,
            future messages in the same session may be exposed until the device is replaced.
            Full Double Ratchet is on the roadmap (§8.3).
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
                <td>DM shared AES key</td>
                <td>AES-256-GCM (derived)</td>
                <td>In-memory cache only</td>
                <td>No</td>
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
            <li>TOTP 2FA available. WebAuthn (hardware key) rolling out.</li>
            <li>Single active session enforcement with cross-device invalidation.</li>
            <li>OAuth 2.0 support (Google) with PKCE.</li>
          </ul>
        </section>

        <section id="limitations">
          <h2>7. Current limitations (honest disclosure)</h2>
          <p>We want you to know exactly what we <em>don't</em> protect against today:</p>
          <ul>
            <li>
              <strong>No break-in recovery (Double Ratchet DH step).</strong> Both DM (v3) and
              group (v4) messages have per-message forward secrecy — past messages are safe after
              key compromise. However there is no self-healing ratchet: if a device key is
              actively compromised <em>while in use</em>, future messages in the same session
              remain exposed until the device is replaced. Full Double Ratchet is on the roadmap
              (§8.3).
            </li>
            <li>
              <strong>No metadata protection.</strong> The server knows who talks to whom
              (conversation membership), when, and message sizes. Signal Protocol's Sealed Sender
              partially hides sender identity from the server.
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
            <li><strong>Limitation:</strong> no break-in recovery (no DH ratchet step). If a key is
              compromised mid-session, future messages in that session are exposed until a key change.</li>
          </ul>

          <h3>8.3 Phase 3 — X3DH + Double Ratchet (full break-in recovery)</h3>
          <p>
            Replace identity key with X3DH bundle (IK + SPK + OPKs) and add the DH ratchet on top
            of per-message forward secrecy. This provides:
          </p>
          <ul>
            <li><strong>Forward secrecy:</strong> (already done in Phase 2)</li>
            <li><strong>Break-in recovery:</strong> after a compromise, the session self-heals
              within a few message exchanges via new DH ratchet steps.</li>
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
