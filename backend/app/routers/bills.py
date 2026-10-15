from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import current_user
from app.core.tz import now_for, today_for, user_tz
from app.models.bill import (
    BillStatus,
    BillTemplate,
    Hidden,
    PaymentInstance,
    PaymentStatus,
)
from app.models.category import Category
from app.models.user import User
from app.schemas.bill import (
    check_interval,
    BillTemplateCreate,
    BillTemplateOut,
    BillTemplateUpdate,
    HasDeletedFutureOut,
    MarkPaidRequest,
    PaymentInstanceOut,
    PaymentInstanceUpdate,
    TrendPointOut,
)
from app.schemas.category import CategoryOut
from app.services.recurrence import (
    _bill_active_in_period,
    _due_date_for_period,
    backfill_template_instances,
    ensure_current_period_instances,
    generate_next_instance,
    is_last_instance,
)
from app.services.trend import payment_trend

router = APIRouter(prefix="/bills", tags=["bills"])


def _check_category_ownership(db: Session, category_id: int, user_id: int) -> None:
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.user_id != user_id:
        raise HTTPException(status_code=404, detail="Category not found")


def _day_columns(days: list[int] | None) -> dict:
    """Template columns for a chosen day list: due_day mirrors the first day and
    due_days is only stored for 2+ days, so single-day bills look exactly as before."""
    if not days:
        return {"due_days": None}
    return {"due_day": days[0], "due_days": days if len(days) > 1 else None}


def _one_off_instances(
    bill: BillTemplate, dates: list[date], taken: dict[str, set[int]]
) -> list[PaymentInstance]:
    """New instances for the given dates; each takes the lowest free slot of its month."""
    created = []
    for d in dates:
        period = d.strftime("%Y-%m")
        used = taken.setdefault(period, set())
        slot = next(i for i in range(len(used) + 1) if i not in used)
        used.add(slot)
        created.append(
            PaymentInstance(
                bill_id=bill.id,
                period=period,
                slot=slot,
                due_date=d,
                amount=bill.amount,
                status=PaymentStatus.upcoming,
            )
        )
    return created


def _sync_one_off_dates(db: Session, bill: BillTemplate, dates: list[date]) -> None:
    """Make the bill's live payments match `dates`. Paid payments are history and stay;
    a deleted (tombstone) payment on a re-added date is brought back."""
    rows = db.query(PaymentInstance).filter(PaymentInstance.bill_id == bill.id).all()
    wanted = set(dates)
    live_dates: set[date] = set()
    removed: set[int] = set()
    for inst in rows:
        if inst.hidden == Hidden.user:
            if inst.due_date in wanted and inst.status != PaymentStatus.paid:
                inst.hidden = None
                inst.amount = bill.amount
                live_dates.add(inst.due_date)
        elif inst.due_date in wanted:
            live_dates.add(inst.due_date)
        elif inst.status != PaymentStatus.paid:
            removed.add(inst.id)
            db.delete(inst)
    db.flush()  # deletes first, so a freed slot can be reused by an insert below
    remaining = [i for i in rows if i.id not in removed]
    taken: dict[str, set[int]] = {}
    for inst in remaining:
        taken.setdefault(inst.period, set()).add(inst.slot)
    db.add_all(
        _one_off_instances(bill, [d for d in dates if d not in live_dates], taken)
    )
    kept = {i.due_date for i in remaining if i.hidden != Hidden.user}
    bill.start_period = min(kept | wanted).strftime("%Y-%m")


def _apply_day_change(db: Session, bill: BillTemplate) -> None:
    """After the day list changed: unpaid payments follow their slot's new day, and
    unpaid payments of slots that no longer exist are dropped (system-made rows, so no
    tombstone, same as the end_period cleanup). Paid payments are never touched."""
    days = bill.days
    unpaid = (
        db.query(PaymentInstance)
        .filter(
            PaymentInstance.bill_id == bill.id,
            PaymentInstance.status != PaymentStatus.paid,
        )
        .all()
    )
    for inst in unpaid:
        if inst.slot >= len(days):
            db.delete(inst)
        elif inst.hidden != Hidden.user:
            inst.due_date = _due_date_for_period(inst.period, days[inst.slot])


