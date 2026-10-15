import calendar
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import or_, true
from sqlalchemy.orm import Session, selectinload, sessionmaker

from app.core.config import settings
from app.core.i18n import t
from app.core import tz
from app.core.tz import user_tz
from app.models.bill import BillStatus, BillTemplate, PaymentInstance, PaymentStatus
from app.models.user import User
from app.services.email import (
    send_monthly_summary_email,
    send_reminder_email,
    send_reminder_telegram,
    send_summary_telegram,
)
from app.services.notify import NotificationError, telegram_url

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Channel:
    """Names of the User/PaymentInstance columns that hold one channel's own
    schedule. Email and Telegram are configured and tracked independently."""

    name: str
    enabled: str
    send_minute: str
    windows: tuple[tuple[str, str, str], ...]  # (kind, user flag, instance sent-flag)
    summary_enabled: str
    summary_last_sent: str


EMAIL = Channel(
    "email",
    "email_reminders_enabled",
    "reminder_send_minute",
    (
        ("2_days_before", "notify_2_days_before", "reminder_sent_2_days_before"),
        ("upcoming", "notify_1_day_before", "reminder_sent_upcoming"),
        ("on_day", "notify_on_day", "reminder_sent_on_day"),
        ("1_day_after", "notify_1_day_after", "reminder_sent_overdue"),
    ),
    "monthly_summary_enabled",
    "monthly_summary_last_sent",
)
TELEGRAM = Channel(
    "telegram",
    "telegram_reminders_enabled",
    "telegram_send_minute",
    (
        (
            "2_days_before",
            "telegram_notify_2_days_before",
            "telegram_sent_2_days_before",
        ),
        ("upcoming", "telegram_notify_1_day_before", "telegram_sent_upcoming"),
        ("on_day", "telegram_notify_on_day", "telegram_sent_on_day"),
        ("1_day_after", "telegram_notify_1_day_after", "telegram_sent_overdue"),
    ),
    "telegram_monthly_summary_enabled",
    "telegram_monthly_summary_last_sent",
)
CHANNELS = (EMAIL, TELEGRAM)


def channel_available(user: User, channel: Channel) -> bool:
    """Can this user receive on the channel at all (server + credentials set up)?"""
    if channel is TELEGRAM:
        return telegram_url(user) is not None
    return settings.smtp_host is not None and not _is_blocked_domain(user.email)


def _is_blocked_domain(email: str) -> bool:
    domain = email.split("@")[-1].lower()
    return domain in {d.lower() for d in settings.email_blocked_domains}


def _month_label(month: str, lang: str) -> str:
    """Return a human-readable month label, e.g. 'June 2026'."""
    year, m = month.split("-")
    return t(lang, "Notifications.monthYear").format(
        month=t(lang, f"Notifications.monthLong.{int(m)}"), year=year
    )


def send_monthly_summary_for_user(
    db: Session,
    user: User,
    month: str,
    channel: Channel = EMAIL,
    to_addr: str | None = None,
) -> bool:
    """Send the monthly summary on one channel. Returns True on success.

    ``to_addr`` redirects an email summary to another recipient (share feature).
    """
    if not channel_available(user, channel):
        return False
    if to_addr and _is_blocked_domain(to_addr):
        return False
    lang = user.language_preference or "en"
    instances = (
        db.query(PaymentInstance)
        .options(selectinload(PaymentInstance.template))
        .join(BillTemplate, PaymentInstance.bill_id == BillTemplate.id)
        .filter(
            BillTemplate.user_id == user.id,
            PaymentInstance.period == month,
            PaymentInstance.hidden.is_(None),
        )
        .all()
    )

    paid_rows = []
    unpaid_rows = []
    for inst in instances:
        name = inst.template.name if inst.template else f"bill#{inst.bill_id}"
        currency = inst.template.currency if inst.template else "PLN"
        due_date = inst.due_date.isoformat() if inst.due_date else ""
        if inst.status == PaymentStatus.paid:
            paid_rows.append(
                {
                    "name": name,
                    "due_date": due_date,
                    "amount": inst.amount,
                    "paid_amount": inst.paid_amount,
                    "currency": currency,
                    # the user's local date, not the UTC date of the instant
                    "paid_at": (
                        inst.paid_at.astimezone(user_tz(user)) if inst.paid_at else None
                    ),
                }
            )
        else:
            unpaid_rows.append(
                {
                    "name": name,
                    "due_date": due_date,
                    "amount": inst.current_amount if inst.template else inst.amount,
                    "currency": currency,
                }
            )

    month_label = _month_label(month, lang)
    try:
        if channel is TELEGRAM:
            url = telegram_url(user)
            assert url is not None
            send_summary_telegram(
                url=url,
                month_label=month_label,
                paid_rows=paid_rows,
                unpaid_rows=unpaid_rows,
                language=lang,
            )
        else:
            assert settings.smtp_host is not None
            send_monthly_summary_email(
                smtp_host=settings.smtp_host,
                smtp_port=settings.smtp_port,
                smtp_user=settings.smtp_user,
                smtp_password=(
                    settings.smtp_password.get_secret_value()
                    if settings.smtp_password
                    else None
                ),
                smtp_use_tls=settings.smtp_use_tls,
                from_addr=settings.reminder_from or settings.smtp_user or "",
                to_addr=to_addr or user.email,
                month_label=month_label,
                paid_rows=paid_rows,
                unpaid_rows=unpaid_rows,
                language=lang,
            )
        logger.info(
            "Sent %s monthly summary to user %s for %s", channel.name, user.id, month
        )
        return True
    except NotificationError as exc:
        logger.error(
            "Failed to send %s monthly summary to user %s for %s: %s",
            channel.name,
            user.id,
            month,
            exc,
        )
        return False


