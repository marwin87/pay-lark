"""Unit tests for app/services/reminder_job.py."""

from app.services.notify import NotificationError
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


import app.models.bill  # noqa: F401 — register models
import app.models.category  # noqa: F401
import app.models.user  # noqa: F401
from app.models.bill import (
    BillFrequency,
    BillStatus,
    BillTemplate,
    PaymentInstance,
    PaymentStatus,
)
from app.models.category import Category
from app.models.user import User
from app.services.categories import seed_default_categories
from app.services.reminder_job import (
    send_catchup_reminders,
    send_daily_reminders,
    send_monthly_summary_for_user,
    send_reminders_for_user,
)


def _make_user(
    db,
    email="u@test.com",
    notify_2_days_before=False,
    notify_1_day_before=True,
    notify_on_day=False,
    notify_1_day_after=False,
    reminder_send_minute=480,
) -> User:
    user = User(
        email=email,
        password_hash="x",
        is_active=True,
        email_reminders_enabled=True,
        notify_2_days_before=notify_2_days_before,
        notify_1_day_before=notify_1_day_before,
        notify_on_day=notify_on_day,
        notify_1_day_after=notify_1_day_after,
        reminder_send_minute=reminder_send_minute,
    )
    db.add(user)
    db.flush()
    seed_default_categories(db, user.id)
    return user


def _default_category_id(db, user_id: int, slug: str = "utilities") -> int:
    return (
        db.query(Category.id)
        .filter(Category.user_id == user_id, Category.slug == slug)
        .scalar()
    )


def _make_bill(db, user_id: int) -> BillTemplate:
    bill = BillTemplate(
        status=BillStatus.active,
        name="Internet",
        frequency=BillFrequency.monthly,
        amount=Decimal("99.99"),
        currency="PLN",
        category_id=_default_category_id(db, user_id),
        user_id=user_id,
    )
    db.add(bill)
    db.flush()
    return bill


def _make_instance(db, bill_id: int, due_date: date, **kwargs) -> PaymentInstance:
    inst = PaymentInstance(
        bill_id=bill_id,
        period=due_date.strftime("%Y-%m"),
        due_date=due_date,
        amount=Decimal("99.99"),
        status=PaymentStatus.upcoming,
        **kwargs,
    )
    db.add(inst)
    db.flush()
    return inst


def _smtp_settings(mock_settings):
    mock_settings.smtp_host = "smtp.test"
    mock_settings.smtp_port = 587
    mock_settings.smtp_user = None
    mock_settings.smtp_password = None
    mock_settings.reminder_from = "r@test.com"
    mock_settings.email_blocked_domains = []


# ---------------------------------------------------------------------------


@patch("app.services.reminder_job.settings")
@patch("app.services.reminder_job.send_reminder_email")
def test_no_smtp_skips_all(mock_send, mock_settings, db_sessionmaker):
    mock_settings.smtp_host = None

    send_daily_reminders(db_sessionmaker)

    mock_send.assert_not_called()


@patch("app.services.reminder_job.send_monthly_summary_email")
@patch("app.services.reminder_job.send_reminder_email")
def test_upcoming_instance_sends_and_flips_flag(
    mock_send, _mock_summary, db_session, db_sessionmaker
):
    today = _today_utc()
    user = _make_user(db_session, notify_1_day_before=True)
    bill = _make_bill(db_session, user.id)
    inst = _make_instance(db_session, bill.id, due_date=today + timedelta(days=1))
    inst_id = inst.id
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        send_daily_reminders(db_sessionmaker, send_minute=480)

    mock_send.assert_called_once()
    call_kwargs = mock_send.call_args.kwargs
    assert call_kwargs["kind"] == "upcoming"

    db_session.expire_all()
    refreshed = db_session.get(PaymentInstance, inst_id)
    assert refreshed.reminder_sent_upcoming is True
    assert refreshed.reminder_sent_overdue is False


@patch("app.services.reminder_job.send_monthly_summary_email")
@patch("app.services.reminder_job.send_reminder_email")
def test_1_day_after_instance_sends_and_flips_flag(
    mock_send, _mock_summary, db_session, db_sessionmaker
):
    today = _today_utc()
    user = _make_user(db_session, notify_1_day_before=False, notify_1_day_after=True)
    bill = _make_bill(db_session, user.id)
    inst = _make_instance(db_session, bill.id, due_date=today - timedelta(days=1))
    inst_id = inst.id
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        send_daily_reminders(db_sessionmaker, send_minute=480)

    mock_send.assert_called_once()
    call_kwargs = mock_send.call_args.kwargs
    assert call_kwargs["kind"] == "1_day_after"

    db_session.expire_all()
    refreshed = db_session.get(PaymentInstance, inst_id)
    assert refreshed.reminder_sent_overdue is True
    assert refreshed.reminder_sent_upcoming is False


