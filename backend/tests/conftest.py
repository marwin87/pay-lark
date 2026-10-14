"""Test fixtures: throwaway SQLite file + FastAPI TestClient."""

import os
import tempfile
from datetime import date, datetime, timezone

# Settings() runs at import time and warns on the weak default secret when ../.env isn't
# found (cwd-relative, e.g. PyCharm running from the repo root).
os.environ.setdefault("JWT_SECRET", "x" * 32)  # pragma: allowlist secret
# New users get DEFAULT_TIMEZONE. Pin it (assigned, not setdefault: an env var beats ../.env)
# so the suite never depends on the developer's own .env, e.g. Europe/Warsaw, whose "today"
# differs from UTC's for hours around midnight.
os.environ["DEFAULT_TIMEZONE"] = "UTC"
# Same engine as the app (pragmas, UTC datetimes), pointed at a throwaway file.
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"

# Import models before app to (a) register them in Base.metadata for create_all
# and (b) avoid shadowing the `app` FastAPI instance with the `app` package name.
import app.models.bill  # noqa: F401
import app.models.category  # noqa: F401
import app.models.reset_token  # noqa: F401
import app.models.restore_snapshot  # noqa: F401
import app.models.user  # noqa: F401

import bcrypt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.core import rate_limit
from app.core.database import Base, engine, get_db
from app.main import app


def today_utc() -> date:
    """Today as the app computes it: users default to UTC, never the machine's zone."""
    return datetime.now(timezone.utc).date()


@pytest.fixture(scope="session", autouse=True)
def _fast_bcrypt():
    """bcrypt's default cost (12) is ~0.25s per hash and per check, and most tests register
    and log in a user: that was over half the suite's runtime. Cost 4 is the bcrypt minimum;
    checkpw reads the cost from the hash, so verification works the same."""
    real_gensalt = bcrypt.gensalt
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            bcrypt,
            "gensalt",
            lambda rounds=4, prefix=b"2b": real_gensalt(rounds, prefix),
        )
        yield


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    """The limiter is process-global state; every test starts with a clean slate."""
    rate_limit.reset()
    yield
    rate_limit.reset()


@pytest.fixture(scope="session")
def db_engine():
    yield engine


@pytest.fixture()
def db_tables(db_engine):
    Base.metadata.create_all(bind=db_engine)
    yield
    Base.metadata.drop_all(bind=db_engine)


@pytest.fixture()
def db_session(db_engine, db_tables):
    Session = sessionmaker(bind=db_engine, autocommit=False, autoflush=False)
    db = Session()
    yield db
    db.close()


@pytest.fixture()
def db_sessionmaker(db_engine, db_tables):
    return sessionmaker(bind=db_engine, autocommit=False, autoflush=False)


def _auto_activate_bills(client: TestClient) -> None:
    """New bills are drafts; most tests want live payments, so a successful POST /bills
    is followed by its activation. A test of the draft flow sets `client.auto_activate = False`.
    """
    client.auto_activate = True
    real_request = client.request

    def request(method, url, *args, **kwargs):
        r = real_request(method, url, *args, **kwargs)
        if (
            client.auto_activate
            and method == "POST"
            and str(url) == "/bills"
            and r.status_code == 201
        ):
            a = real_request(
                "POST",
                f"/bills/{r.json()['id']}/activate",
                headers=kwargs.get("headers"),
            )
            assert a.status_code == 200, a.text
        return r

    client.request = request  # type: ignore[method-assign]


@pytest.fixture()
def client(db_engine):
    Base.metadata.create_all(bind=db_engine)
    _SessionLocal = sessionmaker(bind=db_engine, autocommit=False, autoflush=False)

    def _override_get_db():
        db = _SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        _auto_activate_bills(c)
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=db_engine)


def _end_read_snapshots(client: TestClient, db) -> None:
    """SQLite pins a read transaction to a snapshot (Postgres READ COMMITTED does not), so the
    test's long-lived session would miss, or fail to write over, what the app committed.
    End its transaction around every request unless it has pending changes."""
    real_request = client.request

    def _release() -> None:
        if not (db.new or db.dirty or db.deleted):
            db.rollback()

    def request(*args, **kwargs):
        _release()
        try:
            return real_request(*args, **kwargs)
        finally:
            _release()

    client.request = request  # type: ignore[method-assign]


@pytest.fixture()
def client_db(db_engine):
    """TestClient + direct DB session sharing the same engine."""
    Base.metadata.create_all(bind=db_engine)
    SessionLocal = sessionmaker(bind=db_engine, autocommit=False, autoflush=False)

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        _auto_activate_bills(c)
        db = SessionLocal()
        _end_read_snapshots(c, db)
        yield c, db
        db.close()
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=db_engine)


def register_and_login(
    client: TestClient, email: str, password: str = "pw123456"
) -> str:
    """Register a user and return their Bearer token."""
    r = client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.cookies["access_token"]


def enable_notifications(client: TestClient, token: str) -> None:
    """New users start with every notification off; turn on the email + telegram
    reminders (1 day before) and monthly summaries."""
    r = client.patch(
        "/auth/me",
        json={
            "email_reminders_enabled": True,
            "notify_1_day_before": True,
            "monthly_summary_enabled": True,
            "telegram_reminders_enabled": True,
            "telegram_notify_1_day_before": True,
            "telegram_monthly_summary_enabled": True,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def category_id(client: TestClient, token: str, slug: str = "utilities") -> int:
    """Id of one of the user's seeded default categories, looked up by slug."""
    r = client.get("/categories", headers=auth(token))
    assert r.status_code == 200, r.text
    for c in r.json():
        if c["slug"] == slug:
            return c["id"]
    raise AssertionError(f"no category with slug={slug!r} for this user")


def sync_payments(client: TestClient, token: str, month: str | None = None) -> None:
    """Seed payment instances for the current month (or a given month), then return."""
    from datetime import date as _date

    target = month or _date.today().strftime("%Y-%m")
    r = client.post(f"/bills/sync-instances?month={target}", headers=auth(token))
    assert r.status_code == 204, r.text
