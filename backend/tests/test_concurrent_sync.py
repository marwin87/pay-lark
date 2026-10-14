"""Several tabs/effects seeding the same month at once must all succeed (SQLite single writer)."""

from concurrent.futures import ThreadPoolExecutor

from tests.conftest import auth, category_id, register_and_login, today_utc


def test_parallel_sync_instances_all_succeed_without_duplicates(client):
    token = register_and_login(client, "par@test.com")
    cat = category_id(client, token)
    for i in range(5):
        r = client.post(
            "/bills",
            json={
                "name": f"Bill {i}",
                "frequency": "monthly",
                "amount": "10.00",
                "currency": "PLN",
                "due_day": 10 + i,
                "category_id": cat,
            },
            headers=auth(token),
        )
        assert r.status_code == 201, r.text
    month = today_utc().strftime("%Y-%m")

    def sync(_):
        return client.post(
            f"/bills/sync-instances?month={month}", headers=auth(token)
        ).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = list(pool.map(sync, range(16)))

    assert codes == [204] * 16
    rows = client.get(f"/bills/payments?month={month}", headers=auth(token)).json()
    assert len(rows) == 5
