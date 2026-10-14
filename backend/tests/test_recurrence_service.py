"""Tests for app/services/recurrence.py.

Section 1 (below): pure-function parametrized tests — no DB, no fixtures.
Section 2 (below): DB-backed service tests for generate_next_instance
  and ensure_current_period_instances.

Research: context/changes/testing-recurrence-unit/research.md
"""

import types
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.exc import IntegrityError as SAIntegrityError

import app.models.bill  # noqa: F401 — register models with SQLAlchemy's mapper
import app.models.category  # noqa: F401
import app.models.user  # noqa: F401
from app.models.bill import (
    BillFrequency,
    BillTemplate,
    PaymentInstance,
    PaymentStatus,
)
from app.models.category import Category
from app.models.user import User
from app.services.categories import seed_default_categories
from app.services.recurrence import (
    _bill_active_in_period,
    _due_date_for_period,
    _next_period,
    backfill_template_instances,
    ensure_current_period_instances,
    generate_next_instance,
)

# ── Section 1: pure function tests (no DB) ───────────────────────────────────


@pytest.mark.parametrize(
    "period,frequency,interval,expected",
    [
        # monthly — standard and year rollover
        ("2026-01", BillFrequency.monthly, 1, "2026-02"),
        ("2026-12", BillFrequency.monthly, 1, "2027-01"),
        # monthly/2 — rollover cases
        ("2026-11", BillFrequency.monthly, 2, "2027-01"),
        ("2026-12", BillFrequency.monthly, 2, "2027-02"),
        # monthly/3 (quarterly) — rollover cases
        ("2026-01", BillFrequency.monthly, 3, "2026-04"),
        ("2026-10", BillFrequency.monthly, 3, "2027-01"),
        ("2026-12", BillFrequency.monthly, 3, "2027-03"),
        # monthly/4 and /6 — year rollover
        ("2026-09", BillFrequency.monthly, 4, "2027-01"),
        ("2026-12", BillFrequency.monthly, 4, "2027-04"),
        ("2026-07", BillFrequency.monthly, 6, "2027-01"),
        ("2026-12", BillFrequency.monthly, 12, "2027-12"),
        # annual — standard, December, multi-year
        ("2026-06", BillFrequency.annual, 1, "2027-06"),
        ("2026-12", BillFrequency.annual, 1, "2027-12"),
        ("2026-06", BillFrequency.annual, 2, "2028-06"),
        # one_off invariant: same period returned unchanged.
        # The guard in generate_next_instance prevents this path from being
        # reached in production — this test documents the invariant.
        ("2026-06", BillFrequency.one_off, 1, "2026-06"),
    ],
)
def test_next_period(
    period: str, frequency: BillFrequency, interval: int, expected: str
) -> None:
    assert _next_period(period, frequency, interval) == expected


@pytest.mark.parametrize(
    "period,due_day,expected",
    [
        # Month-end clamping: expected values are hardcoded dates,
        # never recomputed via calendar.monthrange (oracle problem).
        ("2026-02", 31, date(2026, 2, 28)),  # non-leap February
        ("2024-02", 31, date(2024, 2, 29)),  # leap-year February
        ("2026-04", 31, date(2026, 4, 30)),  # April has 30 days
        ("2026-11", 31, date(2026, 11, 30)),  # November has 30 days
        ("2026-01", 31, date(2026, 1, 31)),  # January 31 is valid
        ("2026-12", 31, date(2026, 12, 31)),  # December 31 is valid
        ("2026-06", 15, date(2026, 6, 15)),  # mid-month, no clamping
        ("2026-06", None, date(2026, 6, 1)),  # None defaults to day 1
    ],
)
def test_due_date_for_period(period: str, due_day: int | None, expected: date) -> None:
    assert _due_date_for_period(period, due_day) == expected


