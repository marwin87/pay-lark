"""Tests for /categories — CRUD, defaults seeding, archive, and ownership."""

from tests.conftest import auth, register_and_login


def test_registration_seeds_ten_default_categories(client):
    tok = register_and_login(client, "seed@test.com")
    r = client.get("/categories", headers=auth(tok))
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 10
    assert all(c["is_default"] for c in data)
    slugs = {c["slug"] for c in data}
    assert slugs == {
        "education",
        "entertainment",
        "healthcare",
        "housing",
        "insurance",
        "loans",
        "subscriptions",
        "transport",
        "utilities",
        "other",
    }


def test_create_category(client):
    tok = register_and_login(client, "create@test.com")
    r = client.post(
        "/categories", json={"name": "Hobbies", "color": "pink"}, headers=auth(tok)
    )
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Hobbies"
    assert data["slug"] is None
    assert data["is_default"] is False
    assert data["sort_order"] == 10  # appended after the 10 seeded defaults


def test_create_category_invalid_color_returns_422(client):
    tok = register_and_login(client, "badcolor@test.com")
    r = client.post(
        "/categories",
        json={"name": "Weird", "color": "not-a-real-color"},
        headers=auth(tok),
    )
    assert r.status_code == 422


def test_rename_category_reflects_on_existing_bills(client):
    tok = register_and_login(client, "rename@test.com")
    r = client.get("/categories", headers=auth(tok))
    utilities = next(c for c in r.json() if c["slug"] == "utilities")

    r = client.post(
        "/bills",
        json={
            "name": "Electricity",
            "category_id": utilities["id"],
            "frequency": "monthly",
            "amount": "100.00",
            "currency": "PLN",
            "due_day": 15,
        },
        headers=auth(tok),
    )
    assert r.status_code == 201

    r = client.patch(
        f"/categories/{utilities['id']}",
        json={"name": "Bills & Utilities"},
        headers=auth(tok),
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Bills & Utilities"

    bills = client.get("/bills", headers=auth(tok)).json()
    assert bills[0]["category"]["name"] == "Bills & Utilities"


def test_archive_category_hides_it_by_default_but_keeps_bill_reference(client):
    tok = register_and_login(client, "archive@test.com")
    r = client.get("/categories", headers=auth(tok))
    other = next(c for c in r.json() if c["slug"] == "other")

    r = client.post(
        "/bills",
        json={
            "name": "Misc",
            "category_id": other["id"],
            "frequency": "monthly",
            "amount": "10.00",
            "currency": "PLN",
            "due_day": 1,
        },
        headers=auth(tok),
    )
    assert r.status_code == 201

    r = client.post(f"/categories/{other['id']}/archive", headers=auth(tok))
    assert r.status_code == 204

    r = client.get("/categories", headers=auth(tok))
    assert other["id"] not in {c["id"] for c in r.json()}

    r = client.get("/categories?include_archived=true", headers=auth(tok))
    archived = next(c for c in r.json() if c["id"] == other["id"])
    assert archived["is_archived"] is True

    bills = client.get("/bills", headers=auth(tok)).json()
    assert bills[0]["category"]["id"] == other["id"]

    r = client.post(f"/categories/{other['id']}/unarchive", headers=auth(tok))
    assert r.status_code == 204


def test_category_update_other_user_returns_404(client):
    tok_a = register_and_login(client, "cat_a@test.com")
    tok_b = register_and_login(client, "cat_b@test.com")

    r = client.get("/categories", headers=auth(tok_a))
    category_a = r.json()[0]

    r = client.patch(
        f"/categories/{category_a['id']}", json={"name": "Hacked"}, headers=auth(tok_b)
    )
    assert r.status_code == 404


def test_category_archive_other_user_returns_404(client):
    tok_a = register_and_login(client, "cat_arch_a@test.com")
    tok_b = register_and_login(client, "cat_arch_b@test.com")

    r = client.get("/categories", headers=auth(tok_a))
    category_a = r.json()[0]

    r = client.post(f"/categories/{category_a['id']}/archive", headers=auth(tok_b))
    assert r.status_code == 404


def test_category_not_found_returns_404(client):
    tok = register_and_login(client, "cat_404@test.com")
    r = client.patch("/categories/999999", json={"name": "X"}, headers=auth(tok))
    assert r.status_code == 404


def test_bill_with_other_users_category_id_returns_404(client):
    tok_a = register_and_login(client, "bcat_a@test.com")
    tok_b = register_and_login(client, "bcat_b@test.com")

    categories_a = client.get("/categories", headers=auth(tok_a)).json()

    r = client.post(
        "/bills",
        json={
            "name": "Stolen",
            "category_id": categories_a[0]["id"],
            "frequency": "monthly",
            "amount": "10.00",
            "currency": "PLN",
            "due_day": 1,
        },
        headers=auth(tok_b),
    )
    assert r.status_code == 404


def test_category_name_length_is_validated(client):
    tok = register_and_login(client, "catlen@test.com")
    for name in ("", "x" * 51):
        r = client.post(
            "/categories", json={"name": name, "color": "blue"}, headers=auth(tok)
        )
        assert r.status_code == 422, name
    r = client.post(
        "/categories", json={"name": "x" * 50, "color": "blue"}, headers=auth(tok)
    )
    assert r.status_code == 201


def test_rename_default_category_keeps_slug(client):
    # The frontend shows the translated label only while name == slug, so a
    # rename must change name but leave slug (used by backup restore) intact.
    tok = register_and_login(client, "rename-default@test.com")
    housing = next(
        c
        for c in client.get("/categories", headers=auth(tok)).json()
        if c["slug"] == "housing"
    )
    r = client.patch(
        f"/categories/{housing['id']}", json={"name": "Dom"}, headers=auth(tok)
    )
    assert r.status_code == 200
    assert (r.json()["name"], r.json()["slug"], r.json()["is_default"]) == (
        "Dom",
        "housing",
        True,
    )


def test_delete_unused_category(client):
    tok = register_and_login(client, "del_unused@test.com")
    r = client.post(
        "/categories", json={"name": "Hobbies", "color": "pink"}, headers=auth(tok)
    )
    cid = r.json()["id"]

    assert client.delete(f"/categories/{cid}", headers=auth(tok)).status_code == 204
    r = client.get("/categories?include_archived=true", headers=auth(tok))
    assert cid not in {c["id"] for c in r.json()}


def test_delete_category_used_by_bill_returns_409(client):
    tok = register_and_login(client, "del_used@test.com")
    other = next(
        c
        for c in client.get("/categories", headers=auth(tok)).json()
        if c["slug"] == "other"
    )
    client.post(
        "/bills",
        json={
            "name": "Misc",
            "category_id": other["id"],
            "frequency": "monthly",
            "amount": "10.00",
            "currency": "PLN",
            "due_day": 1,
        },
        headers=auth(tok),
    )

    assert (
        client.delete(f"/categories/{other['id']}", headers=auth(tok)).status_code
        == 409
    )


def test_category_delete_other_user_returns_404(client):
    tok_a = register_and_login(client, "cat_del_a@test.com")
    tok_b = register_and_login(client, "cat_del_b@test.com")
    category_a = client.get("/categories", headers=auth(tok_a)).json()[0]

    assert (
        client.delete(
            f"/categories/{category_a['id']}", headers=auth(tok_b)
        ).status_code
        == 404
    )