def send_reminders_for_user(
    db: Session,
    user: User,
    channel: Channel = EMAIL,
    *,
    force: bool = False,
    now_utc: datetime | None = None,
) -> int:
    """Send due reminders on one channel. Returns count of reminders sent.

    "Today" is the user's own calendar day (their time zone), so a payment due on
    the 10th is "on the day" for them on the 10th wherever the server runs.

    force=True (manual "send now") is ad hoc: it ignores the already-sent flags
    and records nothing, so it never affects the scheduler or the payment icons.
    """
    if not channel_available(user, channel):
        logger.debug("No %s delivery for user %s, skipping", channel.name, user.id)
        return 0
    today = (now_utc or tz._utcnow()).astimezone(user_tz(user)).date()
    due_by_kind = {
        "2_days_before": today + timedelta(days=2),
        "upcoming": today + timedelta(days=1),
        "on_day": today,
        "1_day_after": today - timedelta(days=1),
    }

    template_ids = [
        t.id
        for t in db.query(BillTemplate.id)
        .filter(
            BillTemplate.user_id == user.id,
            BillTemplate.status == BillStatus.active,
        )
        .all()
    ]
    if not template_ids:
        return 0

    lang = user.language_preference or "en"
    sent = 0
    for kind, user_flag, sent_flag in channel.windows:
        if not getattr(user, user_flag):
            continue
        instances = (
            db.query(PaymentInstance)
            .options(selectinload(PaymentInstance.template))
            .filter(
                PaymentInstance.bill_id.in_(template_ids),
                PaymentInstance.due_date == due_by_kind[kind],
                PaymentInstance.status != PaymentStatus.paid,
                PaymentInstance.hidden.is_(None),
                true() if force else getattr(PaymentInstance, sent_flag).is_(False),
            )
            .all()
        )
        for instance in instances:
            if _send_and_flag(
                db,
                user,
                instance,
                kind=kind,
                flag_attr=sent_flag,
                language=lang,
                channel=channel,
                record=not force,
            ):
                sent += 1
    return sent


_TICK_MINUTES = 1  # the scheduler runs every minute (see main.py)


def _users_with_channel(db: Session, channel: Channel) -> list[User]:
    enabled = getattr(User, channel.enabled)
    any_window = or_(*[getattr(User, uf).is_(True) for _, uf, _ in channel.windows])
    return (
        db.query(User)
        .filter(User.is_active.is_(True), enabled.is_(True), any_window)
        .all()
    )


def _minute_of_day(moment: datetime) -> int:
    return moment.hour * 60 + moment.minute


def _send_time_reached(send_minute: int, local_minute: int, *, exact: bool) -> bool:
    """Is it this user's send time? The send minute is local time of day.

    exact (the per-minute tick): the tick that falls in [send_minute, +1). Each
    instance's sent flag keeps a re-run of the same tick from sending twice. Catch-up (not exact): any time already passed today.
    """
    if exact:
        return 0 <= local_minute - send_minute < _TICK_MINUTES
    return send_minute <= local_minute


