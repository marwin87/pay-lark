"""Per-user data isolation tests.

Each test registers two users (A and B), creates data as A, then asserts
B cannot see or mutate it.
"""

from tests.conftest import auth, category_id, register_and_login, sync_payments

_BILL = {
    "name": "Electricity",
    "frequency": "monthly",
    "amount": 120.00,
    "currency": "PLN",
    "due_day": 15,
    "notes": None,
}


def _create_bill(client, token: str) -> int:
    payload = {**_BILL, "category_id": category_id(client, token)}
    r = client.post("/bills", json=payload, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _seed_payment(client, token: str, bill_id: int) -> int:
    """Sync instances then return the instance id for bill_id."""
    sync_payments(client, token)
    r = client.get("/bills/payments", headers=auth(token))
    assert r.status_code == 200, r.text
    instances = [i for i in r.json() if i["bill_id"] == bill_id]
    assert instances, f"No payment instance found for bill_id={bill_id}"
    return instances[0]["id"]


# ---------------------------------------------------------------------------
# List endpoints
# ---------------------------------------------------------------------------


def test_list_bills_scoped(client):
    tok_a = register_and_login(client, "a@test.com")
    tok_b = register_and_login(client, "b@test.com")

    _create_bill(client, tok_a)
    _create_bill(client, tok_a)

    r = client.get("/bills", headers=auth(tok_b))
    assert r.status_code == 200
    assert r.json() == []


def test_list_payments_scoped(client):
    tok_a = register_and_login(client, "a@test.com")
    tok_b = register_and_login(client, "b@test.com")

    _create_bill(client, tok_a)
    sync_payments(client, tok_a)
    client.get("/bills/payments", headers=auth(tok_a))

    r = client.get("/bills/payments", headers=auth(tok_b))
    assert r.status_code == 200
    assert r.json() == []


# ---------------------------------------------------------------------------
# Mutation endpoints — must return 403 for cross-user access
# ---------------------------------------------------------------------------


def test_mark_paid_other_user_returns_403(client):
    tok_a = register_and_login(client, "a@test.com")
    tok_b = register_and_login(client, "b@test.com")

    bill_id = _create_bill(client, tok_a)
    instance_id = _seed_payment(client, tok_a, bill_id)

    r = client.post(
        f"/bills/payments/{instance_id}/pay",
        json={"paid_amount": None, "notes": None},
        headers=auth(tok_b),
    )
    assert r.status_code == 403


def test_revert_payment_other_user_returns_403(client):
    tok_a = register_and_login(client, "a@test.com")
    tok_b = register_and_login(client, "b@test.com")

    bill_id = _create_bill(client, tok_a)
    instance_id = _seed_payment(client, tok_a, bill_id)

    # A marks paid first
    client.post(
        f"/bills/payments/{instance_id}/pay",
        json={"paid_amount": None, "notes": None},
        headers=auth(tok_a),
    )

    r = client.post(
        f"/bills/payments/{instance_id}/unpay",
        headers=auth(tok_b),
    )
    assert r.status_code == 403


def test_update_bill_other_user_returns_403(client):
    tok_a = register_and_login(client, "a@test.com")
    tok_b = register_and_login(client, "b@test.com")

    bill_id = _create_bill(client, tok_a)

    r = client.patch(
        f"/bills/{bill_id}",
        json={"name": "Hacked"},
        headers=auth(tok_b),
    )
    assert r.status_code == 403


def test_archive_bill_other_user_returns_403(client):
    tok_a = register_and_login(client, "a@test.com")
    tok_b = register_and_login(client, "b@test.com")

    bill_id = _create_bill(client, tok_a)

    r = client.post(f"/bills/{bill_id}/archive", headers=auth(tok_b))
    assert r.status_code == 403


def test_delete_payment_other_user_returns_403(client):
    tok_a = register_and_login(client, "a@test.com")
    tok_b = register_and_login(client, "b@test.com")

    bill_id = _create_bill(client, tok_a)
    instance_id = _seed_payment(client, tok_a, bill_id)

    r = client.delete(f"/bills/payments/{instance_id}", headers=auth(tok_b))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Export endpoints
# ---------------------------------------------------------------------------


def test_export_json_scoped(client):
    tok_a = register_and_login(client, "a@test.com")
    tok_b = register_and_login(client, "b@test.com")

    _create_bill(client, tok_a)
    _create_bill(client, tok_a)

    r = client.get("/export/json", headers=auth(tok_b))
    assert r.status_code == 200
    data = r.json()
    assert data["schema_version"] == 8
    assert data["exported_by"] == "b@test.com"
    assert "users" not in data
    assert data["bill_templates"] == []
    assert data["payment_instances"] == []


def test_export_xlsx_scoped(client):
    import io
    import openpyxl

    tok_a = register_and_login(client, "a@test.com")
    tok_b = register_and_login(client, "b@test.com")

    _create_bill(client, tok_a)

    r = client.get("/export/xlsx", headers=auth(tok_b))
    assert r.status_code == 200
    assert (
        r.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    for sheet in wb.worksheets:
        # Each sheet has a header row only; no data rows for user B.
        assert sheet.max_row <= 1, f"Sheet {sheet.title} has unexpected data rows"


# ---------------------------------------------------------------------------
# Account deletion — must cascade only within the deleting user's own rows
# ---------------------------------------------------------------------------


def test_delete_account_only_removes_own_data(client_db):
    from app.models.bill import BillTemplate
    from app.models.category import Category
    from app.models.user import User

    client, db = client_db
    tok_a = register_and_login(client, "a@test.com")
    tok_b = register_and_login(client, "b@test.com")

    bill_a = _create_bill(client, tok_a)
    _seed_payment(client, tok_a, bill_a)
    bill_b = _create_bill(client, tok_b)
    _seed_payment(client, tok_b, bill_b)

    r = client.request(
        "DELETE",
        "/auth/users/me",
        json={"current_password": "pw123456"},  # pragma: allowlist secret
        headers=auth(tok_a),
    )
    assert r.status_code == 204

    # B's bills, payments, and categories are untouched.
    r = client.get("/bills", headers=auth(tok_b))
    assert r.status_code == 200
    assert [bill["id"] for bill in r.json()] == [bill_b]

    r = client.get("/bills/payments", headers=auth(tok_b))
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = client.get("/categories", headers=auth(tok_b))
    assert r.status_code == 200
    assert len(r.json()) > 0

    # B's own account still works.
    r = client.get("/auth/me", headers=auth(tok_b))
    assert r.status_code == 200
    assert r.json()["email"] == "b@test.com"

    # A's rows are actually gone, B's survive, at the DB level.
    assert db.query(User).filter(User.email == "a@test.com").first() is None
    assert db.get(BillTemplate, bill_a) is None
    assert db.get(BillTemplate, bill_b) is not None
    user_b = db.query(User).filter(User.email == "b@test.com").one()
    assert db.query(Category).filter(Category.user_id == user_b.id).count() > 0
