"""New bills are drafts: no payments until POST /bills/{id}/activate."""

from app.models.bill import PaymentInstance
from tests.conftest import (
    auth,
    category_id,
    register_and_login,
    sync_payments,
    today_utc,
)

_BILL = {
    "name": "Rent",
    "frequency": "monthly",
    "amount": "100.00",
    "currency": "PLN",
    "due_day": 5,
}


def _draft(client, tok, **overrides) -> dict:
    client.auto_activate = False
    body = {**_BILL, "category_id": category_id(client, tok), **overrides}
    r = client.post("/bills", json=body, headers=auth(tok))
    assert r.status_code == 201, r.text
    return r.json()


def _payments(client, tok) -> list:
    return client.get("/bills/payments", headers=auth(tok)).json()


def test_draft_has_no_payments_and_sync_skips_it(client):
    tok = register_and_login(client, "d1@test.com")
    bill = _draft(client, tok, due_month=1)
    assert bill["status"] == "draft"
    sync_payments(client, tok)
    assert _payments(client, tok) == []


def test_draft_start_month_is_editable_until_activation(client):
    tok = register_and_login(client, "d2@test.com")
    bill = _draft(client, tok, due_month=1)
    r = client.patch(f"/bills/{bill['id']}", json={"due_month": 3}, headers=auth(tok))
    assert r.json()["due_month"] == 3
    assert r.json()["start_period"].endswith("-03")


def test_activate_generates_payments_once(client):
    tok = register_and_login(client, "d3@test.com")
    bill = _draft(client, tok, due_month=1)
    r = client.post(f"/bills/{bill['id']}/activate", headers=auth(tok))
    assert r.status_code == 200 and r.json()["status"] == "active"
    assert len(_payments(client, tok)) >= 1
    again = client.post(f"/bills/{bill['id']}/activate", headers=auth(tok))
    assert again.status_code == 409


def test_one_off_dates_survive_draft_and_become_payments(client):
    tok = register_and_login(client, "d4@test.com")
    bill = _draft(client, tok, frequency="one_off", dates=["2030-02-03", "2030-04-05"])
    assert bill["dates"] == ["2030-02-03", "2030-04-05"]
    client.post(f"/bills/{bill['id']}/activate", headers=auth(tok))
    r = client.get("/bills/payments?month=2030-02", headers=auth(tok)).json()
    assert [p["due_date"] for p in r] == ["2030-02-03"]


def test_activate_other_users_bill_is_404(client):
    a = register_and_login(client, "d5@test.com")
    b = register_and_login(client, "d6@test.com")
    bill = _draft(client, a)
    assert (
        client.post(f"/bills/{bill['id']}/activate", headers=auth(b)).status_code == 404
    )


def test_lost_activation_race_is_409_not_500(client, monkeypatch):
    # Both requests passed the "is draft" read; only the first atomic claim wins.
    tok = register_and_login(client, "d7@test.com")
    bill = _draft(client, tok, due_month=1)
    from sqlalchemy.orm import Session

    from app.models.bill import BillStatus, BillTemplate

    real_get = Session.get

    def stale_get(self, entity, ident, *a, **kw):
        obj = real_get(self, entity, ident, *a, **kw)
        if entity is BillTemplate and obj is not None:
            obj.status = BillStatus.draft  # what a concurrent request would still see
        return obj

    first = client.post(f"/bills/{bill['id']}/activate", headers=auth(tok))
    assert first.status_code == 200
    monkeypatch.setattr(Session, "get", stale_get)
    second = client.post(f"/bills/{bill['id']}/activate", headers=auth(tok))
    assert second.status_code == 409
    monkeypatch.undo()
    assert len(client.get("/bills/payments", headers=auth(tok)).json()) >= 1


def test_draft_cannot_be_paused_and_stays_a_draft(client):
    tok = register_and_login(client, "d8@test.com")
    bill = _draft(client, tok, due_month=1)
    r = client.post(f"/bills/{bill['id']}/archive", headers=auth(tok))
    assert r.status_code == 409
    listed = client.get("/bills", headers=auth(tok)).json()
    assert [b["status"] for b in listed] == ["draft"]
    assert _payments(client, tok) == []
    assert (
        client.post(f"/bills/{bill['id']}/activate", headers=auth(tok)).status_code
        == 200
    )


