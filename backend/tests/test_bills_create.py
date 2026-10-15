"""Tests for POST /bills — due_month routing and input validation."""

import pytest

from tests.conftest import (
    auth,
    category_id,
    register_and_login,
    sync_payments,
    today_utc,
)

_BASE_BILL = {
    "name": "TestBill",
    "frequency": "monthly",
    "amount": "100.00",
    "currency": "PLN",
    "due_day": 15,
}


def _bill(client, token, **overrides) -> dict:
    return {**_BASE_BILL, "category_id": category_id(client, token), **overrides}


# ---------------------------------------------------------------------------
# due_month routing — covers bills.py lines 51-55, 66
# ---------------------------------------------------------------------------


def test_create_monthly_bill_with_past_due_month_seeds_history(client):
    """Monthly bill with due_month 3 months in the past → backfill creates past instances."""

    today = today_utc()
    if today.month <= 3:
        pytest.skip("Requires at least 3 months of history (month >= April)")

    past_month = today.month - 3
    past_period = f"{today.year}-{past_month:02d}"

    token = register_and_login(client, "backfill_monthly@test.com")
    r = client.post(
        "/bills",
        json=_bill(client, token, frequency="monthly", due_month=past_month),
        headers=auth(token),
    )
    assert r.status_code == 201

    r = client.get(f"/bills/payments?month={past_period}", headers=auth(token))
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_create_monthly_bill_with_current_month_does_not_backfill(client):
    """Monthly bill with due_month == current month → no backfill (start_period == current)."""

    today = today_utc()
    token = register_and_login(client, "no_backfill@test.com")
    r = client.post(
        "/bills",
        json=_bill(client, token, frequency="monthly", due_month=today.month),
        headers=auth(token),
    )
    assert r.status_code == 201
    bill_id = r.json()["id"]

    # Sync current month — should produce exactly one instance (not extra from backfill)
    sync_payments(client, token)
    payments = client.get("/bills/payments", headers=auth(token)).json()
    bill_payments = [p for p in payments if p["bill_id"] == bill_id]
    assert len(bill_payments) == 1


def test_create_annual_bill_with_future_due_month_sets_next_year(client):
    """Annual bill with due_month > current month → start_period uses current year."""

    today = today_utc()
    if today.month >= 12:
        pytest.skip("Requires a future month (month < December)")

    future_month = today.month + 1
    token = register_and_login(client, "annual_future@test.com")
    r = client.post(
        "/bills",
        json=_bill(
            client, token, frequency="annual", due_month=future_month, due_day=None
        ),
        headers=auth(token),
    )
    assert r.status_code == 201
    data = r.json()
    # start_period should be current year since due_month >= now.month
    expected_year = today.year
    assert data["start_period"].startswith(str(expected_year))


def test_create_annual_bill_with_past_due_month_sets_next_year(client):
    """Annual bill with due_month < current month → start_period bumped to next year."""

    today = today_utc()
    if today.month <= 1:
        pytest.skip("Requires a past month (month > January)")

    past_month = today.month - 1
    token = register_and_login(client, "annual_past@test.com")
    r = client.post(
        "/bills",
        json=_bill(
            client, token, frequency="annual", due_month=past_month, due_day=None
        ),
        headers=auth(token),
    )
    assert r.status_code == 201
    data = r.json()
    # start_period should be next year since due_month < now.month
    expected_year = today.year + 1
    assert data["start_period"].startswith(str(expected_year))


def test_create_one_off_bill_with_past_due_month_stays_current_year(client):
    """One-off bill with due_month < current month → stays this year (never repeats,
    so unlike annual it must not roll forward to next year)."""

    today = today_utc()
    if today.month <= 1:
        pytest.skip("Requires a past month (month > January)")

    past_month = today.month - 1
    token = register_and_login(client, "oneoff_past@test.com")
    r = client.post(
        "/bills",
        json=_bill(
            client, token, frequency="one_off", due_month=past_month, due_day=None
        ),
        headers=auth(token),
    )
    assert r.status_code == 201
    assert r.json()["start_period"].startswith(str(today.year))


