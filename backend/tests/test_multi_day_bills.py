"""Multi-day bills: several payment days per cycle, and one-off bills with explicit dates."""

from datetime import date

from tests.conftest import (
    auth,
    category_id,
    register_and_login,
    sync_payments,
    today_utc,
)


def _period(offset: int = 0) -> str:
    t = today_utc()
    idx = t.year * 12 + t.month - 1 + offset
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def _create(client, token, **overrides) -> dict:
    body = {
        "name": "Gym",
        "category_id": category_id(client, token),
        "frequency": "monthly",
        "amount": "25.00",
        "currency": "PLN",
        **overrides,
    }
    r = client.post("/bills", json=body, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()


def _payments(client, token, period: str) -> list[dict]:
    r = client.get(f"/bills/payments?month={period}", headers=auth(token))
    assert r.status_code == 200, r.text
    return r.json()


def _due_days(rows: list[dict]) -> list[int]:
    return sorted(int(r["due_date"][8:10]) for r in rows)


def test_monthly_bill_with_three_days_gets_three_payments(client):
    token = register_and_login(client, "md_create@test.com")
    bill = _create(client, token, due_days=[17, 3, 10])
    assert bill["due_days"] == [3, 10, 17]
    assert bill["due_day"] == 3

    sync_payments(client, token, _period())
    assert _due_days(_payments(client, token, _period())) == [3, 10, 17]


def test_single_day_list_is_stored_like_a_plain_due_day(client):
    token = register_and_login(client, "md_single@test.com")
    bill = _create(client, token, due_days=[12])
    assert bill["due_day"] == 12
    assert bill["due_days"] is None


def test_days_repeat_every_cycle_with_interval(client):
    token = register_and_login(client, "md_interval@test.com")
    _create(client, token, due_days=[5, 20], interval=2)

    sync_payments(client, token, _period())
    sync_payments(client, token, _period(1))
    sync_payments(client, token, _period(2))

    assert len(_payments(client, token, _period())) == 2
    assert _payments(client, token, _period(1)) == []
    assert len(_payments(client, token, _period(2))) == 2


def test_invalid_day_lists_are_rejected(client):
    token = register_and_login(client, "md_invalid@test.com")
    cat = category_id(client, token)
    base = {"name": "X", "category_id": cat, "frequency": "monthly", "amount": "1"}
    for bad in ([0], [32], list(range(1, 33))):
        r = client.post("/bills", json={**base, "due_days": bad}, headers=auth(token))
        assert r.status_code == 422, bad


def test_dates_only_allowed_for_one_off_and_days_not(client):
    token = register_and_login(client, "md_combo@test.com")
    cat = category_id(client, token)
    base = {"name": "X", "category_id": cat, "amount": "1"}
    r = client.post(
        "/bills",
        json={**base, "frequency": "monthly", "dates": ["2030-01-05"]},
        headers=auth(token),
    )
    assert r.status_code == 422
    r = client.post(
        "/bills",
        json={**base, "frequency": "one_off", "due_days": [1, 2]},
        headers=auth(token),
    )
    assert r.status_code == 422
    r = client.post(
        "/bills",
        json={**base, "frequency": "one_off", "dates": []},
        headers=auth(token),
    )
    assert r.status_code == 422


def test_editing_a_single_day_keeps_the_payment_and_its_notes(client):
    token = register_and_login(client, "md_edit_single@test.com")
    bill = _create(client, token, due_day=15)
    sync_payments(client, token, _period())
    pid = _payments(client, token, _period())[0]["id"]
    r = client.patch(
        f"/bills/payments/{pid}", json={"notes": "keep me"}, headers=auth(token)
    )
    assert r.status_code == 200, r.text

    r = client.patch(f"/bills/{bill['id']}", json={"due_day": 20}, headers=auth(token))
    assert r.status_code == 200, r.text

    rows = _payments(client, token, _period())
    assert [(x["id"], x["due_date"][8:10], x["notes"]) for x in rows] == [
        (pid, "20", "keep me")
    ]


def test_editing_the_day_list_remaps_unpaid_and_drops_removed_slots(client):
    token = register_and_login(client, "md_edit_list@test.com")
    bill = _create(client, token, due_days=[3, 10, 17])
    sync_payments(client, token, _period())

    r = client.patch(
        f"/bills/{bill['id']}", json={"due_days": [3, 12]}, headers=auth(token)
    )
    assert r.status_code == 200, r.text
    assert r.json()["due_days"] == [3, 12]

    assert _due_days(_payments(client, token, _period())) == [3, 12]


def test_removed_slot_keeps_paid_history_and_regenerates_when_re_added(client):
    token = register_and_login(client, "md_edit_paid@test.com")
    bill = _create(client, token, due_days=[3, 10, 17])
    sync_payments(client, token, _period())
    last = max(_payments(client, token, _period()), key=lambda x: x["due_date"])
    r = client.post(f"/bills/payments/{last['id']}/pay", json={}, headers=auth(token))
    assert r.status_code == 200, r.text

    client.patch(f"/bills/{bill['id']}", json={"due_days": [3]}, headers=auth(token))
    # the paid third payment is history and stays; the unpaid second one is gone
    assert _due_days(_payments(client, token, _period())) == [3, 17]

    client.patch(
        f"/bills/{bill['id']}", json={"due_days": [3, 10]}, headers=auth(token)
    )
    sync_payments(client, token, _period())
    assert 10 in _due_days(_payments(client, token, _period()))


def test_clearing_due_days_back_to_one_day(client):
    token = register_and_login(client, "md_clear@test.com")
    bill = _create(client, token, due_days=[3, 10])
    sync_payments(client, token, _period())

    r = client.patch(
        f"/bills/{bill['id']}", json={"due_days": None}, headers=auth(token)
    )
    assert r.status_code == 200, r.text
    assert r.json()["due_days"] is None
    assert _due_days(_payments(client, token, _period())) == [3]


def test_legacy_due_day_patch_on_a_multi_day_bill_makes_it_single_day(client):
    token = register_and_login(client, "md_legacy@test.com")
    bill = _create(client, token, due_days=[3, 10])
    r = client.patch(f"/bills/{bill['id']}", json={"due_day": 8}, headers=auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["due_days"] is None and r.json()["due_day"] == 8


def test_one_off_with_dates_in_different_months(client):
    token = register_and_login(client, "md_oneoff@test.com")
    d1 = date.fromisoformat(f"{_period(1)}-05")
    d2 = date.fromisoformat(f"{_period(1)}-20")
    d3 = date.fromisoformat(f"{_period(2)}-02")
    bill = _create(
        client,
        token,
        frequency="one_off",
        dates=[d3.isoformat(), d1.isoformat(), d2.isoformat()],
    )
    assert bill["dates"] == [d1.isoformat(), d2.isoformat(), d3.isoformat()]
    assert bill["start_period"] == _period(1)

    assert _due_days(_payments(client, token, _period(1))) == [5, 20]
    assert _due_days(_payments(client, token, _period(2))) == [2]


def test_editing_one_off_dates_adds_removes_and_keeps_paid(client):
    token = register_and_login(client, "md_oneoff_edit@test.com")
    p = _period(1)
    bill = _create(client, token, frequency="one_off", dates=[f"{p}-05", f"{p}-20"])
    paid = next(x for x in _payments(client, token, p) if x["due_date"].endswith("-05"))
    client.post(f"/bills/payments/{paid['id']}/pay", json={}, headers=auth(token))

    r = client.patch(
        f"/bills/{bill['id']}",
        json={"dates": [f"{p}-12", f"{p}-25"]},
        headers=auth(token),
    )
    assert r.status_code == 200, r.text

    assert _due_days(_payments(client, token, p)) == [5, 12, 25]  # 05 is paid history
    assert r.json()["paid_dates"] == [f"{p}-05"]


def test_one_off_dates_in_the_same_month_get_distinct_slots(client):
    token = register_and_login(client, "md_oneoff_slots@test.com")
    p = _period(1)
    bill = _create(client, token, frequency="one_off", dates=[f"{p}-05", f"{p}-06"])
    # re-adding around an existing date must not collide with its slot
    r = client.patch(
        f"/bills/{bill['id']}",
        json={"dates": [f"{p}-06", f"{p}-07", f"{p}-08"]},
        headers=auth(token),
    )
    assert r.status_code == 200, r.text
    assert _due_days(_payments(client, token, p)) == [6, 7, 8]


def test_dates_on_a_recurring_bill_update_is_rejected(client):
    token = register_and_login(client, "md_dates_monthly@test.com")
    bill = _create(client, token, due_day=15)
    r = client.patch(
        f"/bills/{bill['id']}", json={"dates": ["2030-01-05"]}, headers=auth(token)
    )
    assert r.status_code == 422


def test_deleted_slot_stays_deleted_after_sync(client):
    token = register_and_login(client, "md_tombstone@test.com")
    _create(client, token, due_days=[3, 10, 17])
    sync_payments(client, token, _period())
    middle = next(
        x for x in _payments(client, token, _period()) if x["due_date"].endswith("-10")
    )
    r = client.delete(f"/bills/payments/{middle['id']}", headers=auth(token))
    assert r.status_code in (200, 204), r.text

    sync_payments(client, token, _period())
    assert _due_days(_payments(client, token, _period())) == [3, 17]


def test_changing_the_cycle_drops_unpaid_payments_the_new_cycle_skips(client):
    token = register_and_login(client, "md_cycle@test.com")
    bill = _create(client, token, due_day=15, due_month=today_utc().month)
    for offset in range(4):
        sync_payments(client, token, _period(offset))
    assert all(len(_payments(client, token, _period(o))) == 1 for o in range(4))

    r = client.patch(f"/bills/{bill['id']}", json={"interval": 3}, headers=auth(token))
    assert r.status_code == 200, r.text

    # now, +3 stay on the cycle; +1 and +2 are skipped and gone
    assert len(_payments(client, token, _period(0))) == 1
    assert _payments(client, token, _period(1)) == []
    assert _payments(client, token, _period(2)) == []
    assert len(_payments(client, token, _period(3))) == 1


def test_changing_the_cycle_keeps_paid_payments(client):
    token = register_and_login(client, "md_cycle_paid@test.com")
    bill = _create(client, token, due_day=15, due_month=today_utc().month)
    sync_payments(client, token, _period(1))
    pid = _payments(client, token, _period(1))[0]["id"]
    assert (
        client.post(
            f"/bills/payments/{pid}/pay", json={}, headers=auth(token)
        ).status_code
        == 200
    )

    client.patch(f"/bills/{bill['id']}", json={"interval": 3}, headers=auth(token))

    assert len(_payments(client, token, _period(1))) == 1  # paid history stays
