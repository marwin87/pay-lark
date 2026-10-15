"""Tests for GET /bills/payments/trend — 12-month paid/unpaid totals per currency."""

from datetime import date

from app.models.bill import Hidden, PaymentInstance, PaymentStatus
from app.services.trend import trend_periods
from tests.conftest import auth, category_id, register_and_login, today_utc


def _bill(client, token, name, currency, amount="100.00"):
    r = client.post(
        "/bills",
        json={
            "name": name,
            "frequency": "monthly",
            "amount": amount,
            "currency": currency,
            "due_day": 5,
            "notes": None,
            "category_id": category_id(client, token),
        },
        headers=auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _inst(db, bill_id, period, status, paid_amount=None, deleted=False):
    year, mon = map(int, period.split("-"))
    db.add(
        PaymentInstance(
            bill_id=bill_id,
            period=period,
            due_date=date(year, mon, 5),
            amount=100,
            status=status,
            paid_amount=paid_amount,
            hidden=Hidden.user if deleted else None,
        )
    )


def test_trend_periods_span_twelve_months_across_year_boundary():
    periods = trend_periods("2026-02")
    assert periods[0] == "2025-03" and periods[-1] == "2026-02"
    assert len(periods) == 12


def test_trend_splits_paid_unpaid_and_never_mixes_currencies(client_db):
    client, db = client_db
    token = register_and_login(client, "tr1@test.com")
    eur = _bill(client, token, "Rent", "EUR")
    eur2 = _bill(client, token, "Gas", "EUR")
    eur3 = _bill(client, token, "Old", "EUR")
    pln = _bill(client, token, "Bus", "PLN")
    month = today_utc().strftime("%Y-%m")
    # Wipe what bill creation auto-generated for this month, then set exact rows.
    db.query(PaymentInstance).delete()
    _inst(db, eur, month, PaymentStatus.paid, paid_amount=90)  # partial payment
    _inst(db, eur2, month, PaymentStatus.upcoming)
    _inst(db, eur3, month, PaymentStatus.paid, deleted=True)  # ignored
    _inst(
        db, pln, month, PaymentStatus.paid
    )  # paid_amount None -> falls back to amount
    db.commit()

    r = client.get(f"/bills/payments/trend?month={month}", headers=auth(token))
    assert r.status_code == 200, r.text
    got = {(p["currency"]): p for p in r.json() if p["period"] == month}
    assert float(got["EUR"]["paid"]) == 90 and float(got["EUR"]["unpaid"]) == 100
    assert float(got["PLN"]["paid"]) == 100 and float(got["PLN"]["unpaid"]) == 0


def test_trend_is_scoped_to_the_user(client_db):
    client, db = client_db
    a = register_and_login(client, "tr2a@test.com")
    b = register_and_login(client, "tr2b@test.com")
    _bill(client, a, "Rent", "EUR")
    month = today_utc().strftime("%Y-%m")
    r = client.get(f"/bills/payments/trend?month={month}", headers=auth(b))
    assert r.status_code == 200 and r.json() == []


def test_trend_rejects_bad_month(client):
    token = register_and_login(client, "tr3@test.com")
    r = client.get("/bills/payments/trend?month=2026-13", headers=auth(token))
    assert r.status_code == 422