def _live_instance(db: Session, instance_id: int, user_id: int) -> PaymentInstance:
    """A payment of the caller's that exists and wasn't deleted (a deleted one is
    gone as far as the API is concerned, so it is a 404, not editable)."""
    instance = db.get(PaymentInstance, instance_id)
    if not instance or instance.hidden is not None:
        raise HTTPException(status_code=404, detail="Payment instance not found")
    if instance.template.user_id != user_id:
        raise HTTPException(status_code=404, detail="Payment instance not found")
    return instance


def _reject_future_paid_at(paid_at: date | None, user: User) -> None:
    """The client sends the date picked in its browser, whose zone can differ from
    the profile's (travelling, or a stale profile) by up to a day, so allow tomorrow
    in the user's own zone."""
    if paid_at is not None and paid_at > today_for(user) + timedelta(days=1):
        raise HTTPException(
            status_code=400, detail="Payment date cannot be in the future"
        )


def _paid_at_datetime(day: date, user: User) -> datetime:
    """A picked calendar day as noon in the user's zone, so it reads back as that
    same day there (a "now" time-of-day could land on the next local day, or in the
    future, and shift the date on the next edit)."""
    return datetime.combine(day, time(12), tzinfo=user_tz(user))


def _to_out(inst: PaymentInstance, today: date) -> PaymentInstanceOut:
    # Relative to the caller's today; reported in every response without writing to the DB.
    status = inst.status_on(today)
    # Unpaid instances follow the per-payment override, else the template's
    # current price (not the generation-time snapshot), so editing a bill's
    # amount is reflected immediately. Paid instances keep their historical amount.
    amount = inst.current_amount
    return PaymentInstanceOut.model_validate(
        {
            "id": inst.id,
            "bill_id": inst.bill_id,
            "period": inst.period,
            "due_date": inst.due_date,
            "amount": amount,
            "amount_overridden": inst.amount_override is not None,
            "status": status,
            "paid_at": inst.paid_at,
            "paid_amount": inst.paid_amount,
            "notes": inst.notes,
            "bill_name": inst.template.name,
            "currency": inst.template.currency,
            "frequency": inst.template.frequency,
            "interval": inst.template.interval,
            "category": CategoryOut.model_validate(inst.template.category),
            "email_sent_at": inst.email_sent_at,
            "is_last": is_last_instance(inst.template, inst.period),
            "bill_status": inst.template.status,
        }
    )


def _has_paid_history(db: Session, bill_ids: list[int]) -> set[int]:
    """Ids among `bill_ids` with a paid payment the user can still see. A payment the
    user deleted is gone from Payments, trend, export and backup, so it is no history.
    """
    rows = (
        db.query(PaymentInstance.bill_id)
        .filter(
            PaymentInstance.bill_id.in_(bill_ids),
            PaymentInstance.status == PaymentStatus.paid,
            PaymentInstance.hidden.is_(None),
        )
        .distinct()
        .all()
    )
    return {bill_id for (bill_id,) in rows}


