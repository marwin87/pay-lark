"""Integration tests for POST /export/restore."""

import json

import pytest

from tests.conftest import auth, category_id, register_and_login, sync_payments

_BILL = {
    "name": "Electricity",
    "category": "utilities",
    "frequency": "monthly",
    "amount": 120.00,
    "currency": "PLN",
    "due_day": 15,
    "notes": None,
}

_BILL2 = {
    "name": "Internet",
    "category": "utilities",
    "frequency": "monthly",
    "amount": 50.00,
    "currency": "PLN",
    "due_day": 10,
    "notes": None,
}

_BILL_ALPHA = {
    "name": "Alpha Bill",
    "category": "utilities",
    "frequency": "monthly",
    "amount": 50.00,
    "currency": "PLN",
    "due_day": 5,
    "notes": None,
    "end_period": "2099-12",  # exercised by the round-trip test
}

_BILL_BETA = {
    "name": "Beta Bill",
    "category": "entertainment",
    "frequency": "monthly",
    "amount": 75.00,
    "currency": "EUR",
    "due_day": 20,
    "notes": "template note",
}


def _upload(client, token, payload):
    return client.post(
        "/export/restore",
        files={
            "file": ("backup.json", json.dumps(payload).encode(), "application/json")
        },
        headers=auth(token),
    )


def _make_backup(templates, instances, schema_version: int = 3):
    return {
        "schema_version": schema_version,
        "exported_by": "test@example.com",
        "exported_at": "2026-01-01T00:00:00+00:00",
        "bill_templates": templates,
        "payment_instances": instances,
    }


# Fields not preserved through restore (created_at uses DB default on insert;
# category_id is remapped since categories are wiped and reinserted too).
_EXCLUDE_TEMPLATE = {"id", "created_at", "category_id"}
_EXCLUDE_INSTANCE = {"id", "bill_id", "created_at"}


def _norm_template(t: dict) -> dict:
    return {k: v for k, v in t.items() if k not in _EXCLUDE_TEMPLATE}


def _norm_instance(i: dict) -> dict:
    return {k: v for k, v in i.items() if k not in _EXCLUDE_INSTANCE}


def _make_instance_dict(
    template_id: int,
    period: str,
    *,
    include_reminder_fields: bool = True,
    reminder_sent_upcoming: bool = False,
    reminder_sent_overdue: bool = False,
    **overrides,
) -> dict:
    """Build a BackupInstance-shaped dict. Pass include_reminder_fields=False for a true v2 payload."""
    year, month = int(period[:4]), int(period[5:7])
    base: dict = {
        "id": 1,
        "bill_id": template_id,
        "period": period,
        "due_date": f"{year}-{month:02d}-15",
        "amount": 100.0,
        "status": "upcoming",
        "paid_at": None,
        "paid_amount": None,
        "notes": None,
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    if include_reminder_fields:
        base["reminder_sent_upcoming"] = reminder_sent_upcoming
        base["reminder_sent_overdue"] = reminder_sent_overdue
    base.update(overrides)
    return base


def test_restore_happy_path(client):
    tok = register_and_login(client, "a@test.com")

    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r.status_code == 201
    sync_payments(client, tok)
    client.get("/bills/payments", headers=auth(tok))

    backup = client.get("/export/json", headers=auth(tok)).json()

    r = _upload(client, tok, backup)
    assert r.status_code == 200
    data = r.json()
    assert data["restored_templates"] == len(backup["bill_templates"])
    assert data["restored_instances"] == len(backup["payment_instances"])

    after = client.get("/export/json", headers=auth(tok)).json()
    assert len(after["bill_templates"]) == len(backup["bill_templates"])
    assert len(after["payment_instances"]) == len(backup["payment_instances"])
    assert after["bill_templates"][0]["name"] == backup["bill_templates"][0]["name"]


def test_restore_wrong_schema_version(client):
    tok = register_and_login(client, "a@test.com")
    payload = _make_backup([], [])
    payload["schema_version"] = 1

    r = _upload(client, tok, payload)
    assert r.status_code == 422
    assert "schema version" in r.json()["detail"].lower()


def test_restore_orphaned_instance(client):
    tok = register_and_login(client, "a@test.com")

    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r.status_code == 201
    sync_payments(client, tok)
    client.get("/bills/payments", headers=auth(tok))

    backup = client.get("/export/json", headers=auth(tok)).json()

    backup["payment_instances"][0]["bill_id"] = 99999

    r = _upload(client, tok, backup)
    assert r.status_code == 422
    assert "orphaned" in r.json()["detail"].lower()


def test_restore_replaces_existing_data(client):
    tok = register_and_login(client, "a@test.com")

    r1 = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r1.status_code == 201
    r2 = client.post(
        "/bills",
        json={**_BILL2, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r2.status_code == 201

    template_id = r1.json()["id"]
    one_template_backup = _make_backup(
        [
            {
                "id": template_id,
                "name": _BILL["name"],
                "category": _BILL["category"],
                "frequency": _BILL["frequency"],
                "amount": _BILL["amount"],
                "currency": _BILL["currency"],
                "due_day": _BILL["due_day"],
                "notes": None,
                "is_archived": False,
                "start_period": None,
                "created_at": "2026-01-01T00:00:00+00:00",
            }
        ],
        [],
    )

    r = _upload(client, tok, one_template_backup)
    assert r.status_code == 200

    bills = client.get("/bills", headers=auth(tok)).json()
    assert len(bills) == 1
    assert bills[0]["name"] == _BILL["name"]


def test_restore_user_isolation(client):
    tok_a = register_and_login(client, "a@test.com")
    tok_b = register_and_login(client, "b@test.com")

    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok_a)},
        headers=auth(tok_a),
    )
    assert r.status_code == 201

    empty_backup = _make_backup([], [])
    r = _upload(client, tok_b, empty_backup)
    assert r.status_code == 200

    bills_a = client.get("/bills", headers=auth(tok_a)).json()
    assert len(bills_a) == 1
    assert bills_a[0]["name"] == _BILL["name"]


