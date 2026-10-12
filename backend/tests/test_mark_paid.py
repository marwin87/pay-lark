"""Tests for POST /bills/payments/{id}/pay — the `paid_at` date override."""

from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.models.bill import PaymentInstance
from tests.conftest import auth, category_id, register_and_login, today_utc

_BILL = {
    "name": "Electricity",
    "frequency": "monthly",
    "amount": "120.00",
    "currency": "PLN",
    "due_day": 15,
    "notes": None,
}


def _create_bill(client: TestClient, token: str) -> int:
    payload = {**_BILL, "category_id": category_id(client, token)}
    r = client.post("/bills", json=payload, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _instance_id(client: TestClient, token: str, bill_id: int) -> int:
    period = today_utc().strftime("%Y-%m")
    client.post(f"/bills/sync-instances?month={period}", headers=auth(token))
    r = client.get(f"/bills/payments?month={period}", headers=auth(token))
    [inst] = [p for p in r.json() if p["bill_id"] == bill_id]
    return inst["id"]


def test_mark_paid_without_date_uses_today(client_db):
    client, db = client_db
    token = register_and_login(client, "mp1@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)

    r = client.post(f"/bills/payments/{instance_id}/pay", json={}, headers=auth(token))
    assert r.status_code == 200
    # The API stamps paid_at in UTC, so compare against the UTC date, not the
    # machine's local one (they differ for a few hours around midnight).
    assert r.json()["paid_at"].startswith(datetime.now(timezone.utc).date().isoformat())


def test_mark_paid_with_past_date_is_recorded(client_db):
    client, db = client_db
    token = register_and_login(client, "mp2@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)
    past = (today_utc() - timedelta(days=5)).isoformat()

    r = client.post(
        f"/bills/payments/{instance_id}/pay",
        json={"paid_at": past},
        headers=auth(token),
    )
    assert r.status_code == 200
    assert r.json()["paid_at"].startswith(past)


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def test_mark_paid_accepts_tomorrow_for_clients_ahead_of_utc(client_db):
    """A client in UTC+ just after local midnight sends a date one day ahead of UTC."""
    client, db = client_db
    token = register_and_login(client, "mp3b@test.com")
    instance_id = _instance_id(client, token, _create_bill(client, token))
    tomorrow = (_utc_today() + timedelta(days=1)).isoformat()

    r = client.post(
        f"/bills/payments/{instance_id}/pay",
        json={"paid_at": tomorrow},
        headers=auth(token),
    )
    assert r.status_code == 200
    assert r.json()["paid_at"].startswith(tomorrow)


def test_mark_paid_with_future_date_rejected(client_db):
    client, db = client_db
    token = register_and_login(client, "mp3@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)
    future = (_utc_today() + timedelta(days=2)).isoformat()

    r = client.post(
        f"/bills/payments/{instance_id}/pay",
        json={"paid_at": future},
        headers=auth(token),
    )
    assert r.status_code == 400


def _paid_instance(client: TestClient, token: str) -> int:
    instance_id = _instance_id(client, token, _create_bill(client, token))
    r = client.post(
        f"/bills/payments/{instance_id}/pay",
        json={"paid_amount": "100.00", "notes": "first"},
        headers=auth(token),
    )
    assert r.status_code == 200
    return instance_id


def test_edit_paid_payment_updates_and_clears_notes(client_db):
    client, db = client_db
    token = register_and_login(client, "ep1@test.com")
    instance_id = _paid_instance(client, token)

    r = client.patch(
        f"/bills/payments/{instance_id}",
        json={"paid_amount": "99.50", "notes": "changed"},
        headers=auth(token),
    )
    assert r.status_code == 200
    assert r.json()["paid_amount"] == "99.50"
    assert r.json()["notes"] == "changed"
    assert r.json()["status"] == "paid"

    r = client.patch(
        f"/bills/payments/{instance_id}", json={"notes": ""}, headers=auth(token)
    )
    assert r.json()["notes"] is None
    assert r.json()["paid_amount"] == "99.50"


def test_edit_paid_payment_future_date_and_other_user(client_db):
    client, db = client_db
    token = register_and_login(client, "ep3@test.com")
    instance_id = _paid_instance(client, token)
    future = (_utc_today() + timedelta(days=2)).isoformat()
    r = client.patch(
        f"/bills/payments/{instance_id}", json={"paid_at": future}, headers=auth(token)
    )
    assert r.status_code == 400

    other = register_and_login(client, "ep4@test.com")
    r = client.patch(
        f"/bills/payments/{instance_id}", json={"notes": "x"}, headers=auth(other)
    )
    assert r.status_code == 404


def _amounts(client: TestClient, token: str, bill_id: int) -> dict:
    period = today_utc().strftime("%Y-%m")
    r = client.get(f"/bills/payments?month={period}", headers=auth(token))
    [inst] = [p for p in r.json() if p["bill_id"] == bill_id]
    return inst


def test_unpaid_amount_override_is_per_payment_and_survives_bill_edit(client_db):
    client, db = client_db
    token = register_and_login(client, "ov1@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)

    r = client.patch(
        f"/bills/payments/{instance_id}",
        json={"amount": "143.20", "notes": "invoice 7"},
        headers=auth(token),
    )
    assert r.status_code == 200
    assert r.json()["amount"] == "143.20"
    assert r.json()["amount_overridden"] is True
    assert r.json()["status"] != "paid"

    # Template is untouched, and a later template price change does not
    # replace this payment's amount.
    assert client.get(f"/bills", headers=auth(token)).json()[0]["amount"] == "120.00"
    r = client.patch(
        f"/bills/{bill_id}", json={"amount": "200.00"}, headers=auth(token)
    )
    assert r.status_code == 200
    inst = _amounts(client, token, bill_id)
    assert inst["amount"] == "143.20"
    assert inst["notes"] == "invoice 7"

    # Marking paid without a paid_amount defaults to the overridden amount.
    r = client.post(f"/bills/payments/{instance_id}/pay", json={}, headers=auth(token))
    assert r.json()["paid_amount"] == "143.20"
    assert r.json()["amount"] == "143.20"


def test_clearing_amount_override_follows_template_again(client_db):
    client, db = client_db
    token = register_and_login(client, "ov2@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)
    client.patch(
        f"/bills/payments/{instance_id}", json={"amount": "0"}, headers=auth(token)
    )
    assert _amounts(client, token, bill_id)["amount"] == "0.00"  # note-only reminder

    r = client.patch(
        f"/bills/payments/{instance_id}", json={"amount": None}, headers=auth(token)
    )
    assert r.json()["amount"] == "120.00"
    assert r.json()["amount_overridden"] is False


def test_edit_payment_rejects_fields_of_the_other_state(client_db):
    client, db = client_db
    token = register_and_login(client, "ov3@test.com")
    unpaid_id = _instance_id(client, token, _create_bill(client, token))
    r = client.patch(
        f"/bills/payments/{unpaid_id}", json={"paid_amount": "5"}, headers=auth(token)
    )
    assert r.status_code == 400

    paid_id = _paid_instance(client, token)
    r = client.patch(
        f"/bills/payments/{paid_id}", json={"amount": "5"}, headers=auth(token)
    )
    assert r.status_code == 400


def test_editing_overdue_payment_keeps_overdue_status(client_db):
    client, db = client_db
    token = register_and_login(client, "ov4@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)
    inst = db.get(PaymentInstance, instance_id)
    inst.due_date = today_utc() - timedelta(days=3)
    db.commit()
    assert _amounts(client, token, bill_id)["status"] == "overdue"

    r = client.patch(
        f"/bills/payments/{instance_id}", json={"notes": "x"}, headers=auth(token)
    )
    assert r.json()["status"] == "overdue"


def test_edit_due_date_on_unpaid_instance(client_db):
    client, db = client_db
    token = register_and_login(client, "dd1@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)
    period = today_utc().strftime("%Y-%m")
    new_due = f"{period}-20"

    r = client.patch(
        f"/bills/payments/{instance_id}",
        json={"due_date": new_due},
        headers=auth(token),
    )
    assert r.status_code == 200
    assert r.json()["due_date"] == new_due


def test_edit_due_date_on_overdue_instance(client_db):
    client, db = client_db
    token = register_and_login(client, "dd2@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)
    inst = db.get(PaymentInstance, instance_id)
    inst.due_date = today_utc() - timedelta(days=3)
    db.commit()
    period = inst.period
    new_due = f"{period}-20"

    r = client.patch(
        f"/bills/payments/{instance_id}",
        json={"due_date": new_due},
        headers=auth(token),
    )
    assert r.status_code == 200
    assert r.json()["due_date"] == new_due


def test_moving_due_date_to_the_future_clears_stored_overdue(client_db):
    """A stored "overdue" status (set by revert / old data) must not outlive a due
    date that is no longer past — the status follows the date."""
    client, db = client_db
    token = register_and_login(client, "dd4@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)
    next_month = (today_utc().replace(day=1) + timedelta(days=32)).replace(day=1)
    inst = db.get(PaymentInstance, instance_id)
    inst.period = next_month.strftime("%Y-%m")
    inst.due_date = today_utc() - timedelta(days=3)
    inst.status = "overdue"
    db.commit()

    r = client.patch(
        f"/bills/payments/{instance_id}",
        json={"due_date": f"{inst.period}-20"},
        headers=auth(token),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "upcoming"


def test_edit_due_date_rejected_when_paid(client_db):
    client, db = client_db
    token = register_and_login(client, "dd3@test.com")
    instance_id = _paid_instance(client, token)
    period = today_utc().strftime("%Y-%m")

    r = client.patch(
        f"/bills/payments/{instance_id}",
        json={"due_date": f"{period}-20"},
        headers=auth(token),
    )
    assert r.status_code == 400


def test_edit_due_date_rejected_outside_period_month(client_db):
    client, db = client_db
    token = register_and_login(client, "dd4@test.com")
    bill_id = _create_bill(client, token)
    instance_id = _instance_id(client, token, bill_id)

    other_month = today_utc().replace(day=1) + timedelta(days=40)
    r = client.patch(
        f"/bills/payments/{instance_id}",
        json={"due_date": other_month.replace(day=1).isoformat()},
        headers=auth(token),
    )
    assert r.status_code == 400


def test_mark_paid_out_of_bounds_returns_422(client_db):
    client, db = client_db
    token = register_and_login(client, "mpb@test.com")
    instance_id = _instance_id(client, token, _create_bill(client, token))
    for body in (
        {"paid_amount": "-1"},
        {"paid_amount": "10000000000"},
        {"notes": "x" * 2001},
    ):
        r = client.post(
            f"/bills/payments/{instance_id}/pay", json=body, headers=auth(token)
        )
        assert r.status_code == 422, body


def test_edit_payment_out_of_bounds_returns_422(client_db):
    client, db = client_db
    token = register_and_login(client, "epb@test.com")
    instance_id = _instance_id(client, token, _create_bill(client, token))
    for body in ({"amount": "10000000000"}, {"amount": "-1"}, {"notes": "x" * 2001}):
        r = client.patch(
            f"/bills/payments/{instance_id}", json=body, headers=auth(token)
        )
        assert r.status_code == 422, body


def test_mark_paid_twice_returns_400_and_keeps_the_first_payment(client_db):
    client, db = client_db
    token = register_and_login(client, "twice@test.com")
    instance_id = _paid_instance(client, token)  # paid_amount 100.00, note "first"

    r = client.post(
        f"/bills/payments/{instance_id}/pay",
        json={"paid_amount": "1.00", "notes": "second"},
        headers=auth(token),
    )
    assert r.status_code == 400

    period = today_utc().strftime("%Y-%m")
    [inst] = [
        p
        for p in client.get(
            f"/bills/payments?month={period}", headers=auth(token)
        ).json()
        if p["id"] == instance_id
    ]
    assert inst["paid_amount"] == "100.00" and inst["notes"] == "first"


def test_deleted_payment_cannot_be_paid_edited_or_reverted(client_db):
    client, db = client_db
    token = register_and_login(client, "gone@test.com")
    instance_id = _instance_id(client, token, _create_bill(client, token))
    assert (
        client.delete(f"/bills/payments/{instance_id}", headers=auth(token)).status_code
        == 204
    )
    url = f"/bills/payments/{instance_id}"
    assert client.post(f"{url}/pay", json={}, headers=auth(token)).status_code == 404
    assert (
        client.patch(url, json={"notes": "x"}, headers=auth(token)).status_code == 404
    )
    assert client.post(f"{url}/unpay", headers=auth(token)).status_code == 404
