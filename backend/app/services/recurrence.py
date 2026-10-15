from datetime import date
from calendar import monthrange

from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.models.bill import (
    BillFrequency,
    BillStatus,
    BillTemplate,
    PaymentInstance,
    PaymentStatus,
)

# A rival insert shows up as IntegrityError on the unique key, but on SQLite a writer whose
# read snapshot went stale gets "database is locked" (OperationalError); the retry sees the winner.
_WRITE_CONFLICT = (IntegrityError, OperationalError)


def _step_months(frequency: BillFrequency, interval: int) -> int:
    if frequency == BillFrequency.one_off:
        return 0  # never advances
    return interval * (12 if frequency == BillFrequency.annual else 1)


def _next_period(period: str, frequency: BillFrequency, interval: int = 1) -> str:
    year, month = map(int, period.split("-"))
    index = year * 12 + (month - 1) + _step_months(frequency, interval)
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def is_last_instance(template: BillTemplate, period: str) -> bool:
    """True if no further instance follows `period` because end_period cuts the schedule."""
    if not template.end_period or template.frequency == BillFrequency.one_off:
        return False
    if period > template.end_period:
        return False  # a paid leftover past the end is not the final instalment
    return (
        _next_period(period, template.frequency, template.interval)
        > template.end_period
    )


def _due_date_for_period(period: str, due_day: int | None) -> date:
    year, month = map(int, period.split("-"))
    day = due_day or 1
    # clamp to last day of month (e.g. due_day=31 in Feb → 28/29)
    last_day = monthrange(year, month)[1]
    return date(year, month, min(day, last_day))


def _existing_slots(
    db: Session, bill_id: int, periods: list[str]
) -> dict[str, set[int]]:
    """Slots that already have a row (soft-deleted ones included: they are tombstones)."""
    slots: dict[str, set[int]] = {}
    for row in db.query(PaymentInstance.period, PaymentInstance.slot).filter(
        PaymentInstance.bill_id == bill_id,
        PaymentInstance.period.in_(periods),
    ):
        slots.setdefault(row.period, set()).add(row.slot)
    return slots


def _missing_instances(
    template: BillTemplate, period: str, have: set[int]
) -> list[PaymentInstance]:
    """One new instance per day of the template that has no row yet in `period`."""
    return [
        PaymentInstance(
            bill_id=template.id,
            period=period,
            slot=slot,
            due_date=_due_date_for_period(period, day),
            amount=template.amount,
            status=PaymentStatus.upcoming,
        )
        for slot, day in enumerate(template.days)
        if slot not in have
    ]


def _bill_active_in_period(template: BillTemplate, period: str) -> bool:
    """Return True if this template's frequency schedule falls on the given period."""
    # Use start_period (YYYY-MM) as the recurrence anchor when set.
    # Falls back to created_at UTC month for rows predating the column.
    anchor = template.start_period or template.created_at.strftime("%Y-%m")
    start_year, start_month = map(int, anchor.split("-"))
    target_year, target_month = map(int, period.split("-"))
    months_diff = (target_year - start_year) * 12 + (target_month - start_month)

    if months_diff < 0:
        return False
    if template.end_period and period > template.end_period:
        return False

    if template.frequency == BillFrequency.one_off:
        return False
    return months_diff % _step_months(template.frequency, template.interval) == 0


def backfill_template_instances(
    db: Session, template: BillTemplate, from_period: str, to_period: str
) -> None:
    """Create missing instances for a single template from from_period to to_period inclusive."""
    # Collect all periods in range where this template is active.
    active_periods: list[str] = []
    year, month = map(int, from_period.split("-"))
    period = from_period
    while period <= to_period:
        if _bill_active_in_period(template, period):
            active_periods.append(period)
        month += 1
        if month > 12:
            month = 1
            year += 1
        period = f"{year:04d}-{month:02d}"

    if not active_periods:
        return

    # Single query for all existing slots — avoids N+1 per period.
    existing = _existing_slots(db, template.id, active_periods)
    for p in active_periods:
        db.add_all(_missing_instances(template, p, existing.get(p, set())))

    if db.new:
        try:
            db.commit()
        except _WRITE_CONFLICT:
            db.rollback()


def ensure_current_period_instances(db: Session, period: str, user_id: int) -> None:
    """Idempotently seed payment instances for eligible templates that are due in period.

    Safe to call concurrently (two tabs, strict-mode double effects): the unique
    (bill_id, period) constraint rejects the loser's insert, which is rolled back and
    retried once, and the retry sees the winner's rows.
    """
    for attempt in range(2):
        _seed_period(db, period, user_id)
        try:
            db.commit()
            return
        except _WRITE_CONFLICT:
            db.rollback()
            if attempt:
                raise


def _seed_period(db: Session, period: str, user_id: int) -> None:
    templates = (
        db.query(BillTemplate)
        .filter(
            BillTemplate.user_id == user_id,
            BillTemplate.status == BillStatus.active,
            BillTemplate.frequency != BillFrequency.one_off,
        )
        .all()
    )
    for template in templates:
        if not _bill_active_in_period(template, period):
            continue
        have = _existing_slots(db, template.id, [period]).get(period, set())
        db.add_all(_missing_instances(template, period, have))


def generate_next_instance(
    db: Session, template: BillTemplate, paid_period: str
) -> PaymentInstance | None:
    """Create the next-period instance after a payment. Idempotent."""
    if template.frequency == BillFrequency.one_off:
        return None

    next_period = _next_period(paid_period, template.frequency, template.interval)
    if template.end_period and next_period > template.end_period:
        return None

    # idempotent: only the days that have no row yet get created
    have = _existing_slots(db, template.id, [next_period]).get(next_period, set())
    created = _missing_instances(template, next_period, have)
    if created:
        db.add_all(created)
        try:
            db.commit()
        except _WRITE_CONFLICT:
            db.rollback()
    return (
        db.query(PaymentInstance)
        .filter(
            PaymentInstance.bill_id == template.id,
            PaymentInstance.period == next_period,
        )
        .order_by(PaymentInstance.slot)
        .first()
    )