def test_create_one_off_bill_with_past_due_month_generates_overdue_instance(client):
    """A one-off bill must generate its single payment instance immediately,
    shown as overdue when its due date has already passed."""

    today = today_utc()
    if today.month <= 1:
        pytest.skip("Requires a past month (month > January)")

    past_month = today.month - 1
    past_period = f"{today.year}-{past_month:02d}"
    token = register_and_login(client, "oneoff_overdue@test.com")
    r = client.post(
        "/bills",
        json=_bill(client, token, frequency="one_off", due_month=past_month, due_day=1),
        headers=auth(token),
    )
    assert r.status_code == 201

    r = client.get(f"/bills/payments?month={past_period}", headers=auth(token))
    assert r.status_code == 200
    payments = r.json()
    assert len(payments) == 1
    assert payments[0]["status"] == "overdue"


# ---------------------------------------------------------------------------
# Input validation — covers 422 paths in Pydantic schema
# ---------------------------------------------------------------------------


def test_create_bill_missing_required_name_returns_422(client):
    token = register_and_login(client, "val_name@test.com")
    payload = {k: v for k, v in _BASE_BILL.items() if k != "name"}
    r = client.post("/bills", json=payload, headers=auth(token))
    assert r.status_code == 422


def test_create_bill_invalid_frequency_returns_422(client):
    token = register_and_login(client, "val_freq@test.com")
    r = client.post(
        "/bills", json=_bill(client, token, frequency="weekly"), headers=auth(token)
    )
    assert r.status_code == 422


def test_create_bill_due_day_zero_returns_422(client):
    token = register_and_login(client, "val_day0@test.com")
    r = client.post("/bills", json=_bill(client, token, due_day=0), headers=auth(token))
    assert r.status_code == 422


def test_create_bill_due_day_32_returns_422(client):
    token = register_and_login(client, "val_day32@test.com")
    r = client.post(
        "/bills", json=_bill(client, token, due_day=32), headers=auth(token)
    )
    assert r.status_code == 422


def test_create_bill_due_month_13_returns_422(client):
    token = register_and_login(client, "val_month13@test.com")
    r = client.post(
        "/bills", json=_bill(client, token, due_month=13), headers=auth(token)
    )
    assert r.status_code == 422


def test_create_bill_negative_amount_returns_422(client):
    token = register_and_login(client, "val_neg@test.com")
    r = client.post(
        "/bills", json=_bill(client, token, amount="-50.00"), headers=auth(token)
    )
    assert r.status_code == 422


def test_create_bill_nonexistent_category_id_returns_404(client):
    token = register_and_login(client, "val_cat@test.com")
    r = client.post(
        "/bills", json=_bill(client, token, category_id=999999), headers=auth(token)
    )
    assert r.status_code == 404


def test_end_period_before_start_rejected_and_valid_saved(client):
    token = register_and_login(client, "endperiod@test.com")
    r = client.post(
        "/bills", json=_bill(client, token, end_period="2000-01"), headers=auth(token)
    )
    assert r.status_code == 422

    r = client.post(
        "/bills", json=_bill(client, token, end_period="2099-12"), headers=auth(token)
    )
    assert r.status_code == 201
    assert r.json()["end_period"] == "2099-12"


@pytest.mark.parametrize(
    "frequency,interval,ok",
    [
        ("monthly", 1, True),
        ("monthly", 12, True),
        ("monthly", 13, False),
        ("monthly", 0, False),
        ("annual", 5, True),
        ("annual", 6, False),
        ("one_off", 1, True),
        ("one_off", 2, False),
    ],
)
def test_create_bill_interval_limits(client, frequency, interval, ok):
    token = register_and_login(client, f"iv_{frequency}_{interval}@test.com")
    payload = _bill(client, token, frequency=frequency, interval=interval, due_day=None)
    r = client.post("/bills", json=payload, headers=auth(token))
    assert (r.status_code == 201) == ok, r.text
    if ok:
        assert r.json()["interval"] == interval