@patch("app.services.reminder_job.send_monthly_summary_email")
@patch("app.services.reminder_job.send_reminder_email")
def test_2_days_before_instance_sends_and_flips_flag(
    mock_send, _mock_summary, db_session, db_sessionmaker
):
    today = _today_utc()
    user = _make_user(db_session, notify_1_day_before=False, notify_2_days_before=True)
    bill = _make_bill(db_session, user.id)
    inst = _make_instance(db_session, bill.id, due_date=today + timedelta(days=2))
    inst_id = inst.id
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        send_daily_reminders(db_sessionmaker, send_minute=480)

    mock_send.assert_called_once()
    call_kwargs = mock_send.call_args.kwargs
    assert call_kwargs["kind"] == "2_days_before"

    db_session.expire_all()
    refreshed = db_session.get(PaymentInstance, inst_id)
    assert refreshed.reminder_sent_2_days_before is True


@patch("app.services.reminder_job.send_monthly_summary_email")
@patch("app.services.reminder_job.send_reminder_email")
def test_on_day_instance_sends_and_flips_flag(
    mock_send, _mock_summary, db_session, db_sessionmaker
):
    today = _today_utc()
    user = _make_user(db_session, notify_1_day_before=False, notify_on_day=True)
    bill = _make_bill(db_session, user.id)
    inst = _make_instance(db_session, bill.id, due_date=today)
    inst_id = inst.id
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        send_daily_reminders(db_sessionmaker, send_minute=480)

    mock_send.assert_called_once()
    call_kwargs = mock_send.call_args.kwargs
    assert call_kwargs["kind"] == "on_day"

    db_session.expire_all()
    refreshed = db_session.get(PaymentInstance, inst_id)
    assert refreshed.reminder_sent_on_day is True


@patch("app.services.reminder_job.send_monthly_summary_email")
@patch("app.services.reminder_job.send_reminder_email")
def test_already_sent_flag_skips_email(
    mock_send, _mock_summary, db_session, db_sessionmaker
):
    today = _today_utc()
    user = _make_user(db_session, notify_1_day_before=True)
    bill = _make_bill(db_session, user.id)
    _make_instance(
        db_session,
        bill.id,
        due_date=today + timedelta(days=1),
        reminder_sent_upcoming=True,
    )
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        send_daily_reminders(db_sessionmaker, send_minute=480)

    mock_send.assert_not_called()


@patch("app.services.reminder_job.send_reminder_email")
def test_force_resends_already_sent_reminder(mock_send, db_session):
    user = _make_user(db_session, notify_1_day_before=True)
    bill = _make_bill(db_session, user.id)
    _make_instance(
        db_session,
        bill.id,
        due_date=_today_utc() + timedelta(days=1),
        reminder_sent_upcoming=True,
    )
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        assert send_reminders_for_user(db_session, user) == 0
        assert send_reminders_for_user(db_session, user, force=True) == 1
        assert send_reminders_for_user(db_session, user, force=True) == 1
    assert mock_send.call_count == 2


@patch("app.services.reminder_job.send_reminder_email")
def test_force_does_not_record_send(mock_send, db_session):
    user = _make_user(db_session, notify_1_day_before=True)
    bill = _make_bill(db_session, user.id)
    inst = _make_instance(
        db_session, bill.id, due_date=_today_utc() + timedelta(days=1)
    )
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        assert send_reminders_for_user(db_session, user, force=True) == 1

    db_session.refresh(inst)
    assert inst.reminder_sent_upcoming is False
    assert inst.email_sent_at is None


@patch("app.services.reminder_job.send_monthly_summary_email")
@patch("app.services.reminder_job.send_reminder_email")
def test_opt_out_user_skips_email(
    mock_send, _mock_summary, db_session, db_sessionmaker
):
    today = _today_utc()
    user = _make_user(
        db_session,
        notify_2_days_before=False,
        notify_1_day_before=False,
        notify_on_day=False,
        notify_1_day_after=False,
    )
    bill = _make_bill(db_session, user.id)
    _make_instance(db_session, bill.id, due_date=today + timedelta(days=1))
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        send_daily_reminders(db_sessionmaker, send_minute=480)

    mock_send.assert_not_called()


