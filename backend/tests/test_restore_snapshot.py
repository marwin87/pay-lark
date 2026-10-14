"""Integration tests for the restore safety-net: snapshot-on-restore and cleanup job."""

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import sessionmaker

from app.models.restore_snapshot import RestoreSnapshot
from app.models.user import User
from app.services.snapshot_cleanup import cleanup_old_snapshots
from tests.conftest import auth, category_id, register_and_login, sync_payments

_BILL = {
    "name": "Electricity",
    "frequency": "monthly",
    "amount": 120.00,
    "currency": "PLN",
    "due_day": 15,
    "notes": None,
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


def test_snapshot_created_after_restore_with_existing_data(client, client_db):
    tok = register_and_login(client, "snap_a@test.com")

    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r.status_code == 201
    sync_payments(client, tok)
    client.get("/bills/payments", headers=auth(tok))

    pre_restore = client.get("/export/json", headers=auth(tok)).json()

    empty_backup = _make_backup([], [])
    r = _upload(client, tok, empty_backup)
    assert r.status_code == 200

    _, db = client_db
    snapshots = db.query(RestoreSnapshot).all()
    assert len(snapshots) == 1
    payload = snapshots[0].payload
    assert len(payload["bill_templates"]) == len(pre_restore["bill_templates"])
    assert len(payload["payment_instances"]) == len(pre_restore["payment_instances"])
    assert payload["bill_templates"][0]["name"] == _BILL["name"]


def test_second_restore_overwrites_snapshot_not_duplicates(client, client_db):
    tok = register_and_login(client, "snap_b@test.com")

    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r.status_code == 201
    sync_payments(client, tok)

    r = _upload(client, tok, _make_backup([], []))
    assert r.status_code == 200

    # Recreate data so the second restore also has something to snapshot.
    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r.status_code == 201
    sync_payments(client, tok)

    r = _upload(client, tok, _make_backup([], []))
    assert r.status_code == 200

    _, db = client_db
    snapshots = db.query(RestoreSnapshot).all()
    assert len(snapshots) == 1


def test_no_snapshot_created_for_user_with_no_existing_bills(client, client_db):
    tok = register_and_login(client, "snap_c@test.com")

    r = _upload(client, tok, _make_backup([], []))
    assert r.status_code == 200

    _, db = client_db
    assert db.query(RestoreSnapshot).count() == 0


def test_cleanup_removes_stale_snapshots_keeps_fresh(client, client_db):
    tok_old = register_and_login(client, "snap_old@test.com")
    tok_fresh = register_and_login(client, "snap_fresh@test.com")

    for tok in (tok_old, tok_fresh):
        r = client.post(
            "/bills",
            json={**_BILL, "category_id": category_id(client, tok)},
            headers=auth(tok),
        )
        assert r.status_code == 201
        sync_payments(client, tok)
        r = _upload(client, tok, _make_backup([], []))
        assert r.status_code == 200

    _, db = client_db
    old_user_id = db.query(User.id).filter(User.email == "snap_old@test.com").scalar()
    old_snapshot = (
        db.query(RestoreSnapshot).filter(RestoreSnapshot.user_id == old_user_id).one()
    )
    old_snapshot.created_at = datetime.now(timezone.utc) - timedelta(days=30)
    old_user_snapshot_id = old_snapshot.user_id
    db.commit()

    cleanup_old_snapshots(sessionmaker(bind=db.get_bind()))

    remaining = db.query(RestoreSnapshot).all()
    assert len(remaining) == 1
    assert remaining[0].user_id != old_user_snapshot_id


def test_snapshot_scoped_per_user(client, client_db):
    tok_a = register_and_login(client, "snap_scope_a@test.com")
    tok_b = register_and_login(client, "snap_scope_b@test.com")

    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok_a)},
        headers=auth(tok_a),
    )
    assert r.status_code == 201
    sync_payments(client, tok_a)

    r = _upload(client, tok_a, _make_backup([], []))
    assert r.status_code == 200

    # User B restoring with no existing data must not create or touch any snapshot.
    r = _upload(client, tok_b, _make_backup([], []))
    assert r.status_code == 200

    _, db = client_db
    snapshots = db.query(RestoreSnapshot).all()
    assert len(snapshots) == 1