def test_patch_bill_interval_validated_against_frequency(client):
    token = register_and_login(client, "iv_patch@test.com")
    r = client.post("/bills", json=_bill(client, token), headers=auth(token))
    bill_id = r.json()["id"]
    r = client.patch(f"/bills/{bill_id}", json={"interval": 4}, headers=auth(token))
    assert r.status_code == 200 and r.json()["interval"] == 4
    r = client.patch(
        f"/bills/{bill_id}", json={"frequency": "one_off"}, headers=auth(token)
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Input bounds — oversized values are a 422, never a 500 from the DB
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "overrides",
    [
        {"name": ""},
        {"name": "x" * 256},
        {"currency": "x" * 11},
        {"notes": "x" * 2001},
        {"amount": "-1"},
        {"amount": "10000000000"},
    ],
)
def test_create_bill_out_of_bounds_returns_422(client, overrides):
    token = register_and_login(client, "bounds@test.com")
    r = client.post(
        "/bills", json=_bill(client, token, **overrides), headers=auth(token)
    )
    assert r.status_code == 422


def test_create_bill_at_the_limits_succeeds(client):
    token = register_and_login(client, "limits@test.com")
    body = _bill(
        client,
        token,
        name="x" * 255,
        currency="x" * 10,
        notes="x" * 2000,
        amount="9999999999.99",
    )
    assert client.post("/bills", json=body, headers=auth(token)).status_code == 201


def test_update_bill_out_of_bounds_returns_422(client):
    token = register_and_login(client, "bounds2@test.com")
    bill_id = client.post(
        "/bills", json=_bill(client, token), headers=auth(token)
    ).json()["id"]
    for patch in ({"amount": "-5"}, {"name": ""}, {"notes": "x" * 2001}):
        r = client.patch(f"/bills/{bill_id}", json=patch, headers=auth(token))
        assert r.status_code == 422, patch


@pytest.mark.parametrize(
    "field", ["name", "category_id", "frequency", "amount", "currency"]
)
def test_update_bill_null_on_required_field_returns_422(client, field):
    token = register_and_login(client, "nullreq@test.com")
    bill_id = client.post(
        "/bills", json=_bill(client, token), headers=auth(token)
    ).json()["id"]
    r = client.patch(f"/bills/{bill_id}", json={field: None}, headers=auth(token))
    assert r.status_code == 422


def test_update_bill_null_clears_optional_fields(client):
    token = register_and_login(client, "nullopt@test.com")
    bill_id = client.post(
        "/bills", json=_bill(client, token, notes="hi"), headers=auth(token)
    ).json()["id"]
    r = client.patch(
        f"/bills/{bill_id}", json={"notes": None, "due_day": None}, headers=auth(token)
    )
    assert r.status_code == 200
    assert r.json()["notes"] is None and r.json()["due_day"] is None


def test_update_end_period_removes_instances_after_it(client):
    token = register_and_login(client, "endcut@test.com")
    bill_id = client.post(
        "/bills", json=_bill(client, token), headers=auth(token)
    ).json()["id"]
    today = today_utc()
    nxt = f"{today.year + (today.month == 12)}-{today.month % 12 + 1:02d}"
    sync_payments(client, token, nxt)
    assert client.get(f"/bills/payments?month={nxt}", headers=auth(token)).json()

    this = today.strftime("%Y-%m")
    r = client.patch(
        f"/bills/{bill_id}", json={"end_period": this}, headers=auth(token)
    )
    assert r.status_code == 200
    assert client.get(f"/bills/payments?month={nxt}", headers=auth(token)).json() == []


def test_end_period_cut_does_not_trigger_restore_prompt(client):
    token = register_and_login(client, "endprompt@test.com")
    bill_id = client.post(
        "/bills", json=_bill(client, token), headers=auth(token)
    ).json()["id"]
    today = today_utc()
    nxt = f"{today.year + (today.month == 12)}-{today.month % 12 + 1:02d}"
    sync_payments(client, token, nxt)
    client.patch(
        f"/bills/{bill_id}",
        json={"end_period": today.strftime("%Y-%m")},
        headers=auth(token),
    )
    r = client.get(f"/bills/{bill_id}/has-deleted-future", headers=auth(token))
    assert r.json() == {"has_deleted_future": False}