def _stub(
    frequency: BillFrequency,
    start_period: str | None,
    created_at: datetime | None = None,
    interval: int = 1,
) -> types.SimpleNamespace:
    """Lightweight BillTemplate stub for pure-function tests.

    Only populates the attributes _bill_active_in_period reads:
    frequency, start_period, end_period, created_at.
    """
    return types.SimpleNamespace(
        frequency=frequency,
        interval=interval,
        start_period=start_period,
        end_period=None,
        created_at=created_at or datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


@pytest.mark.parametrize(
    "frequency,interval,start_period,target_period,expected",
    [
        # monthly — active from anchor onward, inactive before it
        (BillFrequency.monthly, 1, "2026-01", "2026-06", True),
        (BillFrequency.monthly, 1, "2026-06", "2026-01", False),  # before anchor
        # monthly/3 — active at anchor and multiples of 3, inactive otherwise
        (BillFrequency.monthly, 3, "2026-01", "2026-01", True),
        (BillFrequency.monthly, 3, "2026-01", "2026-04", True),
        (BillFrequency.monthly, 3, "2026-01", "2026-02", False),
        (BillFrequency.monthly, 3, "2026-01", "2025-12", False),  # before anchor
        # monthly/2
        (BillFrequency.monthly, 2, "2026-01", "2026-03", True),
        (BillFrequency.monthly, 2, "2026-01", "2026-02", False),
        # monthly/4 and /6 — across the year boundary
        (BillFrequency.monthly, 4, "2026-11", "2027-03", True),
        (BillFrequency.monthly, 4, "2026-11", "2027-02", False),
        (BillFrequency.monthly, 6, "2026-08", "2027-02", True),
        (BillFrequency.monthly, 6, "2026-08", "2027-01", False),
        # annual
        (BillFrequency.annual, 1, "2026-06", "2027-06", True),
        (BillFrequency.annual, 1, "2026-06", "2027-05", False),
        (BillFrequency.annual, 2, "2026-06", "2027-06", False),  # off-year
        (BillFrequency.annual, 2, "2026-06", "2028-06", True),
        # one_off: always inactive
        (BillFrequency.one_off, 1, "2026-01", "2026-01", False),
    ],
)
def test_bill_active_in_period(
    frequency: BillFrequency,
    interval: int,
    start_period: str,
    target_period: str,
    expected: bool,
) -> None:
    template = _stub(frequency, start_period, interval=interval)
    assert _bill_active_in_period(template, target_period) == expected


def test_bill_active_in_period_created_at_fallback() -> None:
    """start_period=None falls back to created_at.strftime('%Y-%m') as anchor.

    This covers the backward-compat path (recurrence.py:46) for rows that
    predate the start_period column.  created_at=2026-01-15 → anchor "2026-01".
    """
    template = _stub(
        BillFrequency.monthly,
        start_period=None,
        created_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
        interval=3,
    )
    # +3 months from anchor "2026-01" → active
    assert _bill_active_in_period(template, "2026-04") is True
    # +1 month → inactive
    assert _bill_active_in_period(template, "2026-02") is False


# ── Section 2: DB-backed service tests ──────────────────────────────────────


def _make_user(db, email: str = "u@test.com") -> User:
    user = User(email=email, password_hash="x")
    db.add(user)
    db.flush()
    seed_default_categories(db, user.id)
    return user


def _make_bill(
    db,
    user_id: int,
    *,
    frequency: BillFrequency = BillFrequency.monthly,
    interval: int = 1,
    due_day: int = 15,
    amount: Decimal = Decimal("100.00"),
    start_period: str = "2026-01",
    is_archived: bool = False,
    end_period: str | None = None,
) -> BillTemplate:
    category = (
        db.query(Category)
        .filter(Category.user_id == user_id, Category.slug == "other")
        .first()
    )
    bill = BillTemplate(
        is_activated=True,
        name="Test Bill",
        frequency=frequency,
        interval=interval,
        amount=amount,
        currency="PLN",
        due_day=due_day,
        start_period=start_period,
        end_period=end_period,
        is_archived=is_archived,
        category_id=category.id,
        user_id=user_id,
    )
    db.add(bill)
    db.flush()
    return bill


def _make_instance(
    db,
    bill_id: int,
    period: str,
    *,
    is_deleted: bool = False,
) -> PaymentInstance:
    year, month = int(period[:4]), int(period[5:])
    inst = PaymentInstance(
        bill_id=bill_id,
        period=period,
        due_date=date(year, month, 1),
        amount=Decimal("100.00"),
        status=PaymentStatus.upcoming,
        is_deleted=is_deleted,
    )
    db.add(inst)
    db.flush()
    return inst


# ── generate_next_instance ───────────────────────────────────────────────────


def test_generate_next_instance_monthly_creates_next_period(db_session) -> None:
    user = _make_user(db_session)
    bill = _make_bill(
        db_session,
        user.id,
        frequency=BillFrequency.monthly,
        due_day=15,
        start_period="2026-05",
    )
    bill_id = bill.id
    db_session.commit()

    bill = db_session.get(BillTemplate, bill_id)
    instance = generate_next_instance(db_session, bill, "2026-05")

    assert instance is not None
    assert instance.period == "2026-06"
    assert instance.status == PaymentStatus.upcoming
    assert instance.due_date == date(2026, 6, 15)


def test_generate_next_instance_one_off_returns_none(db_session) -> None:
    user = _make_user(db_session)
    bill = _make_bill(db_session, user.id, frequency=BillFrequency.one_off)
    bill_id = bill.id
    db_session.commit()

    bill = db_session.get(BillTemplate, bill_id)
    result = generate_next_instance(db_session, bill, "2026-05")

    assert result is None
    assert db_session.query(PaymentInstance).filter_by(bill_id=bill_id).count() == 0


def test_generate_next_instance_idempotent(db_session) -> None:
    user = _make_user(db_session)
    bill = _make_bill(db_session, user.id)
    bill_id = bill.id
    db_session.commit()

    # First call creates the instance for "2026-06"
    bill = db_session.get(BillTemplate, bill_id)
    first = generate_next_instance(db_session, bill, "2026-05")
    first_id = first.id

    # Second call must return the existing instance — no duplicate
    bill = db_session.get(BillTemplate, bill_id)
    second = generate_next_instance(db_session, bill, "2026-05")

    assert second.id == first_id
    count = (
        db_session.query(PaymentInstance)
        .filter_by(bill_id=bill_id, period="2026-06")
        .count()
    )
    assert count == 1


def test_generate_next_instance_copies_amount_and_due_date(db_session) -> None:
    user = _make_user(db_session)
    # due_day=31 in June clamps to 30
    bill = _make_bill(
        db_session,
        user.id,
        frequency=BillFrequency.monthly,
        due_day=31,
        amount=Decimal("150.00"),
    )
    bill_id = bill.id
    db_session.commit()

    bill = db_session.get(BillTemplate, bill_id)
    instance = generate_next_instance(db_session, bill, "2026-05")

    assert instance.amount == Decimal("150.00")
    assert instance.due_date == date(2026, 6, 30)  # June has 30 days


def test_generate_next_instance_integrity_error_fallback(
    db_session, db_sessionmaker
) -> None:
    """Race-condition path: concurrent insert causes IntegrityError → rollback → return winner.

    Simulated by: (1) mocking the pre-check query to return None (race window where
    our session checked before the winner committed), (2) mocking commit to raise
    IntegrityError, and (3) pre-committing the winner via a separate session so the
    fallback re-query finds it.
    """
    user = _make_user(db_session)
    bill = _make_bill(db_session, user.id, start_period="2026-05")
    bill_id = bill.id
    db_session.commit()

    # "Winner" session commits the next-period row first
    winner_session = db_sessionmaker()
    winner = PaymentInstance(
        bill_id=bill_id,
        period="2026-06",
        due_date=date(2026, 6, 15),
        amount=Decimal("100.00"),
        status=PaymentStatus.upcoming,
    )
    winner_session.add(winner)
    winner_session.commit()
    winner_id = winner.id
    winner_session.close()

    bill = db_session.get(BillTemplate, bill_id)

    # Simulate race window: pre-check sees nothing, commit then fails
    real_query = db_session.query
    pre_check_intercepted = [False]

    def mock_query(*models):
        # the pre-check lists the existing (period, slot) pairs
        if models[0] is PaymentInstance.period and not pre_check_intercepted[0]:
            pre_check_intercepted[0] = True
            stub = MagicMock()
            stub.filter.return_value = []
            return stub
        return real_query(*models)

    commit_raised = [False]

    def mock_commit():
        if not commit_raised[0]:
            commit_raised[0] = True
            raise SAIntegrityError("insert", {}, Exception("unique violation"))

    with (
        patch.object(db_session, "query", side_effect=mock_query),
        patch.object(db_session, "commit", side_effect=mock_commit),
    ):
        result = generate_next_instance(db_session, bill, "2026-05")

    assert result is not None
    assert result.id == winner_id


# ── ensure_current_period_instances ──────────────────────────────────────────


def test_ensure_creates_instance_for_active_template(db_session) -> None:
    user = _make_user(db_session)
    _make_bill(db_session, user.id, frequency=BillFrequency.monthly)
    user_id = user.id
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06", user_id)

    assert db_session.query(PaymentInstance).filter_by(period="2026-06").count() == 1


def test_ensure_survives_a_concurrent_request_seeding_the_same_period(
    db_session, db_sessionmaker, monkeypatch
) -> None:
    """Two requests seeding one month at once (two tabs, React strict-mode effects)
    race on uq_payment_instance_bill_period; the loser must not fail with a 500."""
    user = _make_user(db_session)
    bill = _make_bill(db_session, user.id, frequency=BillFrequency.monthly)
    user_id, bill_id = user.id, bill.id
    db_session.commit()

    real_commit = db_session.commit
    raced = []

    def commit_after_a_rival_insert():
        if not raced:  # the rival commits its row just before our first commit
            raced.append(True)
            rival = db_sessionmaker()
            rival.add(
                PaymentInstance(
                    bill_id=bill_id,
                    period="2026-06",
                    due_date=date(2026, 6, 15),
                    amount=Decimal("10"),
                    status=PaymentStatus.upcoming,
                )
            )
            rival.commit()
            rival.close()
        return real_commit()

    monkeypatch.setattr(db_session, "commit", commit_after_a_rival_insert)

    ensure_current_period_instances(db_session, "2026-06", user_id)  # must not raise

    assert raced
    assert db_session.query(PaymentInstance).filter_by(period="2026-06").count() == 1


def test_ensure_skips_archived_template(db_session) -> None:
    user = _make_user(db_session)
    _make_bill(db_session, user.id, frequency=BillFrequency.monthly, is_archived=True)
    user_id = user.id
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06", user_id)

    assert db_session.query(PaymentInstance).count() == 0


def test_ensure_skips_one_off_template(db_session) -> None:
    user = _make_user(db_session)
    _make_bill(db_session, user.id, frequency=BillFrequency.one_off)
    user_id = user.id
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06", user_id)

    assert db_session.query(PaymentInstance).count() == 0


def test_ensure_skips_inactive_period(db_session) -> None:
    user = _make_user(db_session)
    # Every 3 months from "2026-01": active in 2026-01, 2026-04, 2026-07 ...
    _make_bill(
        db_session,
        user.id,
        frequency=BillFrequency.monthly,
        interval=3,
        start_period="2026-01",
    )
    user_id = user.id
    db_session.commit()

    # "2026-02" is 1 month after anchor → not a quarterly cycle
    ensure_current_period_instances(db_session, "2026-02", user_id)

    assert db_session.query(PaymentInstance).count() == 0


def test_ensure_idempotent(db_session) -> None:
    user = _make_user(db_session)
    _make_bill(db_session, user.id, frequency=BillFrequency.monthly)
    user_id = user.id
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06", user_id)

    # Second call must not produce a duplicate
    ensure_current_period_instances(db_session, "2026-06", user_id)

    assert db_session.query(PaymentInstance).filter_by(period="2026-06").count() == 1


def test_ensure_respects_soft_delete_tombstone(db_session) -> None:
    """A soft-deleted instance (is_deleted=True) acts as a tombstone.

    ensure_current_period_instances must NOT re-generate the instance for
    the same (bill_id, period) — the existing-row check at recurrence.py:87
    fires regardless of is_deleted. lessons.md §4.
    """
    user = _make_user(db_session)
    bill = _make_bill(db_session, user.id, frequency=BillFrequency.monthly)
    _make_instance(db_session, bill.id, "2026-06", is_deleted=True)
    user_id = user.id
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-06", user_id)

    # Still exactly 1 row — the tombstone blocked re-creation
    assert db_session.query(PaymentInstance).filter_by(period="2026-06").count() == 1


def test_ensure_scoped_to_user(db_session) -> None:
    user_a = _make_user(db_session, "a@test.com")
    user_b = _make_user(db_session, "b@test.com")
    _make_bill(db_session, user_a.id, frequency=BillFrequency.monthly)
    _make_bill(db_session, user_b.id, frequency=BillFrequency.monthly)
    user_a_id = user_a.id
    user_b_id = user_b.id
    db_session.commit()

    # Seed only for user_a
    ensure_current_period_instances(db_session, "2026-06", user_a_id)

    a_count = (
        db_session.query(PaymentInstance)
        .join(BillTemplate)
        .filter(
            BillTemplate.user_id == user_a_id,
            PaymentInstance.period == "2026-06",
        )
        .count()
    )
    b_count = (
        db_session.query(PaymentInstance)
        .join(BillTemplate)
        .filter(
            BillTemplate.user_id == user_b_id,
            PaymentInstance.period == "2026-06",
        )
        .count()
    )
    assert a_count == 1
    assert b_count == 0


# ── backfill_template_instances ──────────────────────────────────────────────


def test_backfill_creates_instance_for_each_active_period(db_session) -> None:
    """Monthly bill with start_period 3 months back → 3 instances seeded."""
    user = _make_user(db_session)
    bill = _make_bill(
        db_session,
        user.id,
        frequency=BillFrequency.monthly,
        due_day=10,
        start_period="2026-01",
    )
    db_session.commit()

    backfill_template_instances(db_session, bill, "2026-01", "2026-03")

    count = db_session.query(PaymentInstance).filter_by(bill_id=bill.id).count()
    assert count == 3

    periods = {
        row.period
        for row in db_session.query(PaymentInstance).filter_by(bill_id=bill.id)
    }
    assert periods == {"2026-01", "2026-02", "2026-03"}


def test_backfill_is_idempotent(db_session) -> None:
    """Running backfill twice over the same range must not create duplicates."""
    user = _make_user(db_session)
    bill = _make_bill(
        db_session,
        user.id,
        frequency=BillFrequency.monthly,
        start_period="2026-01",
    )
    db_session.commit()

    backfill_template_instances(db_session, bill, "2026-01", "2026-03")
    backfill_template_instances(db_session, bill, "2026-01", "2026-03")

    assert db_session.query(PaymentInstance).filter_by(bill_id=bill.id).count() == 3


def test_backfill_skips_inactive_periods_for_quarterly(db_session) -> None:
    """Quarterly bill anchored at 2026-01 with range 2026-01..2026-06 → 2 instances."""
    user = _make_user(db_session)
    bill = _make_bill(
        db_session,
        user.id,
        frequency=BillFrequency.monthly,
        interval=3,
        start_period="2026-01",
    )
    db_session.commit()

    backfill_template_instances(db_session, bill, "2026-01", "2026-06")

    periods = {
        row.period
        for row in db_session.query(PaymentInstance).filter_by(bill_id=bill.id)
    }
    assert periods == {"2026-01", "2026-04"}


# ── end_period ───────────────────────────────────────────────────────────────


def test_end_period_stops_generation(db_session) -> None:
    user = _make_user(db_session, "end@test.com")
    bill = _make_bill(db_session, user.id, start_period="2026-01", end_period="2026-03")

    assert _bill_active_in_period(bill, "2026-03") is True
    assert _bill_active_in_period(bill, "2026-04") is False
    # last installment paid → nothing after it
    assert generate_next_instance(db_session, bill, "2026-03") is None
    assert generate_next_instance(db_session, bill, "2026-02").period == "2026-03"

    ensure_current_period_instances(db_session, "2026-04", user.id)
    backfill_template_instances(db_session, bill, "2026-01", "2026-06")
    periods = sorted(
        r.period for r in db_session.query(PaymentInstance).filter_by(bill_id=bill.id)
    )
    assert periods == ["2026-01", "2026-02", "2026-03"]


def test_end_period_quarterly_not_on_schedule(db_session) -> None:
    """End month between two quarterly occurrences: last payment is the last one before it."""
    user = _make_user(db_session, "endq@test.com")
    bill = _make_bill(
        db_session,
        user.id,
        frequency=BillFrequency.monthly,
        interval=3,
        start_period="2026-01",
        end_period="2026-11",
    )

    backfill_template_instances(db_session, bill, "2026-01", "2027-12")
    periods = sorted(
        r.period for r in db_session.query(PaymentInstance).filter_by(bill_id=bill.id)
    )
    assert periods == ["2026-01", "2026-04", "2026-07", "2026-10"]
    # paying the Oct instalment: next would be 2027-01 > end → nothing
    assert generate_next_instance(db_session, bill, "2026-10") is None
    # paying Jul: next (Oct) is still within the end
    assert generate_next_instance(db_session, bill, "2026-07").period == "2026-10"


def test_is_last_instance(db_session) -> None:
    from app.services.recurrence import is_last_instance

    user = _make_user(db_session, "last@test.com")
    open_ended = _make_bill(db_session, user.id)
    monthly = _make_bill(db_session, user.id, end_period="2026-03")
    quarterly = _make_bill(
        db_session,
        user.id,
        frequency=BillFrequency.monthly,
        interval=3,
        start_period="2026-01",
        end_period="2026-11",
    )
    assert is_last_instance(open_ended, "2026-03") is False
    assert is_last_instance(monthly, "2026-02") is False
    assert is_last_instance(monthly, "2026-03") is True
    assert is_last_instance(monthly, "2026-04") is False
    # quarterly: Oct is the last scheduled before the Nov end
    assert is_last_instance(quarterly, "2026-07") is False
    assert is_last_instance(quarterly, "2026-10") is True


def test_end_period_interval_4_not_on_schedule(db_session) -> None:
    """Every 4 months from 2026-01, end 2026-11: 01, 05, 09 — next (2027-01) is past end."""
    user = _make_user(db_session, "end4@test.com")
    bill = _make_bill(
        db_session,
        user.id,
        interval=4,
        start_period="2026-01",
        end_period="2026-11",
    )
    backfill_template_instances(db_session, bill, "2026-01", "2027-12")
    periods = sorted(
        r.period for r in db_session.query(PaymentInstance).filter_by(bill_id=bill.id)
    )
    assert periods == ["2026-01", "2026-05", "2026-09"]
    assert generate_next_instance(db_session, bill, "2026-09") is None
    assert generate_next_instance(db_session, bill, "2026-05").period == "2026-09"


# ── multi-day bills (slots) ──────────────────────────────────────────────────


def _multi_day_bill(db, user_id: int, days: list[int], **kwargs) -> BillTemplate:
    bill = _make_bill(db, user_id, due_day=days[0], **kwargs)
    bill.due_days = days
    db.commit()
    return bill


def _rows(db, bill_id: int, period: str) -> list[PaymentInstance]:
    return (
        db.query(PaymentInstance)
        .filter(PaymentInstance.bill_id == bill_id, PaymentInstance.period == period)
        .order_by(PaymentInstance.slot)
        .all()
    )


def test_seed_period_creates_one_instance_per_day(db_session) -> None:
    user = _make_user(db_session)
    bill = _multi_day_bill(db_session, user.id, [3, 10, 17], start_period="2026-05")

    ensure_current_period_instances(db_session, "2026-05", user.id)

    rows = _rows(db_session, bill.id, "2026-05")
    assert [(r.slot, r.due_date) for r in rows] == [
        (0, date(2026, 5, 3)),
        (1, date(2026, 5, 10)),
        (2, date(2026, 5, 17)),
    ]


def test_seed_period_is_idempotent_for_multi_day_bills(db_session) -> None:
    user = _make_user(db_session)
    bill = _multi_day_bill(db_session, user.id, [3, 10], start_period="2026-05")

    ensure_current_period_instances(db_session, "2026-05", user.id)
    ensure_current_period_instances(db_session, "2026-05", user.id)

    assert len(_rows(db_session, bill.id, "2026-05")) == 2


def test_seed_period_does_not_regenerate_a_deleted_slot(db_session) -> None:
    user = _make_user(db_session)
    bill = _multi_day_bill(db_session, user.id, [3, 10, 17], start_period="2026-05")
    ensure_current_period_instances(db_session, "2026-05", user.id)
    _rows(db_session, bill.id, "2026-05")[1].is_deleted = True
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-05", user.id)

    rows = _rows(db_session, bill.id, "2026-05")
    assert len(rows) == 3
    assert [r.is_deleted for r in rows] == [False, True, False]


def test_seed_period_fills_only_missing_slots(db_session) -> None:
    user = _make_user(db_session)
    bill = _multi_day_bill(db_session, user.id, [3, 10], start_period="2026-05")
    ensure_current_period_instances(db_session, "2026-05", user.id)
    bill.due_days = [3, 10, 20]
    db_session.commit()

    ensure_current_period_instances(db_session, "2026-05", user.id)

    assert [r.slot for r in _rows(db_session, bill.id, "2026-05")] == [0, 1, 2]


def test_multi_day_bill_follows_interval(db_session) -> None:
    user = _make_user(db_session)
    bill = _multi_day_bill(
        db_session, user.id, [5, 20], interval=2, start_period="2026-05"
    )

    ensure_current_period_instances(db_session, "2026-06", user.id)
    ensure_current_period_instances(db_session, "2026-07", user.id)

    assert _rows(db_session, bill.id, "2026-06") == []
    assert len(_rows(db_session, bill.id, "2026-07")) == 2


def test_multi_day_bill_clamps_days_to_month_end(db_session) -> None:
    user = _make_user(db_session)
    bill = _multi_day_bill(db_session, user.id, [15, 31], start_period="2026-01")

    ensure_current_period_instances(db_session, "2026-02", user.id)

    assert [r.due_date for r in _rows(db_session, bill.id, "2026-02")] == [
        date(2026, 2, 15),
        date(2026, 2, 28),
    ]


def test_backfill_creates_every_slot_for_every_period(db_session) -> None:
    user = _make_user(db_session)
    bill = _multi_day_bill(db_session, user.id, [3, 10], start_period="2026-01")

    backfill_template_instances(db_session, bill, "2026-01", "2026-03")
    backfill_template_instances(db_session, bill, "2026-01", "2026-03")

    total = (
        db_session.query(PaymentInstance)
        .filter(PaymentInstance.bill_id == bill.id)
        .count()
    )
    assert total == 6


def test_generate_next_instance_creates_all_days_of_next_period(db_session) -> None:
    user = _make_user(db_session)
    bill = _multi_day_bill(db_session, user.id, [3, 10, 17], start_period="2026-05")

    first = generate_next_instance(db_session, bill, "2026-05")
    again = generate_next_instance(db_session, bill, "2026-05")

    assert first is not None and first.slot == 0
    assert again is not None and again.id == first.id
    assert len(_rows(db_session, bill.id, "2026-06")) == 3
