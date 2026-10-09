"""Selective export (GET /export/json?sections=...) and partial restore."""

import json

import pytest

from app.services.categories import CATEGORY_COLORS

from tests.conftest import auth, category_id, register_and_login

_ALL = [
    "bills",
    "categories",
    "email",
    "telegram",
    "languages",
    "currency",
    "export",
    "pdf",
    "share",
]
_KEYS = {
    "bills": {"bill_templates", "payment_instances"},
    "categories": {"categories"},
    "email": {"notifications"},
    "telegram": {"notifications", "telegram"},
    "languages": {"preferences"},
    "currency": {"preferences"},
    "export": {"preferences"},
    "pdf": {"preferences"},
    "share": {"preferences"},
}
_ALL_KEYS = set().union(*_KEYS.values())
_META = {"schema_version", "exported_by", "exported_at"}
_TOKEN = "123456:ABCdefGHIjklMNOpqrsTUVwxyz"  # pragma: allowlist secret


def _upload(client, tok, payload):
    return client.post(
        "/export/restore",
        files={"file": ("b.json", json.dumps(payload).encode(), "application/json")},
        headers=auth(tok),
    )


def _export(client, tok, sections=None):
    params = [("sections", s) for s in sections] if sections else None
    r = client.get("/export/json", params=params, headers=auth(tok))
    assert r.status_code == 200, r.text
    return r.json()


def _seed(client, tok):
    r = client.post(
        "/bills",
        json={
            "name": "Rent",
            "frequency": "monthly",
            "amount": 900,
            "currency": "PLN",
            "due_day": 1,
            "category_id": category_id(client, tok),
        },
        headers=auth(tok),
    )
    assert r.status_code == 201, r.text
    r = client.patch(
        "/auth/me",
        json={
            "telegram_bot_token": _TOKEN,
            "telegram_chat_id": "42",
            "default_currency": "EUR",
            "enabled_languages": ["en", "de"],
            "language_preference": "de",
        },
        headers=auth(tok),
    )
    assert r.status_code == 200, r.text


def _me(client, tok):
    return client.get("/auth/me", headers=auth(tok)).json()


def _bills(client, tok):
    return client.get("/bills", headers=auth(tok)).json()


def test_export_default_is_full(client):
    tok = register_and_login(client, "full@test.com")
    _seed(client, tok)
    body = _export(client, tok)
    assert set(body) == _META | _ALL_KEYS
    assert body["schema_version"] == 8
    assert body["preferences"] == {
        "language_preference": "de",
        "enabled_languages": ["en", "de"],
        "default_currency": "EUR",
        "decimal_separator": ".",
        "export_enabled": True,
        "export_fields": [
            "bill",
            "category",
            "period",
            "due_date",
            "amount",
            "currency",
            "status",
            "paid_amount",
            "paid_at",
            "notes",
        ],
        "pdf_fields": [
            "bill",
            "category",
            "period",
            "due_date",
            "amount",
            "currency",
            "status",
            "paid_amount",
            "paid_at",
            "notes",
        ],
        "pdf_enabled": True,
        "share_enabled": False,
        "share_emails": [],
    }
    assert body["telegram"]["bot_token"] == _TOKEN
    assert set(body["notifications"]) == {
        "email",
        "telegram",
        "browser_enabled",
        "timezone",
    }


@pytest.mark.parametrize("section", _ALL)
def test_export_single_section(client, section):
    tok = register_and_login(client, f"one-{section}@test.com")
    _seed(client, tok)
    body = _export(client, tok, [section])
    assert set(body) == _META | _KEYS[section]


def test_export_prefs_sections_are_independent(client):
    tok = register_and_login(client, "prefs@test.com")
    _seed(client, tok)
    assert set(_export(client, tok, ["languages"])["preferences"]) == {
        "language_preference",
        "enabled_languages",
    }
    assert set(_export(client, tok, ["currency"])["preferences"]) == {
        "default_currency",
        "decimal_separator",
    }
    assert set(_export(client, tok, ["export"])["preferences"]) == {
        "export_enabled",
        "export_fields",
    }
    assert set(_export(client, tok, ["pdf"])["preferences"]) == {
        "pdf_enabled",
        "pdf_fields",
    }
    assert set(_export(client, tok, ["share"])["preferences"]) == {
        "share_enabled",
        "share_emails",
    }