# ---------------------------------------------------------------------------
# Phase 3: recovery API — GET /export/last-snapshot, POST /export/restore-snapshot
# ---------------------------------------------------------------------------


def test_last_snapshot_404_when_none_exists(client):
    tok = register_and_login(client, "last_snap_none@test.com")
    r = client.get("/export/last-snapshot", headers=auth(tok))
    assert r.status_code == 404


def test_last_snapshot_returns_created_at_when_exists(client):
    tok = register_and_login(client, "last_snap_exists@test.com")

    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r.status_code == 201
    sync_payments(client, tok)

    r = _upload(client, tok, _make_backup([], []))
    assert r.status_code == 200

    r = client.get("/export/last-snapshot", headers=auth(tok))
    assert r.status_code == 200
    assert "created_at" in r.json()


def test_restore_from_snapshot_restores_data_and_removes_snapshot(client, client_db):
    tok = register_and_login(client, "restore_snap@test.com")

    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r.status_code == 201
    sync_payments(client, tok)

    pre_restore = client.get("/export/json", headers=auth(tok)).json()

    r = _upload(client, tok, _make_backup([], []))
    assert r.status_code == 200
    assert client.get("/bills", headers=auth(tok)).json() == []

    r = client.post("/export/restore-snapshot", headers=auth(tok))
    assert r.status_code == 200
    data = r.json()
    assert data["restored_templates"] == len(pre_restore["bill_templates"])
    assert data["restored_instances"] == len(pre_restore["payment_instances"])

    bills = client.get("/bills", headers=auth(tok)).json()
    assert len(bills) == 1
    assert bills[0]["name"] == _BILL["name"]

    _, db = client_db
    assert db.query(RestoreSnapshot).count() == 0
    db.rollback()  # SQLite: an open session transaction holds the write lock

    # Consumed snapshot cannot be replayed.
    r = client.post("/export/restore-snapshot", headers=auth(tok))
    assert r.status_code == 404


def test_restore_from_snapshot_404_when_none_exists(client):
    tok = register_and_login(client, "restore_snap_none@test.com")
    r = client.post("/export/restore-snapshot", headers=auth(tok))
    assert r.status_code == 404


def test_recovery_endpoints_scoped_per_user(client):
    tok_a = register_and_login(client, "recovery_scope_a@test.com")
    tok_b = register_and_login(client, "recovery_scope_b@test.com")

    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok_a)},
        headers=auth(tok_a),
    )
    assert r.status_code == 201
    sync_payments(client, tok_a)
    r = _upload(client, tok_a, _make_backup([], []))
    assert r.status_code == 200

    # User B has no snapshot of their own, even though A does.
    r = client.get("/export/last-snapshot", headers=auth(tok_b))
    assert r.status_code == 404
    r = client.post("/export/restore-snapshot", headers=auth(tok_b))
    assert r.status_code == 404

    # User A's snapshot/recovery is untouched by B's requests.
    r = client.get("/export/last-snapshot", headers=auth(tok_a))
    assert r.status_code == 200


def test_last_snapshot_404_when_past_retention_window(client, client_db):
    tok = register_and_login(client, "last_snap_stale@test.com")

    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r.status_code == 201
    sync_payments(client, tok)
    r = _upload(client, tok, _make_backup([], []))
    assert r.status_code == 200

    _, db = client_db
    snapshot = db.query(RestoreSnapshot).one()
    snapshot.created_at = datetime.now(timezone.utc) - timedelta(days=8)
    db.commit()

    r = client.get("/export/last-snapshot", headers=auth(tok))
    assert r.status_code == 404


def test_restore_from_snapshot_404_when_past_retention_window(client, client_db):
    tok = register_and_login(client, "restore_snap_stale@test.com")

    r = client.post(
        "/bills",
        json={**_BILL, "category_id": category_id(client, tok)},
        headers=auth(tok),
    )
    assert r.status_code == 201
    sync_payments(client, tok)
    r = _upload(client, tok, _make_backup([], []))
    assert r.status_code == 200

    _, db = client_db
    snapshot = db.query(RestoreSnapshot).one()
    snapshot.created_at = datetime.now(timezone.utc) - timedelta(days=8)
    db.commit()

    r = client.post("/export/restore-snapshot", headers=auth(tok))
    assert r.status_code == 404