def test_restore_requires_auth(client):
    payload = _make_backup([], [])
    r = client.post(
        "/export/restore",
        files={
            "file": ("backup.json", json.dumps(payload).encode(), "application/json")
        },
    )
    assert r.status_code == 401


def test_round_trip_field_level(client):
    """Seed → export → restore → re-export: all schema fields (except id/bill_id/created_at) survive unchanged."""
    tok = register_and_login(client, "rt@test.com")

    r1 = client.post(
        "/bills",
        json={**_BILL_ALPHA, "category_id": category_id(client, tok, "utilities")},
        headers=auth(tok),
    )
    assert r1.status_code == 201
    r2 = client.post(
        "/bills",
        json={**_BILL_BETA, "category_id": category_id(client, tok, "entertainment")},
        headers=auth(tok),
    )
    assert r2.status_code == 201

    sync_payments(client, tok)
    payments = client.get("/bills/payments", headers=auth(tok)).json()
    assert len(payments) >= 2

    alpha_instance = next(p for p in payments if p["bill_name"] == "Alpha Bill")
    r = client.post(
        f"/bills/payments/{alpha_instance['id']}/pay",
        json={"paid_amount": 45.00, "notes": "paid early"},
        headers=auth(tok),
    )
    assert r.status_code == 200

    backup = client.get("/export/json", headers=auth(tok)).json()
    n_templates = len(backup["bill_templates"])
    n_instances = len(backup["payment_instances"])
    assert n_instances >= 2  # ensure field-level loop actually exercises rows

    r = _upload(client, tok, backup)
    assert r.status_code == 200
    data = r.json()
    assert data["restored_templates"] == n_templates
    assert data["restored_instances"] == n_instances

    after = client.get("/export/json", headers=auth(tok)).json()
    assert len(after["bill_templates"]) == n_templates
    assert len(after["payment_instances"]) == n_instances

    before_templates = sorted(backup["bill_templates"], key=lambda t: t["name"])
    after_templates = sorted(after["bill_templates"], key=lambda t: t["name"])
    for b, a in zip(before_templates, after_templates):
        assert _norm_template(b) == _norm_template(a), f"Template mismatch: {b['name']}"

    before_instances = sorted(
        backup["payment_instances"],
        key=lambda i: (i["period"], i["amount"], i["status"]),
    )
    after_instances = sorted(
        after["payment_instances"],
        key=lambda i: (i["period"], i["amount"], i["status"]),
    )
    for b, a in zip(before_instances, after_instances):
        assert _norm_instance(b) == _norm_instance(
            a
        ), f"Instance mismatch: period={b['period']}"


