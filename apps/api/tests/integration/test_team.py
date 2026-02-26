"""
Integration tests — Team API
Covers: list members (new /team router with {members:[]} shape),
        invite technician (creates user directly, returns temp_password),
        deactivate member (owner only)
"""
import uuid
import pytest
from httpx import AsyncClient
from tests.helpers import auth_headers

TEAM_URL = "/api/v1/team"
LOGIN_URL = "/api/v1/auth/login"


@pytest.fixture
async def owner_headers(client: AsyncClient):
    return await auth_headers(client)


class TestListTeam:
    async def test_list_includes_owner(self, client: AsyncClient, owner_headers):
        resp = await client.get(TEAM_URL, headers=owner_headers)
        assert resp.status_code == 200
        data = resp.json()
        # New team router returns {"members": [...]}
        assert "members" in data
        members = data["members"]
        assert len(members) >= 1
        assert any(m["role"] == "OWNER" for m in members)

    async def test_list_requires_auth(self, client: AsyncClient):
        resp = await client.get(TEAM_URL)
        assert resp.status_code == 401

    async def test_members_have_expected_fields(self, client: AsyncClient, owner_headers):
        resp = await client.get(TEAM_URL, headers=owner_headers)
        assert resp.status_code == 200
        member = resp.json()["members"][0]
        for field in ("id", "full_name", "email", "role", "is_active", "created_at"):
            assert field in member, f"Missing field: {field}"


class TestInviteTechnician:
    async def test_invite_creates_member_with_temp_password(self, client: AsyncClient, owner_headers):
        resp = await client.post(
            f"{TEAM_URL}/invite",
            json={"email": "tech1@workshop.com"},
            headers=owner_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "temp_password" in data
        assert "message" in data

    async def test_invite_appears_in_list(self, client: AsyncClient, owner_headers):
        await client.post(
            f"{TEAM_URL}/invite",
            json={"email": "tech2@workshop.com"},
            headers=owner_headers,
        )
        resp = await client.get(TEAM_URL, headers=owner_headers)
        members = resp.json()["members"]
        assert any(m["email"] == "tech2@workshop.com" for m in members)
        invited = next(m for m in members if m["email"] == "tech2@workshop.com")
        assert invited["role"] == "TECHNICIAN"

    async def test_invite_duplicate_email_returns_409(self, client: AsyncClient, owner_headers):
        email = "duptech@shop.com"
        await client.post(f"{TEAM_URL}/invite", json={"email": email}, headers=owner_headers)
        resp = await client.post(f"{TEAM_URL}/invite", json={"email": email}, headers=owner_headers)
        assert resp.status_code == 409

    async def test_invited_tech_can_login(self, client: AsyncClient, owner_headers):
        email = "login_tech@shop.com"
        invite_resp = await client.post(
            f"{TEAM_URL}/invite",
            json={"email": email},
            headers=owner_headers,
        )
        temp_pw = invite_resp.json()["temp_password"]
        login_resp = await client.post(
            LOGIN_URL,
            json={"email": email, "password": temp_pw},
        )
        assert login_resp.status_code == 200
        assert login_resp.json()["user"]["role"] == "TECHNICIAN"


class TestDeactivateMember:
    async def test_deactivate_technician(self, client: AsyncClient, owner_headers):
        # Invite tech
        email = "deact_tech@shop.com"
        await client.post(f"{TEAM_URL}/invite", json={"email": email}, headers=owner_headers)

        # Get member ID
        list_resp = await client.get(TEAM_URL, headers=owner_headers)
        tech = next(m for m in list_resp.json()["members"] if m["email"] == email)

        # Deactivate (returns 204 No Content)
        resp = await client.delete(f"{TEAM_URL}/{tech['id']}", headers=owner_headers)
        assert resp.status_code == 204

        # Verify visible in list (is_active=False)
        list_after = await client.get(TEAM_URL, headers=owner_headers)
        tech_after = next(m for m in list_after.json()["members"] if m["email"] == email)
        assert tech_after["is_active"] is False

    async def test_cannot_deactivate_yourself(self, client: AsyncClient, owner_headers):
        """Owner deactivating themselves should fail with 400."""
        list_resp = await client.get(TEAM_URL, headers=owner_headers)
        owner = next(m for m in list_resp.json()["members"] if m["role"] == "OWNER")
        resp = await client.delete(f"{TEAM_URL}/{owner['id']}", headers=owner_headers)
        assert resp.status_code in (400, 403)

    async def test_deactivate_nonexistent_member(self, client: AsyncClient, owner_headers):
        resp = await client.delete(f"{TEAM_URL}/{uuid.uuid4()}", headers=owner_headers)
        assert resp.status_code == 404
