"""The reminder scheduler works in each user's own time zone: send time, 'today' for
the reminder windows, the monthly-summary day and month."""

from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.models.bill import PaymentInstance, PaymentStatus
from app.models.user import User
from app.services.reminder_job import (
    send_catchup_reminders,
    send_daily_reminders,
    send_monthly_summary_for_user,
    send_reminders_for_user,
)
from tests.test_reminder_job import (
    _make_bill,
    _make_instance,
    _make_user,
    _smtp_settings,
)


def _utc(*args) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


@pytest.fixture()
def mail():
    """Email delivery mocked (reminders, summaries) with SMTP 'configured'."""
    with (
        patch("app.services.reminder_job.settings") as mock_settings,
        patch("app.services.reminder_job.send_reminder_email") as reminder,
        patch("app.services.reminder_job.send_monthly_summary_email") as summary,
    ):
        _smtp_settings(mock_settings)
        yield reminder, summary


def _user(db, email, zone, *, send_minute=480, **flags) -> User:
    user = _make_user(db, email, reminder_send_minute=send_minute, **flags)
    user.timezone = zone
    return user


def _due(db, user, due: date) -> PaymentInstance:
    inst = _make_instance(db, _make_bill(db, user.id).id, due)
    db.commit()
    return inst


def _tick(sessions, moment: datetime, *, catchup=False) -> None:
    run = send_catchup_reminders if catchup else send_daily_reminders
    with patch("app.core.tz._utcnow", return_value=moment):
        run(sessions)


def _recipients(mock) -> list[str]:
    return [c.kwargs["to_addr"] for c in mock.call_args_list]


# ---------------------------------------------------------------------------
# Send time is local time of day
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "month,day,sends_at_utc_hour",
    [
        (7, 15, 6),  # summer: Warsaw is UTC+2, so 08:00 local = 06:00 UTC
        (1, 15, 7),  # winter: UTC+1, so 08:00 local = 07:00 UTC
    ],
)
def test_send_time_is_local_and_follows_daylight_saving(
    db_session, db_sessionmaker, mail, month, day, sends_at_utc_hour
):
    reminder, _ = mail
    user = _user(db_session, "w@test.com", "Europe/Warsaw", notify_on_day=True)
    _due(db_session, user, date(2026, month, day))

    _tick(db_sessionmaker, _utc(2026, month, day, sends_at_utc_hour - 1, 30))
    assert reminder.call_count == 0  # 07:30 local: too early

    _tick(db_sessionmaker, _utc(2026, month, day, sends_at_utc_hour, 0))
    assert reminder.call_count == 1  # 08:00 local
    assert reminder.call_args.kwargs["kind"] == "on_day"


def test_send_time_across_the_spring_forward_change(db_session, db_sessionmaker, mail):
    reminder, _ = mail
    # Warsaw clocks go 02:00 -> 03:00 on 29 March 2026: 08:00 local is 06:00 UTC that day
    user = _user(db_session, "dst@test.com", "Europe/Warsaw", notify_on_day=True)
    _due(db_session, user, date(2026, 3, 29))

    _tick(
        db_sessionmaker, _utc(2026, 3, 29, 5, 0)
    )  # 07:00 CEST? no: 06:00 CET -> early
    assert reminder.call_count == 0
    _tick(db_sessionmaker, _utc(2026, 3, 29, 6, 0))
    assert reminder.call_count == 1


def test_a_reminder_is_not_sent_twice_for_the_same_window(
    db_session, db_sessionmaker, mail
):
    reminder, _ = mail
    user = _user(db_session, "once@test.com", "Europe/Warsaw", notify_on_day=True)
    _due(db_session, user, date(2026, 7, 15))

    for moment in (
        _utc(2026, 7, 15, 6, 0),
        _utc(2026, 7, 15, 6, 0),  # same tick re-run
        _utc(2026, 7, 15, 6, 30),  # later tick: window passed, and flagged
    ):
        _tick(db_sessionmaker, moment)
    assert reminder.call_count == 1


def test_quarter_hour_offset_zone_is_reached_on_its_minute(
    db_session, db_sessionmaker, mail
):
    reminder, _ = mail
    # Kathmandu is UTC+5:45: 08:00 local is 02:15 UTC, a :15 tick
    user = _user(db_session, "np@test.com", "Asia/Kathmandu", notify_on_day=True)
    _due(db_session, user, date(2026, 7, 15))

    _tick(db_sessionmaker, _utc(2026, 7, 15, 2, 0))  # 07:45 local
    assert reminder.call_count == 0
    _tick(db_sessionmaker, _utc(2026, 7, 15, 2, 15))  # 08:00 local
    assert reminder.call_count == 1


# ---------------------------------------------------------------------------
# "Today" for the reminder windows is the user's calendar day
# ---------------------------------------------------------------------------