@patch("app.services.reminder_job.send_monthly_summary_email")
@patch("app.services.reminder_job.send_reminder_email")
def test_smtp_exception_does_not_flip_flag(
    mock_send, _mock_summary, db_session, db_sessionmaker
):
    mock_send.side_effect = NotificationError("connection refused")

    today = _today_utc()
    user = _make_user(db_session, notify_1_day_before=True)
    bill = _make_bill(db_session, user.id)
    inst = _make_instance(db_session, bill.id, due_date=today + timedelta(days=1))
    inst_id = inst.id
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        send_daily_reminders(db_sessionmaker, send_minute=480)

    mock_send.assert_called_once()

    db_session.expire_all()
    refreshed = db_session.get(PaymentInstance, inst_id)
    assert refreshed.reminder_sent_upcoming is False
    assert refreshed.reminder_sent_overdue is False


# ---------------------------------------------------------------------------
# Monthly summary service tests
# ---------------------------------------------------------------------------


def _make_paid_instance(db, bill_id: int, due_date: date, **kwargs) -> PaymentInstance:
    from datetime import datetime, timezone

    inst = PaymentInstance(
        bill_id=bill_id,
        period=due_date.strftime("%Y-%m"),
        due_date=due_date,
        amount=Decimal("99.99"),
        paid_amount=Decimal("99.99"),
        status=PaymentStatus.paid,
        paid_at=datetime.now(timezone.utc),
        **kwargs,
    )
    db.add(inst)
    db.flush()
    return inst


def _make_bill_named(db, user_id: int, name: str) -> BillTemplate:
    bill = BillTemplate(
        status=BillStatus.active,
        name=name,
        frequency=BillFrequency.monthly,
        amount=Decimal("99.99"),
        currency="PLN",
        category_id=_default_category_id(db, user_id),
        user_id=user_id,
    )
    db.add(bill)
    db.flush()
    return bill


@patch("app.services.reminder_job.send_monthly_summary_email")
def test_monthly_summary_splits_paid_and_unpaid(mock_send, db_session):
    today = _today_utc()
    user = _make_user(db_session)
    paid_bill = _make_bill_named(db_session, user.id, "Internet")
    unpaid_bill = _make_bill_named(db_session, user.id, "Netflix")
    _make_paid_instance(db_session, paid_bill.id, due_date=today.replace(day=1))
    _make_instance(db_session, unpaid_bill.id, due_date=today.replace(day=5))
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        result = send_monthly_summary_for_user(
            db_session, user, today.strftime("%Y-%m")
        )

    assert result is True
    mock_send.assert_called_once()
    kwargs = mock_send.call_args.kwargs
    assert len(kwargs["paid_rows"]) == 1
    assert len(kwargs["unpaid_rows"]) == 1
    assert kwargs["paid_rows"][0]["name"] == "Internet"
    assert kwargs["unpaid_rows"][0]["name"] == "Netflix"


def test_monthly_summary_returns_false_when_smtp_not_configured(db_session):
    user = _make_user(db_session)
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        mock_settings.smtp_host = None
        result = send_monthly_summary_for_user(db_session, user, "2026-06")

    assert result is False


@patch("app.services.reminder_job.send_monthly_summary_email")
def test_monthly_summary_returns_false_on_smtp_error(mock_send, db_session):
    mock_send.side_effect = NotificationError("connection refused")

    today = _today_utc()
    user = _make_user(db_session)
    bill = _make_bill(db_session, user.id)
    _make_instance(db_session, bill.id, due_date=today)
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        result = send_monthly_summary_for_user(
            db_session, user, today.strftime("%Y-%m")
        )

    assert result is False


@patch("app.services.reminder_job.send_monthly_summary_email")
def test_monthly_summary_idempotency_via_last_sent_flag(
    mock_send, db_session, db_sessionmaker
):
    """Scheduler skips user whose monthly_summary_last_sent matches current month."""
    import calendar
    from datetime import datetime, timezone

    today = _today_utc()
    current_month = today.strftime("%Y-%m")

    user = _make_user(db_session)
    # Pre-set the flag as if the summary was already sent this month
    user.monthly_summary_enabled = True
    user.monthly_summary_last_sent = current_month
    db_session.commit()

    # Simulate last day of month
    last_day = calendar.monthrange(today.year, today.month)[1]
    fake_today = today.replace(day=last_day)

    with (
        patch("app.services.reminder_job.settings") as mock_settings,
        patch(
            "app.core.tz._utcnow",
            return_value=datetime(
                fake_today.year,
                fake_today.month,
                fake_today.day,
                8,
                0,
                tzinfo=timezone.utc,
            ),
        ),
    ):
        _smtp_settings(mock_settings)
        send_daily_reminders(db_sessionmaker, send_minute=480)

    mock_send.assert_not_called()