def test_export_email_excludes_telegram_and_vice_versa(client):
    tok = register_and_login(client, "chan@test.com")
    _seed(client, tok)
    email = _export(client, tok, ["email"])
    assert set(email["notifications"]) == {"email", "browser_enabled", "timezone"}
    assert "telegram" not in email
    tg = _export(client, tok, ["telegram"])
    assert set(tg["notifications"]) == {"telegram", "timezone"}
    assert tg["telegram"]["chat_id"] == "42"


@pytest.mark.parametrize("params", [["nope"], ["bills", "nope"]])
def test_export_unknown_section_422(client, params):
    tok = register_and_login(client, "bad@test.com")
    r = client.get(
        "/export/json", params=[("sections", p) for p in params], headers=auth(tok)
    )
    assert r.status_code == 422


def test_full_round_trip_restores_everything(client):
    tok = register_and_login(client, "rt@test.com")
    _seed(client, tok)
    backup = _export(client, tok)

    client.patch(
        "/auth/me",
        json={
            "default_currency": "USD",
            "enabled_languages": ["en"],
            "language_preference": "en",
            "telegram_bot_token": None,
            "telegram_chat_id": None,
        },
        headers=auth(tok),
    )

    assert _upload(client, tok, backup).status_code == 200
    me = _me(client, tok)
    assert me["default_currency"] == "EUR"
    assert me["language_preference"] == "de"
    assert me["enabled_languages"] == ["en", "de"]
    assert me["telegram_chat_id"] == "42"
    assert [b["name"] for b in _bills(client, tok)] == ["Rent"]


def test_currency_only_restore_leaves_everything_else(client):
    tok = register_and_login(client, "cur@test.com")
    _seed(client, tok)
    payload = {"schema_version": 5, "preferences": {"default_currency": "GBP"}}
    assert _upload(client, tok, payload).status_code == 200
    me = _me(client, tok)
    assert me["default_currency"] == "GBP"
    assert me["language_preference"] == "de"
    assert me["telegram_chat_id"] == "42"
    assert len(_bills(client, tok)) == 1


def test_decimal_separator_only_restore_leaves_everything_else(client):
    tok = register_and_login(client, "sep@test.com")
    _seed(client, tok)
    payload = {"schema_version": 6, "preferences": {"decimal_separator": ","}}
    assert _upload(client, tok, payload).status_code == 200
    me = _me(client, tok)
    assert me["decimal_separator"] == ","
    assert me["default_currency"] == "EUR"
    assert me["language_preference"] == "de"
    assert len(_bills(client, tok)) == 1


def test_bills_only_restore_leaves_settings_and_categories(client):
    tok = register_and_login(client, "bo@test.com")
    _seed(client, tok)
    backup = _export(client, tok, ["bills"])
    cats_before = client.get("/categories", headers=auth(tok)).json()
    assert _upload(client, tok, backup).status_code == 200
    assert client.get("/categories", headers=auth(tok)).json() == cats_before
    me = _me(client, tok)
    assert me["default_currency"] == "EUR" and me["telegram_chat_id"] == "42"
    assert [b["name"] for b in _bills(client, tok)] == ["Rent"]


def test_bills_only_restore_maps_category_by_name_across_users(client):
    src = register_and_login(client, "src@test.com")
    _seed(client, src)
    backup = _export(client, src, ["bills"])
    dst = register_and_login(client, "dst@test.com")
    assert _upload(client, dst, backup).status_code == 200
    (bill,) = _bills(client, dst)
    assert bill["category"]["id"] == category_id(client, dst)  # "utilities" by name