def _run_jobs(SessionLocal: sessionmaker, now_utc: datetime, *, exact: bool) -> int:
    """Shared body of the per-minute job and the startup catch-up, run per channel.
    Everything about "when" is evaluated in each user's own time zone."""
    db: Session = SessionLocal()
    sent = 0
    try:
        for ch in CHANNELS:
            for user in _users_with_channel(db, ch):
                local = now_utc.astimezone(user_tz(user))
                if _send_time_reached(
                    getattr(user, ch.send_minute), _minute_of_day(local), exact=exact
                ):
                    sent += send_reminders_for_user(db, user, ch, now_utc=now_utc)

            # On a user's last day of the month (their calendar), send the summary
            # regardless of send minute: a natural retry every minute until it
            # succeeds. Note: the query-then-flag pattern is not atomic; two
            # concurrent scheduler runs could both see last_sent unset and both
            # send. Acceptable at household scale given the per-minute cadence.
            last_sent_col = getattr(User, ch.summary_last_sent)
            summary_users = (
                db.query(User)
                .filter(
                    User.is_active.is_(True),
                    getattr(User, ch.enabled).is_(True),
                    getattr(User, ch.summary_enabled).is_(True),
                )
                .all()
            )
            for u in summary_users:
                today = now_utc.astimezone(user_tz(u)).date()
                if today.day != calendar.monthrange(today.year, today.month)[1]:
                    continue
                month = today.strftime("%Y-%m")
                if getattr(u, ch.summary_last_sent) == month:
                    continue
                if send_monthly_summary_for_user(db, u, month, ch):
                    setattr(u, ch.summary_last_sent, month)
                    db.commit()
    finally:
        db.close()
    return sent


def _scheduler_now(send_minute: int | None) -> datetime:
    """The scheduler's "now" in UTC. send_minute (tests) pins the UTC time of day."""
    now_utc = tz._utcnow()
    if send_minute is not None:
        now_utc = now_utc.replace(
            hour=send_minute // 60, minute=send_minute % 60, second=0, microsecond=0
        )
    return now_utc


def send_daily_reminders(
    SessionLocal: sessionmaker, send_minute: int | None = None
) -> None:
    now_utc = _scheduler_now(send_minute)
    logger.info("Reminder job started (now=%s UTC)", now_utc.strftime("%Y-%m-%d %H:%M"))
    sent = _run_jobs(SessionLocal, now_utc, exact=True)
    logger.info("Reminder job finished: %d reminder(s) sent", sent)


def send_catchup_reminders(
    SessionLocal: sessionmaker, send_minute: int | None = None
) -> None:
    """Run on startup: send reminders for all users whose scheduled time (in their
    own zone) has already passed today."""
    now_utc = _scheduler_now(send_minute)
    logger.info(
        "Catch-up reminders started (now=%s UTC)", now_utc.strftime("%Y-%m-%d %H:%M")
    )
    sent = _run_jobs(SessionLocal, now_utc, exact=False)
    logger.info("Catch-up reminders finished: %d reminder(s) sent", sent)


def _send_and_flag(
    db: Session,
    user: User,
    instance: PaymentInstance,
    *,
    kind: str,
    flag_attr: str,
    language: str,
    channel: Channel = EMAIL,
    record: bool = True,
) -> bool:
    bill_name = (
        instance.template.name if instance.template else f"bill#{instance.bill_id}"
    )
    text: dict[str, Any] = dict(
        bill_name=bill_name,
        due_date=instance.due_date,
        amount=instance.current_amount if instance.template else instance.amount,
        currency=instance.template.currency if instance.template else "PLN",
        kind=kind,
        language=language,
    )

    try:
        if channel is TELEGRAM:
            url = telegram_url(user)
            assert url is not None, "caller must check channel_available"
            send_reminder_telegram(url=url, **text)
        else:
            assert settings.smtp_host is not None, "caller must check channel_available"
            send_reminder_email(
                smtp_host=settings.smtp_host,
                smtp_port=settings.smtp_port,
                smtp_user=settings.smtp_user,
                smtp_password=(
                    settings.smtp_password.get_secret_value()
                    if settings.smtp_password
                    else None
                ),
                smtp_use_tls=settings.smtp_use_tls,
                from_addr=settings.reminder_from or settings.smtp_user or "",
                to_addr=user.email,
                **text,
            )
    except NotificationError as exc:
        logger.error(
            "Failed to send %s %s reminder for user %s, instance %s: %s",
            channel.name,
            kind,
            user.id,
            instance.id,
            exc,
        )
        return False

    if not record:
        return True

    setattr(instance, flag_attr, True)
    if channel is EMAIL:
        instance.email_sent_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception as commit_exc:
        db.rollback()
        logger.critical(
            "%s reminder sent for user %s, instance %s but flag commit failed — "
            "duplicate send possible on next run: %s",
            channel.name,
            user.id,
            instance.id,
            commit_exc,
        )
        return False
    logger.info(
        "Sent %s %s reminder for '%s' (instance %s, user %s)",
        channel.name,
        kind,
        bill_name,
        instance.id,
        user.id,
    )
    return True
