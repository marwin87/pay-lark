"""New bills are drafts: no payments until POST /bills/{id}/activate."""

from tests.conftest import auth, category_id, register_and_login, sync_payments

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
    assert bill["is_activated"] is False
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
    assert r.status_code == 200 and r.json()["is_activated"] is True
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
