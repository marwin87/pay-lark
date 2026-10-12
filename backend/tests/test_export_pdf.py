"""Integration tests for GET /export/pdf."""

from datetime import date

from app.core.i18n import BRAND, LOCALES
from tests.conftest import auth, category_id, register_and_login, today_utc

_BILL = {
    "name": "Prąd żółć",
    "frequency": "monthly",
    "amount": 100.00,
    "currency": "PLN",
    "due_day": 10,
    "notes": None,
    "due_month": 1,
}


def _tok(client, email):
    tok = register_and_login(client, email)
    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r.status_code == 201
    return tok


def test_pdf_year_and_month(client):
    tok = _tok(client, "pdf_basic@test.com")
    year = today_utc().year
    r = client.get(f"/export/pdf?year={year}", headers=auth(tok))
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")
    assert f"{BRAND['slug']}-en-{year}.pdf" in r.headers["content-disposition"]
    r = client.get(f"/export/pdf?year={year}&month=3", headers=auth(tok))
    assert r.content.startswith(b"%PDF")
    assert f"{BRAND['slug']}-en-{year}-03.pdf" in r.headers["content-disposition"]


def test_pdf_disabled_returns_403(client):
    tok = _tok(client, "pdf_off@test.com")
    client.patch("/auth/me", json={"pdf_enabled": False}, headers=auth(tok))
    assert client.get("/export/pdf", headers=auth(tok)).status_code == 403


def test_pdf_supports_every_locale(client):
    tok = _tok(client, "pdf_locales@test.com")
    for lang in LOCALES:
        r = client.get(f"/export/pdf?lang={lang}", headers=auth(tok))
        assert r.status_code == 200, lang


def test_pdf_fields_are_validated_and_independent_of_xlsx(client):
    tok = register_and_login(client, "pdf_fields@test.com")
    r = client.patch("/auth/me", json={"pdf_fields": ["bill"]}, headers=auth(tok))
    assert r.status_code == 422  # mandatory fields missing
    keep = ["bill", "due_date", "amount", "currency"]
    r = client.patch("/auth/me", json={"pdf_fields": keep}, headers=auth(tok))
    assert r.status_code == 200
    assert r.json()["pdf_fields"] == keep
    assert len(r.json()["export_fields"]) == 10