@router.get("", response_model=list[BillTemplateOut])
def list_bills(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    q = db.query(BillTemplate).filter(BillTemplate.user_id == me.id)
    if not include_archived:
        q = q.filter(BillTemplate.status != BillStatus.paused)
    bills = q.order_by(BillTemplate.name).all()
    with_history = _has_paid_history(db, [b.id for b in bills])
    for b in bills:
        b.has_paid_history = b.id in with_history
    return bills


@router.post("", response_model=BillTemplateOut, status_code=status.HTTP_201_CREATED)
def create_bill(
    body: BillTemplateCreate,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    from app.models.bill import BillFrequency as BF

    RECURRING = (BF.monthly,)

    _check_category_ownership(db, body.category_id, me.id)

    now = now_for(me)
    if body.due_month and body.frequency == BF.annual:
        year = now.year if body.due_month >= now.month else now.year + 1
        start_period = f"{year:04d}-{body.due_month:02d}"
    elif body.due_month and body.frequency in (*RECURRING, BF.one_off):
        # One-off never repeats, so it always anchors to the current year even
        # when due_month has already passed — it should show as due/overdue
        # now, not roll forward to next year like an annual renewal would.
        start_period = f"{now.year:04d}-{body.due_month:02d}"
    else:
        start_period = now.strftime("%Y-%m")
    if body.end_period and body.end_period < start_period:
        raise HTTPException(status_code=422, detail="end_period is before start")
    if body.dates:
        start_period = body.dates[0].strftime("%Y-%m")
    data = body.model_dump(exclude={"due_month", "dates", "due_days"})
    data.update(_day_columns(body.due_days))
    if body.dates:
        data["due_day"] = None
    if body.dates:
        data["draft_dates"] = [d.isoformat() for d in body.dates]
    # A draft: payments appear only once the user activates the bill.
    bill = BillTemplate(
        **data, user_id=me.id, start_period=start_period, status=BillStatus.draft
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return bill


@router.post("/{bill_id}/activate", response_model=BillTemplateOut)
def activate_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    from app.models.bill import BillFrequency as BF

    bill = db.get(BillTemplate, bill_id)
    if not bill or bill.user_id != me.id:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.status == BillStatus.paused:
        raise HTTPException(status_code=409, detail="Resume the bill first")

    current_period = now_for(me).strftime("%Y-%m")
    start_period = bill.start_period or current_period  # drafts always have one
    dates = bill.dates  # reads draft_dates while still a draft
    # Claim the draft atomically: of two concurrent activations only one updates the row
    # (SQLite serializes the writers), the other gets 409 instead of a duplicate-key 500.
    claimed = (
        db.query(BillTemplate)
        .filter(BillTemplate.id == bill.id, BillTemplate.status == BillStatus.draft)
        .update(
            {"status": BillStatus.active, "draft_dates": None},
            synchronize_session=False,
        )
    )
    if not claimed:
        raise HTTPException(status_code=409, detail="Bill is already activated")
    db.refresh(bill)
    # <=: a bill starting this month is live at once, not only after the next sync.
    if bill.frequency in (BF.monthly, BF.annual) and start_period <= current_period:
        backfill_template_instances(db, bill, start_period, current_period)
    elif dates:
        # Explicit dates (any months): one payment each.
        db.add_all(_one_off_instances(bill, dates, {}))
    elif bill.frequency == BF.one_off:
        # A one-off bill never repeats: exactly one instance.
        db.add(
            PaymentInstance(
                bill_id=bill.id,
                period=start_period,
                due_date=_due_date_for_period(start_period, bill.due_day),
                amount=bill.amount,
                status=PaymentStatus.upcoming,
            )
        )
    db.commit()
    db.refresh(bill)
    return bill


# Literal-path routes declared before parameterized /{bill_id} routes to prevent
# FastAPI from matching "payments" as an integer bill_id.
@router.get("/payments", response_model=list[PaymentInstanceOut])
def list_payments(
    month: str | None = None,  # "YYYY-MM"
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    today = today_for(me)
    current_month = today.strftime("%Y-%m")
    if month is None:
        month = current_month

    # NOTE: instance seeding was intentionally moved to POST /bills/sync-instances
    # so that GET list_payments remains side-effect free.

    instances = (
        db.query(PaymentInstance)
        .options(selectinload(PaymentInstance.template))
        .join(BillTemplate, PaymentInstance.bill_id == BillTemplate.id)
        .filter(
            BillTemplate.user_id == me.id,
            PaymentInstance.period == month,
            PaymentInstance.hidden.is_(None),
        )
        .order_by(PaymentInstance.due_date)
        .all()
    )

    result = [_to_out(inst, today) for inst in instances]
    return result


@router.get("/payments/trend", response_model=list[TrendPointOut])
def payments_trend(
    month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    """Paid vs unpaid totals per currency for the 12 months ending at `month`."""
    return payment_trend(db, me.id, month or today_for(me).strftime("%Y-%m"))


@router.post("/payments/{instance_id}/pay", response_model=PaymentInstanceOut)
def mark_paid(
    instance_id: int,
    body: MarkPaidRequest,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    instance = _live_instance(db, instance_id, me.id)
    if instance.status == PaymentStatus.paid:
        # Another tab/device got there first; use PATCH to edit a paid payment.
        raise HTTPException(status_code=400, detail="Payment is already marked as paid")
    template = (
        instance.template
    )  # read before commit; expire_on_commit would force a lazy re-load after
    _reject_future_paid_at(body.paid_at, me)

    now = now_for(me)
    expected = instance.current_amount  # before status flips to paid
    instance.status = PaymentStatus.paid
    instance.paid_at = (
        _paid_at_datetime(body.paid_at, me) if body.paid_at is not None else now
    )
    instance.paid_amount = (
        body.paid_amount if body.paid_amount is not None else expected
    )
    if body.notes is not None:
        instance.notes = body.notes or None
    db.commit()

    generate_next_instance(db, template, instance.period)

    db.refresh(instance)
    return _to_out(instance, today_for(me))


@router.patch("/payments/{instance_id}", response_model=PaymentInstanceOut)
def edit_payment(
    instance_id: int,
    body: PaymentInstanceUpdate,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    instance = _live_instance(db, instance_id, me.id)
    sent = body.model_fields_set
    is_paid = instance.status == PaymentStatus.paid
    # Each state has its own editable fields; reject the other state's so a
    # value is never silently dropped.
    if is_paid and "amount" in sent:
        raise HTTPException(
            status_code=400, detail="Amount can only be edited before payment"
        )
    if is_paid and "due_date" in sent:
        raise HTTPException(
            status_code=400, detail="Due date can only be edited before payment"
        )
    if not is_paid and sent & {"paid_amount", "paid_at"}:
        raise HTTPException(status_code=400, detail="Payment is not marked as paid")
    _reject_future_paid_at(body.paid_at, me)
    if body.due_date is not None and body.due_date.strftime("%Y-%m") != instance.period:
        raise HTTPException(
            status_code=400, detail="Due date must fall within the payment's period"
        )

    if body.paid_at is not None:
        instance.paid_at = _paid_at_datetime(body.paid_at, me)
    if body.paid_amount is not None:
        instance.paid_amount = body.paid_amount
    if body.due_date is not None:
        instance.due_date = body.due_date
    if "amount" in sent:
        # Per-payment only: the template and other periods are never touched.
        instance.amount_override = body.amount
        instance.amount = (
            body.amount if body.amount is not None else instance.template.amount
        )
    if "notes" in sent:
        instance.notes = body.notes or None
    db.commit()
    db.refresh(instance)
    return _to_out(instance, today_for(me))


@router.post("/payments/{instance_id}/unpay", response_model=PaymentInstanceOut)
def revert_payment(
    instance_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    instance = _live_instance(db, instance_id, me.id)
    if instance.status != PaymentStatus.paid:
        raise HTTPException(status_code=400, detail="Payment is not marked as paid")

    today = today_for(me)
    # A paused bill keeps its paid history as it is: reverting would put an unpaid
    # payment back on a bill that is not supposed to have any.
    if instance.template.status == BillStatus.paused:
        raise HTTPException(status_code=409, detail="Resume the bill first")
    instance.status = (
        PaymentStatus.overdue if instance.due_date < today else PaymentStatus.upcoming
    )
    instance.paid_at = None
    instance.paid_amount = None
    db.commit()
    db.refresh(instance)
    return _to_out(instance, today_for(me))


@router.delete("/payments/{instance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(
    instance_id: int,
    delete_future: bool = Query(False),
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    instance = db.get(PaymentInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Payment instance not found")

    template = instance.template
    if template.user_id != me.id:
        raise HTTPException(status_code=404, detail="Payment instance not found")

    instance.hidden = Hidden.user

    if delete_future:
        db.query(PaymentInstance).filter(
            PaymentInstance.bill_id == instance.bill_id,
            PaymentInstance.due_date > instance.due_date,
            PaymentInstance.status != PaymentStatus.paid,
            PaymentInstance.hidden.is_(None),
        ).update({"hidden": Hidden.user}, synchronize_session=False)

    db.commit()


@router.post("/sync-instances", status_code=status.HTTP_204_NO_CONTENT)
def sync_instances(
    month: str | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    """Explicitly seed payment instances for the given month (or current month).
    Replaces the previous seed-on-read side effect in list_payments."""
    today = today_for(me)
    current_month = today.strftime("%Y-%m")
    target = month or current_month
    if target >= current_month:
        ensure_current_period_instances(db, target, me.id)


@router.get("/{bill_id}/has-deleted-future", response_model=HasDeletedFutureOut)
def has_deleted_future(
    bill_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    bill = db.get(BillTemplate, bill_id)
    if not bill or bill.user_id != me.id:
        raise HTTPException(status_code=404, detail="Bill not found")
    current_period = today_for(me).strftime("%Y-%m")
    exists = (
        db.query(PaymentInstance)
        .filter(
            PaymentInstance.bill_id == bill_id,
            # Only the user's own deletions; ones hidden by pausing come back with Resume.
            PaymentInstance.hidden == Hidden.user,
            PaymentInstance.period >= current_period,
        )
        .first()
        is not None
    )
    return HasDeletedFutureOut(has_deleted_future=exists)


@router.patch("/{bill_id}", response_model=BillTemplateOut)
def update_bill(
    bill_id: int,
    body: BillTemplateUpdate,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    bill = db.get(BillTemplate, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.user_id != me.id:
        raise HTTPException(status_code=404, detail="Bill not found")

    from app.models.bill import BillFrequency as BF

    updates = body.model_dump(exclude_unset=True)
    updates.pop("recreate_deleted_future", None)
    due_month = updates.pop("due_month", None)
    dates = updates.pop("dates", None)
    if "due_days" in updates:
        updates.update(_day_columns(updates["due_days"]))
    elif "due_day" in updates:
        updates["due_days"] = None  # a lone due_day means "one day"
    if "category_id" in updates:
        _check_category_ownership(db, updates["category_id"], me.id)
    if updates.get("interval") is None:
        updates.pop("interval", None)
    days_before = bill.days
    schedule_before = (bill.frequency, bill.interval, bill.start_period)
    for field, value in updates.items():
        setattr(bill, field, value)
    if dates is not None and bill.frequency != BF.one_off:
        raise HTTPException(status_code=422, detail="dates are only for one_off bills")

    if bill.status == BillStatus.draft:
        # Draft: no payments exist, so only the stored template changes.
        if due_month is not None and not dates:
            now = now_for(me)
            if bill.frequency == BF.annual and due_month < now.month:
                year = now.year + 1
            else:
                year = now.year
            bill.start_period = f"{year:04d}-{due_month:02d}"
        if dates is not None:
            bill.draft_dates = [d.isoformat() for d in dates]
            if dates:
                bill.start_period = min(dates).strftime("%Y-%m")
        if (
            bill.end_period
            and bill.start_period
            and bill.end_period < bill.start_period
        ):
            raise HTTPException(status_code=422, detail="end_period is before start")
        try:
            check_interval(bill.frequency, bill.interval)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        db.commit()
        db.refresh(bill)
        return bill

    # Recalculate start_period when due_month changes for annual/one_off
    effective_frequency = updates.get("frequency", bill.frequency)
    if (
        due_month is not None
        and effective_frequency in (BF.annual, BF.one_off)
        and not dates
    ):
        now = now_for(me)
        year = now.year if due_month >= now.month else now.year + 1
        bill.start_period = f"{year:04d}-{due_month:02d}"

    if bill.end_period and bill.start_period and bill.end_period < bill.start_period:
        raise HTTPException(status_code=422, detail="end_period is before start")

    try:
        check_interval(bill.frequency, bill.interval)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if bill.end_period:
        # Unpaid instances seeded past the new end are system-made: hard delete, so they
        # are not mistaken for user deletions (tombstones) and regenerate if the end moves.
        db.query(PaymentInstance).filter(
            PaymentInstance.bill_id == bill.id,
            PaymentInstance.period > bill.end_period,
            PaymentInstance.status != PaymentStatus.paid,
        ).delete(synchronize_session=False)

    if (bill.frequency, bill.interval, bill.start_period) != schedule_before:
        # The cycle changed (e.g. every month → every 3 months): unpaid payments from now on
        # that the new cycle skips are system-made, so drop them like the end_period cleanup
        # does. Past ones stay (a missed payment is history), tombstones stay (user choices),
        # and months the new cycle adds get seeded on their next visit.
        current_period = today_for(me).strftime("%Y-%m")
        stale = (
            db.query(PaymentInstance)
            .filter(
                PaymentInstance.bill_id == bill.id,
                PaymentInstance.period >= current_period,
                PaymentInstance.status != PaymentStatus.paid,
                PaymentInstance.hidden.is_(None),
            )
            .all()
        )
        for inst in stale:
            if bill.frequency != BF.one_off and not _bill_active_in_period(
                bill, inst.period
            ):
                db.delete(inst)

    if bill.days != days_before:
        _apply_day_change(db, bill)

    if dates is not None:
        _sync_one_off_dates(db, bill, dates)

    if body.recreate_deleted_future:
        current_period = today_for(me).strftime("%Y-%m")
        tombstones = (
            db.query(PaymentInstance)
            .filter(
                PaymentInstance.bill_id == bill.id,
                PaymentInstance.hidden == Hidden.user,
                PaymentInstance.period >= current_period,
            )
            .all()
        )
        for inst in tombstones:
            inst.hidden = None
            if inst.status == PaymentStatus.paid:
                continue  # paid history comes back as it was, never reset to upcoming
            inst.amount = bill.amount
            if bill.frequency != BF.one_off:
                days = bill.days
                inst.due_date = _due_date_for_period(
                    inst.period, days[min(inst.slot, len(days) - 1)]
                )
            inst.status = PaymentStatus.upcoming

    db.commit()
    db.refresh(bill)
    return bill


@router.delete("/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    bill = db.get(BillTemplate, bill_id)
    if not bill or bill.user_id != me.id:
        raise HTTPException(status_code=404, detail="Bill not found")
    # Nothing to lose, no history to cascade into: see BillTemplate.can_delete.
    bill.has_paid_history = bool(_has_paid_history(db, [bill.id]))
    if not bill.can_delete:
        raise HTTPException(
            status_code=409, detail="Only a draft or a paused bill with nothing paid"
        )
    db.delete(bill)
    db.commit()


@router.post("/{bill_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    bill = db.get(BillTemplate, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.user_id != me.id:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.status == BillStatus.draft:
        raise HTTPException(status_code=409, detail="A draft has nothing to pause")
    bill.status = BillStatus.paused
    # Hide what is still unpaid from this month on; paid and past payments stay as history.
    current_period = today_for(me).strftime("%Y-%m")
    db.query(PaymentInstance).filter(
        PaymentInstance.bill_id == bill.id,
        PaymentInstance.period >= current_period,
        PaymentInstance.status != PaymentStatus.paid,
        PaymentInstance.hidden.is_(None),
    ).update({"hidden": Hidden.paused}, synchronize_session=False)
    db.commit()


@router.post("/{bill_id}/unarchive", status_code=status.HTTP_204_NO_CONTENT)
def unarchive_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    bill = db.get(BillTemplate, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.user_id != me.id:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.status != BillStatus.paused:
        return
    bill.status = BillStatus.active
    current_period = today_for(me).strftime("%Y-%m")
    # A last-payment month already in the past would leave the restored bill idle.
    if bill.end_period and bill.end_period < current_period:
        bill.end_period = None
    # Bring back only what pausing hid; payments the user deleted by hand stay deleted.
    db.query(PaymentInstance).filter(
        PaymentInstance.bill_id == bill.id,
        PaymentInstance.hidden == Hidden.paused,
        PaymentInstance.period >= current_period,
    ).update({"hidden": None}, synchronize_session=False)
    db.commit()