@patch("app.services.reminder_job.send_monthly_summary_email")
def test_monthly_summary_sent_and_flag_updated_on_last_day(
    mock_send, db_session, db_sessionmaker
):
    """Scheduler sends summary and sets flag when last_sent is None."""
    import calendar
    from datetime import datetime, timezone

    today = _today_utc()
    last_day = calendar.monthrange(today.year, today.month)[1]
    fake_today = today.replace(day=last_day)

    user = _make_user(db_session)
    user.monthly_summary_enabled = True
    user.monthly_summary_last_sent = None
    bill = _make_bill(db_session, user.id)
    _make_instance(db_session, bill.id, due_date=fake_today)
    db_session.commit()
    user_id = user.id
    db_session.rollback()  # SQLite: an open session transaction holds the write lock

    with (
        patch("app.services.reminder_job.settings") as mock_settings,
        patch(
            "app.core.tz._utcnow",
            return_value=datetime(
                fake_today.year,
                fake_today.month,
                fake_today.day,
                8,
                0,
                tzinfo=timezone.utc,
            ),
        ),
    ):
        _smtp_settings(mock_settings)
        send_daily_reminders(db_sessionmaker, send_minute=480)

    mock_send.assert_called_once()
    db_session.commit()  # ends the SQLite read snapshot, then reloads
    refreshed_user = db_session.get(User, user_id)
    assert refreshed_user.monthly_summary_last_sent == fake_today.strftime("%Y-%m")


# ---------------------------------------------------------------------------
# Master toggle: email_reminders_enabled=False must block all sends
# ---------------------------------------------------------------------------


@patch("app.services.reminder_job.send_reminder_email")
def test_master_toggle_off_skips_daily_reminder(mock_send, db_session, db_sessionmaker):
    """Scheduler sends nothing when email_reminders_enabled is False."""
    today = _today_utc()
    user = _make_user(db_session, notify_1_day_before=True)
    user.email_reminders_enabled = False
    bill = _make_bill(db_session, user.id)
    _make_instance(db_session, bill.id, due_date=today + timedelta(days=1))
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        send_daily_reminders(db_sessionmaker, send_minute=480)

    mock_send.assert_not_called()


@patch("app.services.reminder_job.send_reminder_email")
def test_master_toggle_off_skips_catchup_reminder(
    mock_send, db_session, db_sessionmaker
):
    """Catch-up reminders on startup also respect email_reminders_enabled=False."""
    today = _today_utc()
    user = _make_user(db_session, notify_1_day_before=True, reminder_send_minute=0)
    user.email_reminders_enabled = False
    bill = _make_bill(db_session, user.id)
    _make_instance(db_session, bill.id, due_date=today + timedelta(days=1))
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        # current_minute=480 covers all users whose send_minute <= 480
        send_catchup_reminders(db_sessionmaker, send_minute=480)

    mock_send.assert_not_called()


@patch("app.services.reminder_job.send_monthly_summary_email")
def test_master_toggle_off_skips_monthly_summary_scheduler(
    mock_send, db_session, db_sessionmaker
):
    """Monthly summary scheduler respects email_reminders_enabled=False."""
    import calendar
    from datetime import datetime, timezone

    today = _today_utc()
    last_day = calendar.monthrange(today.year, today.month)[1]
    fake_today = today.replace(day=last_day)

    user = _make_user(db_session)
    user.email_reminders_enabled = False
    user.monthly_summary_enabled = True
    user.monthly_summary_last_sent = None
    bill = _make_bill(db_session, user.id)
    _make_instance(db_session, bill.id, due_date=fake_today)
    db_session.commit()

    with (
        patch("app.services.reminder_job.settings") as mock_settings,
        patch(
            "app.core.tz._utcnow",
            return_value=datetime(
                fake_today.year,
                fake_today.month,
                fake_today.day,
                8,
                0,
                tzinfo=timezone.utc,
            ),
        ),
    ):
        _smtp_settings(mock_settings)
        send_daily_reminders(db_sessionmaker, send_minute=480)

    mock_send.assert_not_called()


@patch("app.services.reminder_job.send_monthly_summary_email")
@patch("app.services.reminder_job.send_reminder_email")
def test_reminder_uses_per_payment_amount_override(
    mock_send, _mock_summary, db_session, db_sessionmaker
):
    """A payment with its own amount must be announced with that amount, not the bill's."""
    user = _make_user(db_session, notify_1_day_before=True)
    bill = _make_bill(db_session, user.id)  # template amount 99.99
    _make_instance(
        db_session,
        bill.id,
        due_date=_today_utc() + timedelta(days=1),
        amount_override=Decimal("143.20"),
    )
    db_session.commit()

    with patch("app.services.reminder_job.settings") as mock_settings:
        _smtp_settings(mock_settings)
        send_daily_reminders(db_sessionmaker, send_minute=480)

    mock_send.assert_called_once()
    assert mock_send.call_args.kwargs["amount"] == Decimal("143.20")