def test_v2_backup_defaults_reminder_fields(client):
    """A v2-format backup (no reminder fields in instance dicts) restores with reminder flags = False."""
    tok = register_and_login(client, "v2@test.com")

    r = client.post(
        "/bills",
        json={**_BILL_ALPHA, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r.status_code == 201
    template_id = r.json()["id"]

    template_dict = {
        "id": template_id,
        "name": _BILL_ALPHA["name"],
        "category": _BILL_ALPHA["category"],
        "frequency": _BILL_ALPHA["frequency"],
        "amount": _BILL_ALPHA["amount"],
        "currency": _BILL_ALPHA["currency"],
        "due_day": _BILL_ALPHA["due_day"],
        "notes": None,
        "is_archived": False,
        "start_period": None,
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    instance_dict = _make_instance_dict(
        template_id, "2026-01", include_reminder_fields=False
    )
    payload = _make_backup([template_dict], [instance_dict], schema_version=2)

    r = _upload(client, tok, payload)
    assert r.status_code == 200
    assert r.json()["restored_instances"] == 1

    after = client.get("/export/json", headers=auth(tok)).json()
    assert len(after["payment_instances"]) == 1
    inst = after["payment_instances"][0]
    assert inst["reminder_sent_upcoming"] is False
    assert inst["reminder_sent_overdue"] is False


def test_restore_cross_user_import(client):
    """User B can upload a backup created by user A; data lands under B's account, A's data untouched."""
    tok_a = register_and_login(client, "cross_a@test.com")
    tok_b = register_and_login(client, "cross_b@test.com")

    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok_a)},
        headers=auth(tok_a),
    )
    assert r.status_code == 201
    sync_payments(client, tok_a)
    client.get("/bills/payments", headers=auth(tok_a))

    backup_a = client.get("/export/json", headers=auth(tok_a)).json()
    assert backup_a["exported_by"] == "cross_a@test.com"
    assert len(backup_a["bill_templates"]) == 1

    r = _upload(client, tok_b, backup_a)
    assert r.status_code == 200
    data = r.json()
    assert data["restored_templates"] == 1

    bills_b = client.get("/bills", headers=auth(tok_b)).json()
    assert len(bills_b) == 1
    assert bills_b[0]["name"] == _BILL["name"]

    bills_a = client.get("/bills", headers=auth(tok_a)).json()
    assert len(bills_a) == 1
    assert bills_a[0]["name"] == _BILL["name"]

    backup_b_after = client.get("/export/json", headers=auth(tok_b)).json()
    assert backup_b_after["exported_by"] == "cross_b@test.com"


