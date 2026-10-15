"""Per-user time zone: storage, validation, sign-up default and backup."""

import json

import pytest

from app.core.config import Settings, settings
from app.core.tz import is_valid_tz
from app.schemas.auth import UserProfileUpdate
from tests.conftest import auth, register_and_login

_PASSWORD = "pw123456"  # pragma: allowlist secret


def _signup(client, email, **extra):
    r = client.post(
        "/auth/register", json={"email": email, "password": _PASSWORD, **extra}
    )
    assert r.status_code == 201, r.text
    return r.cookies["access_token"]


def _tz(client, token) -> str:
    return client.get("/auth/me", headers=auth(token)).json()["timezone"]


@pytest.mark.parametrize(
    "name,ok",
    [
        ("UTC", True),
        ("Europe/Warsaw", True),
        ("America/Argentina/Buenos_Aires", True),
        ("Asia/Kathmandu", True),
        ("", False),
        (" Europe/Warsaw", False),
        ("Mars/Olympus", False),
        ("../etc/passwd", False),
        ("Europe", False),  # a directory in the tz database, not a zone
        (None, False),
    ],
)
def test_is_valid_tz(name, ok):
    assert is_valid_tz(name) is ok


def test_signup_uses_the_browser_zone(client):
    token = _signup(client, "tz1@test.com", timezone="Asia/Tokyo")
    assert _tz(client, token) == "Asia/Tokyo"


def test_signup_without_a_zone_gets_the_default(client, monkeypatch):
    monkeypatch.setattr(settings, "default_timezone", "Europe/Warsaw")
    token = _signup(client, "tz2@test.com")
    assert _tz(client, token) == "Europe/Warsaw"


@pytest.mark.parametrize("bad", ["Mars/Olympus", "", "../x", "x" * 200])
def test_signup_with_an_unknown_zone_falls_back_instead_of_failing(
    client, monkeypatch, bad
):
    monkeypatch.setattr(settings, "default_timezone", "Europe/Warsaw")
    token = _signup(client, "tz3@test.com", timezone=bad)
    assert _tz(client, token) == "Europe/Warsaw"


def test_patch_me_changes_the_zone(client):
    token = register_and_login(client, "tz4@test.com")
    r = client.patch(
        "/auth/me", json={"timezone": "America/New_York"}, headers=auth(token)
    )
    assert r.status_code == 200
    assert r.json()["timezone"] == "America/New_York"
    assert _tz(client, token) == "America/New_York"


@pytest.mark.parametrize("bad", ["Mars/Olympus", "", " UTC", "Europe"])
def test_patch_me_rejects_an_unknown_zone(client, bad):
    token = register_and_login(client, "tz5@test.com")
    r = client.patch("/auth/me", json={"timezone": bad}, headers=auth(token))
    assert r.status_code == 422
    assert _tz(client, token) == "UTC"


@pytest.mark.parametrize(
    "field", [f for f in UserProfileUpdate.model_fields if f != "telegram_bot_token"]
)
def test_patch_me_null_is_422_on_required_fields_and_200_on_nullable(client, field):
    nullable = {"language_preference", "default_currency", "telegram_chat_id"}
    token = register_and_login(client, "tz6@test.com")
    r = client.patch("/auth/me", json={field: None}, headers=auth(token))
    assert r.status_code == (200 if field in nullable else 422), field


def test_default_timezone_setting_is_validated():
    assert Settings(default_timezone="Europe/Warsaw").default_timezone == (
        "Europe/Warsaw"
    )
    with pytest.raises(ValueError, match="DEFAULT_TIMEZONE"):
        Settings(default_timezone="Mars/Olympus")


# ---------------------------------------------------------------------------
# Backup carries the zone with the notification schedule
# ---------------------------------------------------------------------------


def _export(client, token, *sections):
    r = client.get(
        "/export/json", params=[("sections", s) for s in sections], headers=auth(token)
    )
    assert r.status_code == 200, r.text
    return r.json()


def _restore(client, token, payload):
    return client.post(
        "/export/restore",
        files={"file": ("b.json", json.dumps(payload).encode(), "application/json")},
        headers=auth(token),
    )


def test_backup_round_trips_the_zone_with_notifications(client):
    token = register_and_login(client, "tz7@test.com")
    client.patch("/auth/me", json={"timezone": "Asia/Tokyo"}, headers=auth(token))
    backup = _export(client, token, "email", "telegram")
    assert backup["notifications"]["timezone"] == "Asia/Tokyo"

    client.patch("/auth/me", json={"timezone": "UTC"}, headers=auth(token))
    assert _restore(client, token, backup).status_code == 200
    assert _tz(client, token) == "Asia/Tokyo"


def test_backup_without_notification_sections_leaves_the_zone_out(client):
    token = register_and_login(client, "tz8@test.com")
    backup = _export(client, token, "currency")
    assert "notifications" not in backup


def test_restoring_an_old_backup_or_an_unknown_zone_keeps_the_current_zone(client):
    token = register_and_login(client, "tz9@test.com")
    client.patch("/auth/me", json={"timezone": "Asia/Tokyo"}, headers=auth(token))
    old = {"schema_version": 9, "preferences": {"default_currency": "EUR"}}
    assert _restore(client, token, old).status_code == 200
    assert _tz(client, token) == "Asia/Tokyo"

    bad = {"schema_version": 9, "notifications": {"timezone": "Mars/Olympus"}}
    assert _restore(client, token, bad).status_code == 200
    assert _tz(client, token) == "Asia/Tokyo"