def test_draft_can_be_deleted(client):
    tok = register_and_login(client, "d-del@test.com")
    bill = _draft(client, tok)
    r = client.delete(f"/bills/{bill['id']}", headers=auth(tok))
    assert r.status_code == 204
    assert client.get("/bills", headers=auth(tok)).json() == []


def test_activated_bill_cannot_be_deleted(client):
    tok = register_and_login(client, "d-del2@test.com")
    bill = _draft(client, tok)
    client.post(f"/bills/{bill['id']}/activate", headers=auth(tok))
    r = client.delete(f"/bills/{bill['id']}", headers=auth(tok))
    assert r.status_code == 409


def _live_paused(client, tok, *, pay=False, **overrides) -> int:
    """An activated bill with this month's payment, optionally paid, then paused."""
    bill = _draft(client, tok, **overrides)
    client.post(f"/bills/{bill['id']}/activate", headers=auth(tok))
    if pay:
        pid = _payments(client, tok)[0]["id"]
        r = client.post(f"/bills/payments/{pid}/pay", json={}, headers=auth(tok))
        assert r.status_code == 200, r.text
    client.post(f"/bills/{bill['id']}/archive", headers=auth(tok))
    return bill["id"]


def test_active_bill_must_be_paused_before_it_can_be_deleted(client):
    tok = register_and_login(client, "d-del3@test.com")
    # Annual, first period still ahead: live but owns no payment yet.
    ahead = today_utc().month % 12 + 1
    empty = _draft(client, tok, frequency="annual", due_month=ahead)
    client.post(f"/bills/{empty['id']}/activate", headers=auth(tok))
    assert _payments(client, tok) == []
    assert client.delete(f"/bills/{empty['id']}", headers=auth(tok)).status_code == 409
    client.post(f"/bills/{empty['id']}/archive", headers=auth(tok))
    assert client.delete(f"/bills/{empty['id']}", headers=auth(tok)).status_code == 204


def test_paused_bill_with_only_unpaid_payments_can_be_deleted(client, db_session):
    tok = register_and_login(client, "d-del5@test.com")
    bill_id = _live_paused(client, tok)
    assert _payments(client, tok) == []  # hidden by pausing, but the rows exist
    rows = db_session.query(PaymentInstance).filter_by(bill_id=bill_id)
    assert rows.count() > 0
    db_session.rollback()  # end the read transaction so the delete can write

    assert client.delete(f"/bills/{bill_id}", headers=auth(tok)).status_code == 204
    assert rows.count() == 0


def test_paused_bill_with_a_paid_payment_cannot_be_deleted(client):
    tok = register_and_login(client, "d-del6@test.com")
    bill_id = _live_paused(client, tok, pay=True)
    assert len(_payments(client, tok)) == 1  # paid history stays visible

    assert client.delete(f"/bills/{bill_id}", headers=auth(tok)).status_code == 409
    bills = client.get("/bills?include_archived=true", headers=auth(tok)).json()
    assert [b["can_delete"] for b in bills] == [False]


def test_a_paid_payment_the_user_deleted_is_not_history(client):
    tok = register_and_login(client, "d-del7@test.com")
    bill = _draft(client, tok)
    client.post(f"/bills/{bill['id']}/activate", headers=auth(tok))
    pid = _payments(client, tok)[0]["id"]
    client.post(f"/bills/payments/{pid}/pay", json={}, headers=auth(tok))
    client.delete(f"/bills/payments/{pid}", headers=auth(tok))
    client.post(f"/bills/{bill['id']}/archive", headers=auth(tok))

    assert client.delete(f"/bills/{bill['id']}", headers=auth(tok)).status_code == 204


def test_list_reports_can_delete(client):
    tok = register_and_login(client, "d-del4@test.com")
    _draft(client, tok, name="Empty")
    live = _draft(client, tok, name="Live")
    client.post(f"/bills/{live['id']}/activate", headers=auth(tok))
    flags = {
        b["name"]: b["can_delete"]
        for b in client.get("/bills", headers=auth(tok)).json()
    }
    assert flags == {"Empty": True, "Live": False}


def test_activate_creates_current_month_payment_without_sync(client):
    tok = register_and_login(client, "d-now@test.com")
    bill = _draft(client, tok)  # monthly, starts this month
    client.post(f"/bills/{bill['id']}/activate", headers=auth(tok))
    assert len(_payments(client, tok)) == 1
