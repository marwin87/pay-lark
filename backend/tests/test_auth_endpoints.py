"""Tests for auth endpoints: GET /me, PATCH /me, PATCH /change-password,
PATCH /change-email, and 401 enforcement on protected routes."""

from unittest.mock import patch

import pytest

from tests.conftest import auth, enable_notifications, register_and_login

_PASSWORD = "pw123456"


# ---------------------------------------------------------------------------
# 401 — unauthenticated access to protected endpoints
# ---------------------------------------------------------------------------

_PROTECTED_ROUTES = [
    ("GET", "/auth/me"),
    ("PATCH", "/auth/me"),
    ("PATCH", "/auth/change-password"),
    ("PATCH", "/auth/change-email"),
    ("GET", "/bills"),
    ("POST", "/bills"),
    ("GET", "/bills/payments"),
    ("GET", "/export/json"),
    ("GET", "/export/xlsx"),
    ("GET", "/export/pdf"),
]


@pytest.mark.parametrize("method,path", _PROTECTED_ROUTES)
def test_unauthenticated_returns_401(client, method, path):
    r = client.request(method, path)
    assert r.status_code == 401, f"{method} {path} expected 401, got {r.status_code}"


def test_invalid_token_returns_401(client):
    r = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------


def test_get_me_returns_profile(client):
    token = register_and_login(client, "me@test.com", _PASSWORD)
    r = client.get("/auth/me", headers=auth(token))
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "me@test.com"
    assert "email_reminders_enabled" in data
    assert "notify_1_day_before" in data
    assert "monthly_summary_enabled" in data


# ---------------------------------------------------------------------------
# PATCH /auth/me
# ---------------------------------------------------------------------------


def test_patch_me_updates_language(client):
    token = register_and_login(client, "lang@test.com", _PASSWORD)
    r = client.patch(
        "/auth/me", json={"language_preference": "pl"}, headers=auth(token)
    )
    assert r.status_code == 200
    assert r.json()["language_preference"] == "pl"


