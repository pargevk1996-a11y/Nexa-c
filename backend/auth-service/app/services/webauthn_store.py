"""WebAuthn credential storage (dev in-memory).

The legacy ``/webauthn/login/*`` ceremony is still a stub (no signature check).
The biometric **PIN-unlock** flow added on top of this store performs REAL
WebAuthn assertion verification — see :func:`verify_assertion`. It binds an
assertion to (a) possession of the platform authenticator's private key
(held in the device secure enclave) and (b) a fresh, single-use, server-issued
challenge, so a stolen session cookie alone cannot unlock the PIN.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
from dataclasses import dataclass, field
from uuid import uuid4

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, padding
from cryptography.hazmat.primitives.asymmetric.ec import ECDSA
from cryptography.hazmat.primitives.serialization import load_der_public_key

logger = logging.getLogger(__name__)


def _b64url_decode(value: str) -> bytes:
    """Decode standard or URL-safe base64, tolerating missing padding."""
    s = value.replace("-", "+").replace("_", "/")
    s += "=" * (-len(s) % 4)
    return base64.b64decode(s)


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


@dataclass
class StoredCredential:
    id: str
    user_id: str
    credential_id: str
    public_key: str
    device_label: str
    sign_count: int = 0


@dataclass
class WebAuthnStore:
    _credentials: dict[str, StoredCredential] = field(default_factory=dict)
    _challenges: dict[str, str] = field(default_factory=dict)
    # Challenges issued for the biometric PIN-unlock flow, keyed by user id.
    _user_challenges: dict[str, str] = field(default_factory=dict)

    def register(
        self,
        user_id: str,
        credential_id: str,
        public_key: str,
        *,
        device_label: str = "Biometric device",
    ) -> StoredCredential:
        cred = StoredCredential(
            id=str(uuid4()),
            user_id=user_id,
            credential_id=credential_id,
            public_key=public_key,
            device_label=device_label,
        )
        self._credentials[cred.credential_id] = cred
        return cred

    def list_for_user(self, user_id: str) -> list[StoredCredential]:
        return [c for c in self._credentials.values() if c.user_id == user_id]

    def count_for_user(self, user_id: str) -> int:
        return len(self.list_for_user(user_id))

    def get_by_credential_id(self, credential_id: str) -> StoredCredential | None:
        return self._credentials.get(credential_id)

    def remove_for_user(self, user_id: str) -> int:
        to_remove = [cid for cid, c in self._credentials.items() if c.user_id == user_id]
        for cid in to_remove:
            del self._credentials[cid]
        return len(to_remove)

    def update_sign_count(self, credential_id: str, sign_count: int) -> None:
        cred = self._credentials.get(credential_id)
        if cred is not None:
            cred.sign_count = sign_count

    # -- legacy email-keyed challenges (stub login ceremony) -----------------
    def issue_challenge(self, email: str) -> str:
        challenge = secrets.token_urlsafe(32)
        self._challenges[email.lower().strip()] = challenge
        return challenge

    def consume_challenge(self, email: str, challenge: str) -> bool:
        key = email.lower().strip()
        expected = self._challenges.pop(key, None)
        return expected is not None and expected == challenge

    # -- biometric PIN-unlock challenges (real assertion verification) -------
    def issue_user_challenge(self, user_id: str) -> str:
        """Issue a fresh, single-use challenge for the biometric PIN unlock."""
        challenge = secrets.token_urlsafe(32)
        self._user_challenges[user_id] = challenge
        return challenge

    def consume_user_challenge(self, user_id: str, challenge: str) -> bool:
        expected = self._user_challenges.pop(user_id, None)
        return bool(expected) and secrets.compare_digest(expected, challenge)


webauthn_store = WebAuthnStore()


def verify_assertion(
    *,
    public_key_b64: str,
    client_data_json_b64: str,
    authenticator_data_b64: str,
    signature_b64: str,
    expected_challenge: str,
) -> tuple[bool, int]:
    """Verify a WebAuthn assertion for the biometric PIN-unlock flow.

    Mandatory checks (the real anti-bypass controls):
      * clientDataJSON.type == "webauthn.get"
      * clientDataJSON.challenge == the server-issued challenge (single use)
      * the User-Present flag is set in authenticatorData
      * the signature verifies over ``authenticatorData || SHA256(clientDataJSON)``
        using the credential's stored public key

    Self-consistency check (no server-domain config required, so it cannot
    misconfigure into a production lockout): the rpIdHash embedded in
    authenticatorData must equal SHA256 of the host in clientDataJSON.origin.
    The browser already refuses to mint an assertion whose rpId does not match
    the calling origin, so this ties the two structures together.

    Returns ``(ok, new_sign_count)``.
    """
    try:
        client_data_raw = _b64url_decode(client_data_json_b64)
        authenticator_data = _b64url_decode(authenticator_data_b64)
        signature = _b64url_decode(signature_b64)
        client_data = json.loads(client_data_raw.decode("utf-8"))
    except Exception:
        logger.warning("webauthn: malformed assertion payload")
        return False, 0

    if client_data.get("type") != "webauthn.get":
        logger.warning("webauthn: unexpected clientData type")
        return False, 0

    # Challenge must match exactly (base64url, padding-insensitive).
    got_challenge = str(client_data.get("challenge", ""))
    if not secrets.compare_digest(
        got_challenge.replace("=", ""), _b64url_encode(_b64url_decode(expected_challenge))
    ) and not secrets.compare_digest(got_challenge, expected_challenge):
        logger.warning("webauthn: challenge mismatch")
        return False, 0

    # authenticatorData layout: rpIdHash(32) | flags(1) | signCount(4) | ...
    if len(authenticator_data) < 37:
        logger.warning("webauthn: authenticatorData too short")
        return False, 0
    rp_id_hash = authenticator_data[:32]
    flags = authenticator_data[32]
    sign_count = int.from_bytes(authenticator_data[33:37], "big")

    user_present = bool(flags & 0x01)
    if not user_present:
        logger.warning("webauthn: user-present flag not set")
        return False, 0

    # Self-consistency: rpIdHash must match SHA256(origin host).
    try:
        origin = str(client_data.get("origin", ""))
        host = origin.split("://", 1)[-1].split("/", 1)[0].split(":", 1)[0]
        if host and not secrets.compare_digest(
            rp_id_hash, hashlib.sha256(host.encode()).digest()
        ):
            logger.warning("webauthn: rpIdHash/origin mismatch (host=%s)", host)
            return False, 0
    except Exception:
        logger.warning("webauthn: could not validate origin/rpIdHash")
        return False, 0

    # Verify the signature over authenticatorData || SHA256(clientDataJSON).
    signed = authenticator_data + hashlib.sha256(client_data_raw).digest()
    try:
        public_key = load_der_public_key(_b64url_decode(public_key_b64))
    except Exception:
        logger.warning("webauthn: cannot load stored public key")
        return False, 0

    try:
        if isinstance(public_key, ec.EllipticCurvePublicKey):
            public_key.verify(signature, signed, ECDSA(hashes.SHA256()))
        else:
            # RSA (alg -257) fallback, in case a platform offers it.
            public_key.verify(signature, signed, padding.PKCS1v15(), hashes.SHA256())
    except InvalidSignature:
        logger.warning("webauthn: invalid assertion signature")
        return False, 0
    except Exception:
        logger.warning("webauthn: signature verification error", exc_info=True)
        return False, 0

    return True, sign_count
