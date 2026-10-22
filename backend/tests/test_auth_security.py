"""Tests for logout token revocation and CSRF double-submit protection."""

from datetime import UTC, datetime, timedelta

from jose import jwt

from app.core.config import settings
from tests.conftest import auth, register_and_login

_PASSWORD = "pw123456"  # pragma: allowlist secret
_NEW_PASSWORD = "newpass123"  # pragma: allowlist secret
_WRONG_PASSWORD = "wrong-pass"  # pragma: allowlist secret


# ---------------------------------------------------------------------------
# Logout — requires auth, revokes every token issued for the user
# ---------------------------------------------------------------------------


def test_logout_requires_auth(client):
    r = client.post("/auth/logout")
    assert r.status_code == 401


def test_logout_revokes_old_token(client):
    token = register_and_login(client, "revoke@test.com", _PASSWORD)

    r = client.get("/auth/me", headers=auth(token))
    assert r.status_code == 200

    r = client.post("/auth/logout", headers=auth(token))
    assert r.status_code == 204

    r = client.get("/auth/me", headers=auth(token))
    assert r.status_code == 401


def test_login_after_logout_issues_a_valid_new_token(client):
    token = register_and_login(client, "relogin@test.com", _PASSWORD)
    client.post("/auth/logout", headers=auth(token))

    login_r = client.post(
        "/auth/login", json={"email": "relogin@test.com", "password": _PASSWORD}
    )
    assert login_r.status_code == 200
    new_token = login_r.cookies["access_token"]

    r = client.get("/auth/me", headers=auth(new_token))
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# CSRF — double-submit cookie check on cookie-authenticated mutations
# ---------------------------------------------------------------------------


def test_cookie_session_without_csrf_header_returns_403(client):
    register_and_login(client, "csrf_missing@test.com", _PASSWORD)
    # No Authorization header: relies on the session cookies the register
    # response just set on this TestClient, same as a real browser tab.
    r = client.patch("/auth/me", json={"language_preference": "pl"})
    assert r.status_code == 403


def test_cookie_session_with_valid_csrf_header_succeeds(client):
    register_and_login(client, "csrf_ok@test.com", _PASSWORD)
    csrf_token = client.cookies.get("csrf_token")
    assert csrf_token

    r = client.patch(
        "/auth/me",
        json={"language_preference": "pl"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert r.status_code == 200


def test_bearer_token_request_bypasses_csrf_check(client):
    token = register_and_login(client, "csrf_bearer@test.com", _PASSWORD)
    r = client.patch(
        "/auth/me", json={"language_preference": "pl"}, headers=auth(token)
    )
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# JWT issuer/audience — a validly-signed token for the wrong iss/aud is
# rejected outright, not just trusted on signature
# ---------------------------------------------------------------------------


def _token_with_claims(**overrides) -> str:
    payload = {
        "sub": "1",
        "ver": 0,
        "exp": datetime.now(UTC) + timedelta(minutes=5),
        "iss": "paylark",
        "aud": "paylark-app",
    }
    payload.update(overrides)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def test_token_with_wrong_audience_is_rejected(client):
    register_and_login(client, "wrong_aud@test.com", _PASSWORD)
    bad_token = _token_with_claims(aud="some-other-app")
    r = client.get("/auth/me", headers=auth(bad_token))
    assert r.status_code == 401


def test_token_with_wrong_issuer_is_rejected(client):
    register_and_login(client, "wrong_iss@test.com", _PASSWORD)
    bad_token = _token_with_claims(iss="some-other-backend")
    r = client.get("/auth/me", headers=auth(bad_token))
    assert r.status_code == 401


def test_token_missing_audience_is_rejected(client):
    register_and_login(client, "missing_aud@test.com", _PASSWORD)
    payload = {
        "sub": "1",
        "ver": 0,
        "exp": datetime.now(UTC) + timedelta(minutes=5),
        "iss": "paylark",
    }
    bad_token = jwt.encode(
        payload, settings.jwt_secret, algorithm=settings.jwt_algorithm
    )
    r = client.get("/auth/me", headers=auth(bad_token))
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Password change / reset revoke other sessions
# ---------------------------------------------------------------------------


def test_change_password_revokes_other_sessions_but_keeps_current(client):
    old = register_and_login(client, "chpw@test.com", _PASSWORD)
    r = client.patch(
        "/auth/change-password",
        json={"current_password": _PASSWORD, "new_password": _NEW_PASSWORD},
        headers=auth(old),
    )
    assert r.status_code == 200
    assert client.get("/auth/me", headers=auth(old)).status_code == 401
    # The browser session got a fresh cookie and keeps working.
    assert client.get("/auth/me").status_code == 200


def test_reset_password_revokes_existing_sessions(client_db):
    from app.models.reset_token import PasswordResetToken
    from tests.test_reset_password import _token_hash

    client, db = client_db
    old = register_and_login(client, "rspw@test.com", _PASSWORD)
    known = "revoke-sessions-token-for-testing1"  # pragma: allowlist secret
    from app.models.user import User

    user = db.query(User).filter(User.email == "rspw@test.com").one()
    db.add(PasswordResetToken(user_id=user.id, token_hash=_token_hash(known)))
    db.commit()

    r = client.post(
        "/auth/reset-password", json={"token": known, "new_password": _NEW_PASSWORD}
    )
    assert r.status_code == 200
    assert client.get("/auth/me", headers=auth(old)).status_code == 401


# ---------------------------------------------------------------------------
# Login does the same bcrypt work for unknown and known emails
# ---------------------------------------------------------------------------


def test_login_unknown_email_still_runs_a_password_check(client):
    from unittest.mock import patch

    from app.core.security import DUMMY_PASSWORD_HASH

    with patch("app.routers.auth.verify_password", return_value=False) as check:
        r = client.post(
            "/auth/login", json={"email": "nobody@test.com", "password": _PASSWORD}
        )
    assert r.status_code == 401
    check.assert_called_once_with(_PASSWORD, DUMMY_PASSWORD_HASH)


def test_login_unknown_and_wrong_password_look_identical(client):
    register_and_login(client, "known@test.com", _PASSWORD)
    wrong = client.post(
        "/auth/login", json={"email": "known@test.com", "password": _WRONG_PASSWORD}
    )
    unknown = client.post(
        "/auth/login", json={"email": "nobody@test.com", "password": _WRONG_PASSWORD}
    )
    assert (wrong.status_code, wrong.json()) == (unknown.status_code, unknown.json())


def test_login_and_register_keep_the_token_out_of_the_body(client):
    for r in (
        client.post(
            "/auth/register", json={"email": "nobody@test.com", "password": _PASSWORD}
        ),
        client.post(
            "/auth/login", json={"email": "nobody@test.com", "password": _PASSWORD}
        ),
    ):
        assert r.status_code in (200, 201)
        assert "access_token" not in r.text
        assert r.cookies.get("access_token")
