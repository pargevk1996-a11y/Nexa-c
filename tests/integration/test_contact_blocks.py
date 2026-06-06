"""Integration tests: blocked users API."""

import pytest
from tests.helpers.api import api_error
from tests.helpers.jwt_util import auth_header, make_access_token

pytestmark = pytest.mark.integration


def test_block_unblock_flow(contact_client) -> None:
    owner = make_access_token(user_id="owner-a")
    headers = auth_header(owner)

    block = contact_client.post(
        "/api/v1/contacts/blocks",
        json={"user_id": "user-b", "reason": "test"},
        headers=headers,
    )
    assert block.status_code == 201
    assert block.json()["user_id"] == "user-b"

    listed = contact_client.get("/api/v1/contacts/blocks", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    removed = contact_client.delete("/api/v1/contacts/blocks/user-b", headers=headers)
    assert removed.status_code == 200
    assert removed.json()["ok"] is True


def test_block_self_rejected(contact_client) -> None:
    token = make_access_token(user_id="solo-user")
    resp = contact_client.post(
        "/api/v1/contacts/blocks",
        json={"user_id": "solo-user"},
        headers=auth_header(token),
    )
    assert resp.status_code == 400
    assert api_error(resp.json())["code"] == "SELF_BLOCK"