def test_categories_only_restore_merges_without_breaking_bills(client):
    tok = register_and_login(client, "co@test.com")
    _seed(client, tok)
    client.post(
        "/categories",
        json={"name": "Pets", "color": next(iter(CATEGORY_COLORS))},
        headers=auth(tok),
    )
    backup = _export(client, tok, ["categories"])
    # archive the custom one, then restore: it comes back active
    pets = next(
        c
        for c in client.get("/categories", headers=auth(tok)).json()
        if c["name"] == "Pets"
    )
    client.post(f"/categories/{pets['id']}/archive", headers=auth(tok))
    assert "Pets" not in [
        c["name"] for c in client.get("/categories", headers=auth(tok)).json()
    ]
    assert _upload(client, tok, backup).status_code == 200
    names = [c["name"] for c in client.get("/categories", headers=auth(tok)).json()]
    assert "Pets" in names
    assert len(_bills(client, tok)) == 1


def test_telegram_only_restore(client):
    tok = register_and_login(client, "tgo@test.com")
    _seed(client, tok)
    backup = _export(client, tok, ["telegram"])
    client.patch(
        "/auth/me",
        json={"telegram_bot_token": None, "telegram_chat_id": None},
        headers=auth(tok),
    )
    assert _upload(client, tok, backup).status_code == 200
    me = _me(client, tok)
    assert me["telegram_chat_id"] == "42"
    assert me["default_currency"] == "EUR"


def test_restore_rejects_active_language_not_enabled(client):
    tok = register_and_login(client, "lang@test.com")
    payload = {
        "schema_version": 5,
        "preferences": {"language_preference": "fr", "enabled_languages": ["en"]},
    }
    assert _upload(client, tok, payload).status_code == 422
    assert _me(client, tok)["language_preference"] != "fr"


def test_snapshot_undo_restores_preferences(client):
    tok = register_and_login(client, "snap@test.com")
    _seed(client, tok)
    payload = {
        "schema_version": 5,
        "bill_templates": [],
        "payment_instances": [],
        "preferences": {"default_currency": "JPY", "decimal_separator": ","},
    }
    assert _upload(client, tok, payload).status_code == 200
    me = _me(client, tok)
    assert me["default_currency"] == "JPY"
    assert me["decimal_separator"] == ","
    assert client.post("/export/restore-snapshot", headers=auth(tok)).status_code == 200
    me = _me(client, tok)
    assert me["default_currency"] == "EUR"
    assert me["decimal_separator"] == "."
    assert len(_bills(client, tok)) == 1


def test_share_enabled_round_trip_and_old_backup_leaves_it(client):
    tok = register_and_login(client, "share@test.com")
    client.patch(
        "/auth/me",
        json={"share_enabled": True, "share_emails": ["a@gmail.com"]},
        headers=auth(tok),
    )
    backup = _export(client, tok, ["share"])
    assert backup["preferences"]["share_enabled"] is True
    assert backup["preferences"]["share_emails"] == ["a@gmail.com"]
    client.patch(
        "/auth/me",
        json={"share_enabled": False, "share_emails": []},
        headers=auth(tok),
    )
    assert _upload(client, tok, backup).status_code == 200
    assert _me(client, tok)["share_enabled"] is True
    assert _me(client, tok)["share_emails"] == ["a@gmail.com"]
    old = {"schema_version": 6, "preferences": {"decimal_separator": ","}}
    assert _upload(client, tok, old).status_code == 200
    assert _me(client, tok)["share_enabled"] is True


def test_pdf_enabled_round_trip_and_old_backup_leaves_it(client):
    tok = register_and_login(client, "pdf@test.com")
    client.patch("/auth/me", json={"pdf_enabled": False}, headers=auth(tok))
    backup = _export(client, tok, ["pdf"])
    assert backup["preferences"]["pdf_enabled"] is False
    client.patch("/auth/me", json={"pdf_enabled": True}, headers=auth(tok))
    assert _upload(client, tok, backup).status_code == 200
    assert _me(client, tok)["pdf_enabled"] is False
    old = {"schema_version": 6, "preferences": {"decimal_separator": ","}}
    assert _upload(client, tok, old).status_code == 200
    assert _me(client, tok)["pdf_enabled"] is False