def test_two_users_in_different_zones_on_the_same_tick(
    db_session, db_sessionmaker, mail
):
    reminder, _ = mail
    # Tick: 19:00 UTC on 10 March = 08:00 on 11 March in Auckland (UTC+13), 19:00 UTC
    utc_user = _user(db_session, "u@test.com", "UTC", notify_on_day=True)
    nz_user = _user(db_session, "nz@test.com", "Pacific/Auckland", notify_on_day=True)
    _due(db_session, utc_user, date(2026, 3, 10))
    _due(db_session, nz_user, date(2026, 3, 11))

    _tick(db_sessionmaker, _utc(2026, 3, 10, 19, 0))
    assert _recipients(reminder) == ["nz@test.com"]

    _tick(db_sessionmaker, _utc(2026, 3, 10, 8, 0))  # 08:00 UTC: the UTC user's turn
    assert sorted(_recipients(reminder)) == ["nz@test.com", "u@test.com"]


def test_one_day_before_window_uses_the_users_tomorrow(
    db_session, db_sessionmaker, mail
):
    reminder, _ = mail
    user = _user(
        db_session,
        "tom@test.com",
        "Pacific/Auckland",
        notify_1_day_before=True,
        notify_on_day=False,
    )
    # at the tick it is 11 March in Auckland, so "tomorrow" is the 12th
    _due(db_session, user, date(2026, 3, 12))
    _tick(db_sessionmaker, _utc(2026, 3, 10, 19, 0))
    assert reminder.call_count == 1
    assert reminder.call_args.kwargs["kind"] == "upcoming"


def test_send_now_uses_the_users_today(db_session, mail):
    reminder, _ = mail
    user = _user(db_session, "now@test.com", "Pacific/Auckland", notify_on_day=True)
    _due(db_session, user, date(2026, 3, 11))
    with patch("app.core.tz._utcnow", return_value=_utc(2026, 3, 10, 23, 30)):
        sent = send_reminders_for_user(db_session, user, force=True)
    assert sent == 1  # 23:30 UTC on the 10th is already the 11th there


# ---------------------------------------------------------------------------
# Catch-up after a restart
# ---------------------------------------------------------------------------


def test_catchup_compares_with_the_local_time_of_day(db_session, db_sessionmaker, mail):
    reminder, _ = mail
    user = _user(db_session, "cu@test.com", "Europe/Warsaw", notify_on_day=True)
    _due(db_session, user, date(2026, 7, 15))

    _tick(db_sessionmaker, _utc(2026, 7, 15, 5, 0), catchup=True)  # 07:00 local
    assert reminder.call_count == 0
    _tick(db_sessionmaker, _utc(2026, 7, 15, 9, 0), catchup=True)  # 11:00 local
    assert reminder.call_count == 1


# ---------------------------------------------------------------------------
# Monthly summary: the user's last day and month
# ---------------------------------------------------------------------------


def _summary_user(db, email, zone) -> User:
    user = _user(db, email, zone)
    user.monthly_summary_enabled = True
    user.monthly_summary_last_sent = None
    db.commit()
    return user


def test_summary_goes_out_on_the_users_last_day(db_session, db_sessionmaker, mail):
    _, summary = mail
    _summary_user(db_session, "nz@test.com", "Pacific/Auckland")
    _summary_user(db_session, "utc@test.com", "UTC")

    # 30 March 11:30 UTC = 31 March 00:30 in Auckland (its last day), still the 30th UTC
    _tick(db_sessionmaker, _utc(2026, 3, 30, 11, 30))
    assert _recipients(summary) == ["nz@test.com"]

    # 1 April 00:30 Auckland is no longer the last day
    summary.reset_mock()
    _tick(db_sessionmaker, _utc(2026, 3, 31, 11, 30))
    assert _recipients(summary) == ["utc@test.com"]


def test_summary_month_is_the_users_month(db_session, db_sessionmaker, mail):
    _, summary = mail
    user = _summary_user(db_session, "la@test.com", "America/Los_Angeles")
    user_id = user.id
    db_session.rollback()  # SQLite: an open session transaction holds the write lock

    # 1 April 03:30 UTC is still 31 March (20:30) in Los Angeles
    _tick(db_sessionmaker, _utc(2026, 4, 1, 3, 30))
    assert summary.call_count == 1
    db_session.rollback()  # ends the SQLite read snapshot, so the get below reloads
    assert db_session.get(User, user_id).monthly_summary_last_sent == "2026-03"
    db_session.rollback()  # SQLite: an open session transaction holds the write lock

    summary.reset_mock()
    _tick(db_sessionmaker, _utc(2026, 4, 1, 4, 0))  # once per month
    assert summary.call_count == 0


def test_summary_shows_the_paid_date_in_the_users_zone(db_session, mail):
    _, summary = mail
    user = _summary_user(db_session, "pd@test.com", "Pacific/Auckland")
    inst = _due(db_session, user, date(2026, 3, 20))
    inst.status = PaymentStatus.paid
    inst.paid_amount = Decimal("99.99")
    inst.paid_at = _utc(2026, 3, 10, 23, 30)  # 11 March 12:30 in Auckland
    db_session.commit()

    assert send_monthly_summary_for_user(db_session, user, "2026-03") is True
    [row] = summary.call_args.kwargs["paid_rows"]
    assert row["paid_at"].date().isoformat() == "2026-03-11"