def test_patch_me_updates_notification_flags(client):
    token = register_and_login(client, "notif@test.com", _PASSWORD)
    r = client.patch(
        "/auth/me",
        json={
            "email_reminders_enabled": True,
            "notify_2_days_before": True,
            "notify_on_day": True,
        },
        headers=auth(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["email_reminders_enabled"] is True
    assert data["notify_2_days_before"] is True
    assert data["notify_on_day"] is True


def test_patch_me_disables_master_toggle_and_persists(client):
    """Disabling email_reminders_enabled persists to DB and is visible on GET /me."""
    token = register_and_login(client, "toggle_off@test.com", _PASSWORD)

    # New users default to disabled; enable first
    enable_notifications(client, token)
    r = client.get("/auth/me", headers=auth(token))
    assert r.json()["email_reminders_enabled"] is True

    r = client.patch(
        "/auth/me", json={"email_reminders_enabled": False}, headers=auth(token)
    )
    assert r.status_code == 200
    assert r.json()["email_reminders_enabled"] is False

    # Re-fetch to confirm DB persistence (not just response echo)
    r = client.get("/auth/me", headers=auth(token))
    assert r.json()["email_reminders_enabled"] is False


def test_patch_me_invalid_language_returns_422(client):
    token = register_and_login(client, "badlang@test.com", _PASSWORD)
    r = client.patch(
        "/auth/me", json={"language_preference": "xx"}, headers=auth(token)
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /auth/change-password
# ---------------------------------------------------------------------------


def test_change_password_success(client):
    token = register_and_login(client, "chpw@test.com", _PASSWORD)
    r = client.patch(
        "/auth/change-password",
        json={
            "current_password": _PASSWORD,
            "new_password": "newpassword1",
        },
        headers=auth(token),
    )
    assert r.status_code == 200

    # Old token still works (JWT is stateless), but new password lets us log in
    login_r = client.post(
        "/auth/login", json={"email": "chpw@test.com", "password": "newpassword1"}
    )
    assert login_r.status_code == 200


def test_change_password_wrong_current_returns_401(client):
    token = register_and_login(client, "badpw@test.com", _PASSWORD)
    r = client.patch(
        "/auth/change-password",
        json={
            "current_password": "wrong-password",
            "new_password": "newpassword1",
        },
        headers=auth(token),
    )
    assert r.status_code == 401


def test_change_password_too_short_returns_422(client):
    token = register_and_login(client, "shortpw@test.com", _PASSWORD)
    r = client.patch(
        "/auth/change-password",
        json={"current_password": _PASSWORD, "new_password": "short"},
        headers=auth(token),
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /auth/change-email
# ---------------------------------------------------------------------------


def test_change_email_success(client):
    token = register_and_login(client, "oldemail@test.com", _PASSWORD)
    r = client.patch(
        "/auth/change-email",
        json={"new_email": "newemail@test.com", "current_password": _PASSWORD},
        headers=auth(token),
    )
    assert r.status_code == 200
    assert r.json()["email"] == "newemail@test.com"


def test_change_email_wrong_password_returns_401(client):
    token = register_and_login(client, "emailpw@test.com", _PASSWORD)
    r = client.patch(
        "/auth/change-email",
        json={"new_email": "new@test.com", "current_password": "wrongpass"},
        headers=auth(token),
    )
    assert r.status_code == 401


def test_change_email_already_taken_returns_409(client):
    tok_a = register_and_login(client, "taken_a@test.com", _PASSWORD)
    register_and_login(client, "taken_b@test.com", _PASSWORD)

    r = client.patch(
        "/auth/change-email",
        json={"new_email": "taken_b@test.com", "current_password": _PASSWORD},
        headers=auth(tok_a),
    )
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# POST /auth/register — error paths
# ---------------------------------------------------------------------------


def test_register_duplicate_email_returns_409(client):
    register_and_login(client, "dup@test.com", _PASSWORD)
    r = client.post(
        "/auth/register", json={"email": "dup@test.com", "password": _PASSWORD}
    )
    assert r.status_code == 409
    assert "already" in r.json()["detail"].lower()


def test_register_invalid_email_returns_422(client):
    r = client.post(
        "/auth/register", json={"email": "not-an-email", "password": _PASSWORD}
    )
    assert r.status_code == 422


def test_register_password_too_short_returns_422(client):
    r = client.post(
        "/auth/register", json={"email": "shortpw@test.com", "password": "short"}
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/login — error paths
# ---------------------------------------------------------------------------


def test_login_wrong_password_returns_401(client):
    register_and_login(client, "loginpw@test.com", _PASSWORD)
    r = client.post(
        "/auth/login",
        json={"email": "loginpw@test.com", "password": "wrong-password"},
    )
    assert r.status_code == 401


def test_login_unknown_email_returns_401(client):
    r = client.post(
        "/auth/login",
        json={"email": "nobody@test.com", "password": _PASSWORD},
    )
    assert r.status_code == 401


def test_login_missing_fields_returns_422(client):
    r = client.post("/auth/login", json={"email": "missing@test.com"})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/send-notification-now
# ---------------------------------------------------------------------------


def test_send_notification_no_smtp_returns_400(client):
    from unittest.mock import patch

    token = register_and_login(client, "notif_nosmtp@test.com", _PASSWORD)
    with patch("app.routers.auth.settings") as mock_settings:
        mock_settings.smtp_host = None
        r = client.post("/auth/send-notification-now", headers=auth(token))
    assert r.status_code == 400


def test_send_notification_reminders_disabled_returns_zero(client):
    from unittest.mock import patch

    token = register_and_login(client, "notif_off@test.com", _PASSWORD)
    client.patch(
        "/auth/me", json={"email_reminders_enabled": False}, headers=auth(token)
    )
    with patch("app.routers.auth.settings") as mock_settings:
        mock_settings.smtp_host = "smtp.test"
        r = client.post("/auth/send-notification-now", headers=auth(token))
    assert r.status_code == 200
    assert r.json()["sent"] == 0


def test_send_notification_calls_service_and_returns_count(client):
    from unittest.mock import patch

    token = register_and_login(client, "notif_ok@test.com", _PASSWORD)
    enable_notifications(client, token)
    with (
        patch("app.routers.auth.settings") as mock_settings,
        patch("app.routers.auth.send_reminders_for_user", return_value=2) as mock_send,
    ):
        mock_settings.smtp_host = "smtp.test"
        r = client.post("/auth/send-notification-now", headers=auth(token))
    assert r.status_code == 200
    assert r.json()["sent"] == 2
    mock_send.assert_called_once()


# ---------------------------------------------------------------------------
# POST /auth/send-monthly-summary-now
# ---------------------------------------------------------------------------


def test_send_monthly_summary_no_smtp_returns_400(client):
    from unittest.mock import patch

    token = register_and_login(client, "summary_nosmtp@test.com", _PASSWORD)
    with patch("app.routers.auth.settings") as mock_settings:
        mock_settings.smtp_host = None
        r = client.post("/auth/send-monthly-summary-now", headers=auth(token))
    assert r.status_code == 400


def test_send_monthly_summary_disabled_returns_false(client):
    from unittest.mock import patch

    token = register_and_login(client, "summary_off@test.com", _PASSWORD)
    client.patch(
        "/auth/me", json={"monthly_summary_enabled": False}, headers=auth(token)
    )
    with patch("app.routers.auth.settings") as mock_settings:
        mock_settings.smtp_host = "smtp.test"
        r = client.post("/auth/send-monthly-summary-now", headers=auth(token))
    assert r.status_code == 200
    assert r.json()["sent"] is False


def test_send_monthly_summary_master_toggle_off_returns_false(client):
    """Master toggle (email_reminders_enabled=False) also blocks monthly summary."""
    from unittest.mock import patch

    token = register_and_login(client, "summary_master_off@test.com", _PASSWORD)
    # Disable master toggle only — monthly_summary_enabled stays True (default)
    client.patch(
        "/auth/me", json={"email_reminders_enabled": False}, headers=auth(token)
    )
    with patch("app.routers.auth.settings") as mock_settings:
        mock_settings.smtp_host = "smtp.test"
        r = client.post("/auth/send-monthly-summary-now", headers=auth(token))
    assert r.status_code == 200
    assert r.json()["sent"] is False


def test_send_monthly_summary_calls_service(client):
    from unittest.mock import patch

    token = register_and_login(client, "summary_ok@test.com", _PASSWORD)
    enable_notifications(client, token)
    with (
        patch("app.routers.auth.settings") as mock_settings,
        patch(
            "app.routers.auth.send_monthly_summary_for_user", return_value=True
        ) as mock_send,
    ):
        mock_settings.smtp_host = "smtp.test"
        r = client.post("/auth/send-monthly-summary-now", headers=auth(token))
    assert r.status_code == 200
    assert r.json()["sent"] is True
    mock_send.assert_called_once()


def test_send_monthly_summary_now_does_not_set_flag(client_db):
    """Manual send must never touch monthly_summary_last_sent — only the cron does."""
    from unittest.mock import patch

    from app.models.user import User

    client, db = client_db
    token = register_and_login(client, "summary_flag@test.com", _PASSWORD)
    enable_notifications(client, token)
    with (
        patch("app.routers.auth.settings") as mock_settings,
        patch("app.routers.auth.send_monthly_summary_for_user", return_value=True),
    ):
        mock_settings.smtp_host = "smtp.test"
        r = client.post("/auth/send-monthly-summary-now", headers=auth(token))
    assert r.status_code == 200
    assert r.json()["sent"] is True

    from datetime import datetime, timezone

    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    db.expire_all()
    user = db.query(User).filter(User.email == "summary_flag@test.com").first()
    assert user.monthly_summary_last_sent != current_month


# ---------------------------------------------------------------------------
# Telegram credentials (bot token is write-only and encrypted at rest)
# ---------------------------------------------------------------------------

_BOT_TOKEN = "123456789:AAF3kxyz_-abcdefghij"  # pragma: allowlist secret


def test_patch_me_telegram_token_is_write_only_and_encrypted(client, db_session):
    from app.models.user import User

    token = register_and_login(client, "tg@test.com", _PASSWORD)
    r = client.patch(
        "/auth/me",
        json={"telegram_bot_token": _BOT_TOKEN, "telegram_chat_id": "42"},
        headers=auth(token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["telegram_bot_token_set"] is True
    assert body["telegram_chat_id"] == "42"
    assert _BOT_TOKEN not in r.text and "telegram_bot_token" not in body

    stored = db_session.query(User).filter_by(email="tg@test.com").one()
    assert stored.telegram_bot_token and _BOT_TOKEN not in stored.telegram_bot_token
    db_session.rollback()  # SQLite: an open session transaction holds the write lock

    # omitting the token keeps it; empty string clears it
    r = client.patch("/auth/me", json={"telegram_chat_id": "43"}, headers=auth(token))
    assert r.json()["telegram_bot_token_set"] is True
    r = client.patch("/auth/me", json={"telegram_bot_token": ""}, headers=auth(token))
    assert r.json()["telegram_bot_token_set"] is False


def test_send_telegram_test_requires_credentials(client):
    token = register_and_login(client, "tg2@test.com", _PASSWORD)
    r = client.post("/auth/send-telegram-test", headers=auth(token))
    assert r.status_code == 400


def test_send_telegram_test_delivers_via_notify(client):
    token = register_and_login(client, "tg3@test.com", _PASSWORD)
    client.patch(
        "/auth/me",
        json={"telegram_bot_token": _BOT_TOKEN, "telegram_chat_id": "42"},
        headers=auth(token),
    )
    with patch("app.routers.auth.notify_send") as send:
        r = client.post("/auth/send-telegram-test", headers=auth(token))
    assert r.status_code == 200
    assert send.call_args.args[0] == f"tgram://{_BOT_TOKEN}/42"


def test_telegram_schedule_is_independent_of_email_schedule(client):
    token = register_and_login(client, "tgsched@test.com", _PASSWORD)
    r = client.patch(
        "/auth/me",
        json={
            "telegram_notify_on_day": True,
            "telegram_notify_1_day_before": False,
            "telegram_send_minute": 600,
            "telegram_monthly_summary_enabled": False,
            "telegram_reminders_enabled": False,
        },
        headers=auth(token),
    )
    body = r.json()
    assert body["telegram_notify_on_day"] is True
    assert body["telegram_send_minute"] == 600
    assert body["telegram_reminders_enabled"] is False
    # email settings untouched (defaults: everything off)
    assert body["notify_on_day"] is False and body["notify_1_day_before"] is False
    assert body["reminder_send_minute"] == 480


def test_send_now_telegram_channel_requires_credentials(client):
    token = register_and_login(client, "tgnow@test.com", _PASSWORD)
    for path in ("/auth/send-notification-now", "/auth/send-monthly-summary-now"):
        r = client.post(f"{path}?channel=telegram", headers=auth(token))
        assert r.status_code == 400


def test_send_now_telegram_uses_telegram_channel(client):
    token = register_and_login(client, "tgnow2@test.com", _PASSWORD)
    enable_notifications(client, token)
    client.patch(
        "/auth/me",
        json={"telegram_bot_token": _BOT_TOKEN, "telegram_chat_id": "42"},
        headers=auth(token),
    )
    with patch("app.routers.auth.send_reminders_for_user", return_value=2) as send:
        r = client.post(
            "/auth/send-notification-now?channel=telegram", headers=auth(token)
        )
    assert r.status_code == 200 and r.json() == {"sent": 2}
    assert send.call_args.args[2].name == "telegram"

    with patch(
        "app.routers.auth.send_monthly_summary_for_user", return_value=True
    ) as summ:
        r = client.post(
            "/auth/send-monthly-summary-now?channel=telegram", headers=auth(token)
        )
    assert r.json() == {"sent": True} and summ.call_args.args[3].name == "telegram"

    client.patch(
        "/auth/me", json={"telegram_reminders_enabled": False}, headers=auth(token)
    )
    r = client.post("/auth/send-notification-now?channel=telegram", headers=auth(token))
    assert r.json() == {"sent": 0}


def test_rotated_jwt_secret_makes_stored_bot_token_unreadable(client):
    token = register_and_login(client, "tgrot@test.com", _PASSWORD)
    client.patch(
        "/auth/me",
        json={"telegram_bot_token": _BOT_TOKEN, "telegram_chat_id": "42"},
        headers=auth(token),
    )
    me = client.get("/auth/me", headers=auth(token)).json()
    assert me["telegram_bot_token_set"] is True
    assert me["telegram_bot_token_unreadable"] is False

    # JWT_SECRET changes: the stored ciphertext can no longer be decrypted
    with patch("app.services.notify.settings") as st:
        st.jwt_secret = (
            "a-completely-different-secret-value-1234"  # pragma: allowlist secret
        )
        me = client.get("/auth/me", headers=auth(token)).json()
        assert me["telegram_bot_token_set"] is False
        assert me["telegram_bot_token_unreadable"] is True
        assert (
            me["telegram_chat_id"] == "42"
        )  # chat id survives, only the token is lost

        r = client.post("/auth/send-telegram-test", headers=auth(token))
        assert r.status_code == 400

        # backup: warns instead of silently omitting the Telegram section
        r = client.get("/export/json", headers=auth(token))
        assert r.headers["X-Backup-Warning"] == "telegram-token-unreadable"
        assert "telegram" not in r.json()

        # re-entering the token under the new secret fixes it
        me = client.patch(
            "/auth/me", json={"telegram_bot_token": _BOT_TOKEN}, headers=auth(token)
        ).json()
        assert me["telegram_bot_token_set"] is True
        assert me["telegram_bot_token_unreadable"] is False


def test_no_backup_warning_when_token_is_fine_or_absent(client):
    token = register_and_login(client, "tgnowarn@test.com", _PASSWORD)
    assert (
        "X-Backup-Warning"
        not in client.get("/export/json", headers=auth(token)).headers
    )
    client.patch(
        "/auth/me",
        json={"telegram_bot_token": _BOT_TOKEN, "telegram_chat_id": "42"},
        headers=auth(token),
    )
    assert (
        "X-Backup-Warning"
        not in client.get("/export/json", headers=auth(token)).headers
    )


def test_new_user_has_all_notifications_disabled(client):
    token = register_and_login(client, "nonotif@test.com")
    me = client.get("/auth/me", headers=auth(token)).json()
    flags = [k for k in me if k.startswith(("notify_", "telegram_notify_"))] + [
        "email_reminders_enabled",
        "telegram_reminders_enabled",
        "monthly_summary_enabled",
        "telegram_monthly_summary_enabled",
        "browser_notifications_enabled",
    ]
    assert len(flags) >= 13
    assert not [k for k in flags if me[k] is not False]


# ---------------------------------------------------------------------------
# POST /auth/share-month
# ---------------------------------------------------------------------------

_SHARE = {"emails": ["friend@gmail.com"], "month": "2026-09"}


def _share(client, token, body=None):
    from unittest.mock import patch

    with (
        patch("app.routers.auth.settings") as mock_settings,
        patch(
            "app.routers.auth.send_monthly_summary_for_user", return_value=True
        ) as mock_send,
    ):
        mock_settings.smtp_host = "smtp.test"
        r = client.post("/auth/share-month", json=body or _SHARE, headers=auth(token))
    return r, mock_send


def test_share_month_requires_toggle(client):
    tok = register_and_login(client, "share_off@test.com", _PASSWORD)
    r, mock_send = _share(client, tok)
    assert r.status_code == 403
    mock_send.assert_not_called()


def test_share_month_sends_to_given_address(client):
    tok = register_and_login(client, "share_on@test.com", _PASSWORD)
    client.patch("/auth/me", json={"share_enabled": True}, headers=auth(tok))
    r, mock_send = _share(client, tok)
    assert r.status_code == 200 and r.json()["sent"] is True
    assert mock_send.call_args.args[-1] == "friend@gmail.com"
    assert mock_send.call_args.args[2] == "2026-09"


def test_share_month_sends_to_each_recipient(client):
    from app.routers.auth import _share_sent

    _share_sent.clear()
    tok = register_and_login(client, "share_multi@test.com", _PASSWORD)
    client.patch("/auth/me", json={"share_enabled": True}, headers=auth(tok))
    body = {**_SHARE, "emails": ["a@gmail.com", "b@gmail.com"]}
    r, mock_send = _share(client, tok, body)
    assert r.status_code == 200 and r.json()["sent"] is True
    assert [c.args[-1] for c in mock_send.call_args_list] == [
        "a@gmail.com",
        "b@gmail.com",
    ]


def test_share_emails_saved_normalized_and_validated(client):
    tok = register_and_login(client, "share_list@test.com", _PASSWORD)
    r = client.patch(
        "/auth/me",
        json={"share_emails": ["A@Gmail.com", "a@gmail.com", "b@gmail.com"]},
        headers=auth(tok),
    )
    assert r.json()["share_emails"] == ["a@gmail.com", "b@gmail.com"]
    bad = client.patch("/auth/me", json={"share_emails": ["nope"]}, headers=auth(tok))
    assert bad.status_code == 422
    many = [f"u{i}@gmail.com" for i in range(21)]
    assert (
        client.patch(
            "/auth/me", json={"share_emails": many}, headers=auth(tok)
        ).status_code
        == 422
    )


def test_share_month_validation_and_blocked_domain(client):
    tok = register_and_login(client, "share_val@test.com", _PASSWORD)
    client.patch("/auth/me", json={"share_enabled": True}, headers=auth(tok))
    assert _share(client, tok, {**_SHARE, "emails": ["nope"]})[0].status_code == 422
    assert _share(client, tok, {**_SHARE, "month": "2026-13"})[0].status_code == 422
    blocked = {**_SHARE, "emails": ["x@example.com"]}
    assert _share(client, tok, blocked)[0].status_code == 400


def test_share_month_smtp_missing_and_rate_limit(client):
    from app.routers.auth import _share_sent

    _share_sent.clear()  # user ids are reused across tests
    tok = register_and_login(client, "share_lim@test.com", _PASSWORD)
    client.patch("/auth/me", json={"share_enabled": True}, headers=auth(tok))
    with patch("app.routers.auth.settings") as mock_settings:
        mock_settings.smtp_host = None
        r = client.post("/auth/share-month", json=_SHARE, headers=auth(tok))
    assert r.status_code == 400
    codes = [_share(client, tok)[0].status_code for _ in range(11)]
    assert codes[:10] == [200] * 10 and codes[10] == 429


def test_theme_is_stored_per_user(client):
    a = register_and_login(client, "theme_a@test.com")
    b = register_and_login(client, "theme_b@test.com")
    assert client.get("/auth/me", headers=auth(a)).json()["theme"] == "light"

    r = client.patch("/auth/me", json={"theme": "vesperfall"}, headers=auth(b))
    assert r.status_code == 200
    assert client.get("/auth/me", headers=auth(a)).json()["theme"] == "light"
    assert client.get("/auth/me", headers=auth(b)).json()["theme"] == "vesperfall"

    r = client.patch("/auth/me", json={"theme": "neon"}, headers=auth(a))
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# bcrypt's 72-byte limit: rejected as 422, never a 500
# ---------------------------------------------------------------------------

_TOO_LONG = "a" * 73
_TOO_LONG_MULTIBYTE = "ł" * 37  # 37 chars but 74 bytes


@pytest.mark.parametrize("pw", [_TOO_LONG, _TOO_LONG_MULTIBYTE])
def test_over_72_byte_password_returns_422(client, pw):
    token = register_and_login(client, "longpw@test.com", _PASSWORD)
    assert (
        client.post(
            "/auth/register", json={"email": "other@test.com", "password": pw}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/auth/login", json={"email": "longpw@test.com", "password": pw}
        ).status_code
        == 422
    )
    r = client.patch(
        "/auth/change-password",
        json={"current_password": _PASSWORD, "new_password": pw},
        headers=auth(token),
    )
    assert r.status_code == 422
    r = client.post(
        "/auth/reset-password", json={"token": "whatever", "new_password": pw}
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Emails are case-insensitive
# ---------------------------------------------------------------------------


def test_register_email_case_insensitive_duplicate_returns_409(client):
    register_and_login(client, "case@test.com", _PASSWORD)
    r = client.post(
        "/auth/register", json={"email": "CASE@Test.com", "password": _PASSWORD}
    )
    assert r.status_code == 409


def test_login_email_case_insensitive(client):
    register_and_login(client, "Mixed@Test.com", _PASSWORD)
    r = client.post(
        "/auth/login", json={"email": "mIXED@test.COM", "password": _PASSWORD}
    )
    assert r.status_code == 200
    token = r.cookies["access_token"]
    assert client.get("/auth/me", headers=auth(token)).json()["email"] == (
        "mixed@test.com"
    )


def test_change_email_is_lowercased_and_conflicts_case_insensitively(client):
    token = register_and_login(client, "ce1@test.com", _PASSWORD)
    register_and_login(client, "ce2@test.com", _PASSWORD)
    r = client.patch(
        "/auth/change-email",
        json={"new_email": "CE2@test.com", "current_password": _PASSWORD},
        headers=auth(token),
    )
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# DELETE /auth/users/me — requires the current password
# ---------------------------------------------------------------------------


def _delete_me(client, token, password=None):
    body = {} if password is None else {"current_password": password}
    return client.request("DELETE", "/auth/users/me", json=body, headers=auth(token))


def test_delete_account_wrong_password_returns_401_and_keeps_account(client):
    token = register_and_login(client, "delwrong@test.com", _PASSWORD)
    assert (
        _delete_me(client, token, "not-my-password").status_code == 401
    )  # pragma: allowlist secret
    assert client.get("/auth/me", headers=auth(token)).status_code == 200


def test_delete_account_without_password_returns_422(client):
    token = register_and_login(client, "delnone@test.com", _PASSWORD)
    assert _delete_me(client, token).status_code == 422
    assert client.get("/auth/me", headers=auth(token)).status_code == 200


def test_delete_account_with_password_succeeds(client):
    token = register_and_login(client, "delok@test.com", _PASSWORD)
    assert _delete_me(client, token, _PASSWORD).status_code == 204
    assert client.get("/auth/me", headers=auth(token)).status_code == 401