def test_v3_backup_preserves_reminder_flags(client):
    """A v3 backup with reminder_sent_upcoming=True preserves the flag through restore."""
    tok = register_and_login(client, "v3@test.com")

    r = client.post(
        "/bills",
        json={**_BILL_ALPHA, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r.status_code == 201
    template_id = r.json()["id"]

    template_dict = {
        "id": template_id,
        "name": _BILL_ALPHA["name"],
        "category": _BILL_ALPHA["category"],
        "frequency": _BILL_ALPHA["frequency"],
        "amount": _BILL_ALPHA["amount"],
        "currency": _BILL_ALPHA["currency"],
        "due_day": _BILL_ALPHA["due_day"],
        "notes": None,
        "is_archived": False,
        "start_period": None,
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    instance_dict = _make_instance_dict(
        template_id,
        "2026-01",
        reminder_sent_upcoming=True,
        reminder_sent_overdue=False,
    )
    v3_payload = _make_backup([template_dict], [instance_dict])
    v3_payload["schema_version"] = 3

    r = _upload(client, tok, v3_payload)
    assert r.status_code == 200

    after = client.get("/export/json", headers=auth(tok)).json()
    assert len(after["payment_instances"]) == 1
    inst = after["payment_instances"][0]
    assert inst["reminder_sent_upcoming"] is True
    assert inst["reminder_sent_overdue"] is False


def test_v4_backup_round_trips_categories(client):
    """v4 backup includes the categories array; restore recreates them and remaps
    each bill's category_id to the newly-inserted category correctly."""
    tok = register_and_login(client, "v4cat@test.com")

    r = client.post(
        "/categories", json={"name": "Hobbies", "color": "pink"}, headers=auth(tok)
    )
    assert r.status_code == 201
    custom_category_id = r.json()["id"]

    r = client.post(
        "/bills",
        json={**_BILL_ALPHA, "category_id": custom_category_id},
        headers=auth(tok),
    )
    assert r.status_code == 201

    backup = client.get("/export/json", headers=auth(tok)).json()
    assert backup["schema_version"] == 8
    assert any(c["name"] == "Hobbies" for c in backup["categories"])

    r = _upload(client, tok, backup)
    assert r.status_code == 200

    after = client.get("/export/json", headers=auth(tok)).json()
    assert len(after["categories"]) == len(backup["categories"])
    restored_bill = after["bill_templates"][0]
    restored_category = next(
        c for c in after["categories"] if c["id"] == restored_bill["category_id"]
    )
    assert restored_category["name"] == "Hobbies"


def test_legacy_restore_falls_back_to_other_for_unknown_category_slug(client):
    """A v2/v3 backup whose category string matches none of the user's current
    categories falls back to their 'other' category instead of failing."""
    tok = register_and_login(client, "legacy_fallback@test.com")

    template_dict = {
        "id": 1,
        "name": "Mystery Bill",
        "category": "no_such_category",
        "frequency": "monthly",
        "amount": 10.0,
        "currency": "PLN",
        "due_day": 1,
        "notes": None,
        "is_archived": False,
        "start_period": None,
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    payload = _make_backup([template_dict], [], schema_version=3)

    r = _upload(client, tok, payload)
    assert r.status_code == 200

    bills = client.get("/bills", headers=auth(tok)).json()
    assert len(bills) == 1
    assert bills[0]["category"]["slug"] == "other"


# ---------------------------------------------------------------------------
# POST /export/restore — error paths (lines 182–198 of export.py)
# ---------------------------------------------------------------------------


def test_restore_invalid_json_returns_422(client):
    """Malformed body → 422 with the generic invalid-file detail."""
    tok = register_and_login(client, "inv_json@test.com")
    r = client.post(
        "/export/restore",
        files={"file": ("backup.json", b"not { valid json }", "application/json")},
        headers=auth(tok),
    )
    assert r.status_code == 422
    assert r.json()["detail"] == "Invalid backup file"


def test_restore_unsupported_content_type_returns_415(client):
    """Non-JSON, non-plain content type → 415."""
    tok = register_and_login(client, "inv_ct@test.com")
    r = client.post(
        "/export/restore",
        files={"file": ("backup.json", b"{}", "application/pdf")},
        headers=auth(tok),
    )
    assert r.status_code == 415


def test_restore_file_too_large_returns_413(client):
    """File exceeding 10 MB → 413."""
    tok = register_and_login(client, "too_large@test.com")
    big_content = b"x" * (10 * 1024 * 1024 + 1)
    r = client.post(
        "/export/restore",
        files={"file": ("backup.json", big_content, "application/json")},
        headers=auth(tok),
    )
    assert r.status_code == 413


def test_restore_pydantic_validation_error_returns_422(client):
    """Valid schema_version but structurally invalid payload → 422 from Pydantic."""
    tok = register_and_login(client, "pydantic_err@test.com")
    # schema_version is valid (3) but bill_templates contains invalid data
    payload = {
        "schema_version": 3,
        "exported_by": "x@x.com",
        "exported_at": "2026-01-01T00:00:00+00:00",
        "bill_templates": [{"id": "not-an-int", "name": 123}],
        "payment_instances": [],
    }
    r = client.post(
        "/export/restore",
        files={
            "file": (
                "backup.json",
                __import__("json").dumps(payload).encode(),
                "application/json",
            )
        },
        headers=auth(tok),
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Telegram credentials in backups
# ---------------------------------------------------------------------------

_TG_TOKEN = "123456789:AAF3kxyz_-abcdefghij"  # pragma: allowlist secret


def _set_telegram(client, tok, token=_TG_TOKEN, chat_id="42"):
    r = client.patch(
        "/auth/me",
        json={"telegram_bot_token": token, "telegram_chat_id": chat_id},
        headers=auth(tok),
    )
    assert r.status_code == 200, r.text


def test_export_includes_telegram_credentials_in_plaintext(client):
    tok = register_and_login(client, "tgexp@test.com")
    assert "telegram" not in client.get("/export/json", headers=auth(tok)).json()

    _set_telegram(client, tok)
    body = client.get("/export/json", headers=auth(tok)).json()
    assert body["telegram"] == {"bot_token": _TG_TOKEN, "chat_id": "42"}


def test_restore_applies_telegram_credentials(client):
    tok = register_and_login(client, "tgres@test.com")
    payload = {
        **_make_backup([], [], 4),
        "telegram": {"bot_token": _TG_TOKEN, "chat_id": "77"},
    }
    assert _upload(client, tok, payload).status_code == 200

    me = client.get("/auth/me", headers=auth(tok)).json()
    assert me["telegram_bot_token_set"] is True and me["telegram_chat_id"] == "77"
    # round-trips through export
    assert client.get("/export/json", headers=auth(tok)).json()["telegram"] == {
        "bot_token": _TG_TOKEN,
        "chat_id": "77",
    }


def test_restore_without_telegram_keeps_current_credentials(client):
    tok = register_and_login(client, "tgkeep@test.com")
    _set_telegram(client, tok)
    assert _upload(client, tok, _make_backup([], [], 4)).status_code == 200
    me = client.get("/auth/me", headers=auth(tok)).json()
    assert me["telegram_bot_token_set"] is True and me["telegram_chat_id"] == "42"


def test_restore_rejects_malformed_telegram_section(client):
    tok = register_and_login(client, "tgbad@test.com")
    payload = {
        **_make_backup([], [], 4),
        "telegram": {"bot_token": "nope", "chat_id": "x"},
    }
    assert _upload(client, tok, payload).status_code == 422


def test_snapshot_never_stores_bot_token(client, db_session):
    from app.models.restore_snapshot import RestoreSnapshot

    tok = register_and_login(client, "tgsnap@test.com")
    _set_telegram(client, tok)
    client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert _upload(client, tok, _make_backup([], [], 4)).status_code == 200

    snap = db_session.query(RestoreSnapshot).one()
    assert _TG_TOKEN not in json.dumps(snap.payload)


# ---------------------------------------------------------------------------
# Notification schedules in backups (email, Telegram, browser)
# ---------------------------------------------------------------------------

_SCHED = {
    "enabled": False,
    "notify_2_days_before": True,
    "notify_1_day_before": False,
    "notify_on_day": True,
    "notify_1_day_after": True,
    "send_minute": 600,
    "monthly_summary_enabled": False,
}


def test_export_includes_both_schedules_and_browser_flag(client):
    tok = register_and_login(client, "nsexp@test.com")
    client.patch(
        "/auth/me",
        json={
            "notify_on_day": True,
            "reminder_send_minute": 90,
            "telegram_notify_1_day_after": True,
            "telegram_send_minute": 630,
            "browser_notifications_enabled": True,
        },
        headers=auth(tok),
    )
    n = client.get("/export/json", headers=auth(tok)).json()["notifications"]
    assert n["email"]["notify_on_day"] is True and n["email"]["send_minute"] == 90
    assert n["telegram"]["notify_1_day_after"] is True
    assert n["telegram"]["send_minute"] == 630
    assert n["browser_enabled"] is True


def test_restore_applies_each_schedule_independently(client):
    tok = register_and_login(client, "nsres@test.com")
    payload = {
        **_make_backup([], [], 4),
        "notifications": {
            "email": _SCHED,
            "telegram": {**_SCHED, "enabled": True, "send_minute": 780},
            "browser_enabled": True,
        },
    }
    assert _upload(client, tok, payload).status_code == 200

    me = client.get("/auth/me", headers=auth(tok)).json()
    assert me["email_reminders_enabled"] is False and me["reminder_send_minute"] == 600
    assert me["notify_on_day"] is True and me["monthly_summary_enabled"] is False
    assert (
        me["telegram_reminders_enabled"] is True and me["telegram_send_minute"] == 780
    )
    assert me["telegram_notify_1_day_after"] is True
    assert me["browser_notifications_enabled"] is True


def test_restore_without_notifications_keeps_current_settings(client):
    tok = register_and_login(client, "nskeep@test.com")
    client.patch("/auth/me", json={"reminder_send_minute": 90}, headers=auth(tok))
    assert _upload(client, tok, _make_backup([], [], 3)).status_code == 200
    assert (
        client.get("/auth/me", headers=auth(tok)).json()["reminder_send_minute"] == 90
    )


def test_restore_rejects_out_of_range_send_minute(client):
    tok = register_and_login(client, "nsbad@test.com")
    payload = {
        **_make_backup([], [], 4),
        "notifications": {"email": {**_SCHED, "send_minute": 5000}},
    }
    assert _upload(client, tok, payload).status_code == 422


def test_snapshot_restore_reverts_notification_schedule(client):
    tok = register_and_login(client, "nssnap@test.com")
    client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    client.patch("/auth/me", json={"reminder_send_minute": 90}, headers=auth(tok))
    payload = {**_make_backup([], [], 4), "notifications": {"email": _SCHED}}
    assert _upload(client, tok, payload).status_code == 200
    assert (
        client.get("/auth/me", headers=auth(tok)).json()["reminder_send_minute"] == 600
    )

    r = client.post("/export/restore-snapshot", headers=auth(tok))
    assert r.status_code == 200, r.text
    assert (
        client.get("/auth/me", headers=auth(tok)).json()["reminder_send_minute"] == 90
    )


def test_end_period_export_restore_and_snapshot(client):
    tok = register_and_login(client, "endp@test.com")
    body = {**_BILL, "category_id": category_id(client, tok), "end_period": "2099-06"}
    assert client.post("/bills", json=body, headers=auth(tok)).status_code == 201

    backup = client.get("/export/json", headers=auth(tok)).json()
    assert backup["bill_templates"][0]["end_period"] == "2099-06"

    # Backups written before the field existed restore with end_period = None
    legacy = {
        **backup,
        "bill_templates": [
            {k: v for k, v in t.items() if k != "end_period"}
            for t in backup["bill_templates"]
        ],
    }
    assert _upload(client, tok, legacy).status_code == 200
    bills = client.get("/bills", headers=auth(tok)).json()
    assert bills[0]["end_period"] is None

    # The snapshot taken by that restore still holds the end period; undoing brings it back
    assert client.post("/export/restore-snapshot", headers=auth(tok)).status_code == 200
    assert client.get("/bills", headers=auth(tok)).json()[0]["end_period"] == "2099-06"

    # Restoring a file that carries the field sets it
    assert _upload(client, tok, legacy).status_code == 200
    assert _upload(client, tok, backup).status_code == 200
    assert client.get("/bills", headers=auth(tok)).json()[0]["end_period"] == "2099-06"


def test_legacy_frequencies_map_to_monthly_interval(client):
    """Pre-v6 backups: quarterly -> monthly/3, every_2_months -> monthly/2."""
    tok = register_and_login(client, "legacy_freq@test.com")
    templates = [
        {
            **_BILL,
            "id": 1,
            "name": "Q",
            "frequency": "quarterly",
            "is_archived": False,
            "start_period": "2026-01",
            "created_at": "2026-01-01T00:00:00+00:00",
        },
        {
            **_BILL2,
            "id": 2,
            "name": "B",
            "frequency": "every_2_months",
            "is_archived": False,
            "start_period": "2026-01",
            "created_at": "2026-01-01T00:00:00+00:00",
        },
    ]
    r = _upload(client, tok, _make_backup(templates, [], schema_version=5))
    assert r.status_code == 200, r.text
    got = {
        t["name"]: (t["frequency"], t["interval"])
        for t in client.get("/export/json", headers=auth(tok)).json()["bill_templates"]
    }
    assert got == {"Q": ("monthly", 3), "B": ("monthly", 2)}


def test_amount_override_export_restore_and_snapshot(client):
    tok = register_and_login(client, "ovr@test.com")
    body = {**_BILL, "category_id": category_id(client, tok)}
    assert client.post("/bills", json=body, headers=auth(tok)).status_code == 201
    sync_payments(client, tok)
    [inst] = client.get("/bills/payments", headers=auth(tok)).json()
    r = client.patch(
        f"/bills/payments/{inst['id']}",
        json={"amount": "143.20", "notes": "invoice 7"},
        headers=auth(tok),
    )
    assert r.status_code == 200

    backup = client.get("/export/json", headers=auth(tok)).json()
    assert backup["payment_instances"][0]["amount_override"] == 143.2

    # Backups written before the field existed restore with no override
    legacy = {
        **backup,
        "payment_instances": [
            {k: v for k, v in i.items() if k != "amount_override"}
            for i in backup["payment_instances"]
        ],
    }
    assert _upload(client, tok, legacy).status_code == 200
    [p] = client.get("/bills/payments", headers=auth(tok)).json()
    assert p["amount_overridden"] is False and p["amount"] == "120.00"

    # The snapshot taken by that restore still holds the override; undoing brings it back
    assert client.post("/export/restore-snapshot", headers=auth(tok)).status_code == 200
    [p] = client.get("/bills/payments", headers=auth(tok)).json()
    assert p["amount_overridden"] is True and p["amount"] == "143.20"
    assert p["notes"] == "invoice 7"

    # Restoring a file that carries the field sets it, and a re-export is identical
    assert _upload(client, tok, legacy).status_code == 200
    assert _upload(client, tok, backup).status_code == 200
    [p] = client.get("/bills/payments", headers=auth(tok)).json()
    assert p["amount_overridden"] is True and p["amount"] == "143.20"
    after = client.get("/export/json", headers=auth(tok)).json()
    assert [_norm_instance(i) for i in after["payment_instances"]] == [
        _norm_instance(i) for i in backup["payment_instances"]
    ]


@pytest.mark.parametrize(
    "body",
    [
        b"[]",
        b'"x"',
        b"null",
        b"5",
        b'{"schema_version": [1]}',
        b'{"schema_version": {}}',
    ],
)
def test_restore_non_object_or_bad_version_returns_422(client, body):
    """Valid JSON that isn't a backup object must be a 422, never a 500."""
    tok = register_and_login(client, "nonobj@test.com")
    r = client.post(
        "/export/restore",
        files={"file": ("backup.json", body, "application/json")},
        headers=auth(tok),
    )
    assert r.status_code == 422


def test_multi_day_bill_round_trips_through_backup(client):
    """due_days and each payment's slot survive export → restore → re-export."""
    tok = register_and_login(client, "rt_multi@test.com")
    r = client.post(
        "/bills",
        json={
            **_BILL_ALPHA,
            "category_id": category_id(client, tok, "utilities"),
            "due_days": [3, 10, 17],
        },
        headers=auth(tok),
    )
    assert r.status_code == 201, r.text
    sync_payments(client, tok)

    backup = client.get("/export/json", headers=auth(tok)).json()
    assert backup["schema_version"] == 8
    assert backup["bill_templates"][0]["due_days"] == [3, 10, 17]
    slots = sorted(i["slot"] for i in backup["payment_instances"])
    assert slots == [0, 1, 2]

    assert _upload(client, tok, backup).status_code == 200
    after = client.get("/export/json", headers=auth(tok)).json()
    assert after["bill_templates"][0]["due_days"] == [3, 10, 17]
    assert sorted(i["slot"] for i in after["payment_instances"]) == [0, 1, 2]


def test_v7_backup_without_slot_restores_as_single_slot(client):
    """Backups from before multi-day bills carry neither due_days nor slot."""
    tok = register_and_login(client, "v7_restore@test.com")
    template = {
        "id": 1,
        "name": "Old bill",
        "category": "utilities",
        "frequency": "monthly",
        "amount": 50.0,
        "currency": "PLN",
        "due_day": 5,
        "notes": None,
        "is_archived": False,
        "start_period": "2026-05",
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    backup = _make_backup([template], [_make_instance_dict(1, "2026-05")], 7)

    r = _upload(client, tok, backup)

    assert r.status_code == 200, r.text
    after = client.get("/export/json", headers=auth(tok)).json()
    assert after["payment_instances"][0]["slot"] == 0
    assert after["bill_templates"][0]["due_days"] is None
