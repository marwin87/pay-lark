from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.tz import is_valid_tz
from app.models.bill import (
    BillFrequency,
    BillStatus,
    BillTemplate,
    PaymentInstance,
    PaymentStatus,
)
from app.models.category import Category
from app.models.restore_snapshot import RestoreSnapshot
from app.models.user import User
from app.schemas.bill import BackupChannelSchedule, BackupPayload
from app.services.categories import seed_default_categories
from app.services.reminder_job import EMAIL, TELEGRAM, Channel

Section = Literal[
    "bills",
    "categories",
    "email",
    "telegram",
    "languages",
    "currency",
    "export",
    "pdf",
    "share",
]
ALL_SECTIONS: tuple[Section, ...] = (
    "bills",
    "categories",
    "email",
    "telegram",
    "languages",
    "currency",
    "export",
    "pdf",
    "share",
)


def _legacy_category_id(
    db: Session,
    user_id: int,
    slug: str | None,
    fallback_id: int,
    name: str | None = None,
) -> int:
    """Backups without a `categories` section carry either the old free-text
    category string (v2/v3, now used as `slug`) or `category_name`. Map to one
    of the user's current categories by name, then slug, falling back to their
    'other' category (or any category at all) if it was renamed/archived away."""
    if name:
        match = (
            db.query(Category.id)
            .filter(Category.user_id == user_id, Category.name == name)
            .first()
        )
        if match:
            return match[0]
    if slug:
        match = (
            db.query(Category.id)
            .filter(Category.user_id == user_id, Category.slug == slug)
            .first()
        )
        if match:
            return match[0]
    return fallback_id


def _fallback_category_id(db: Session, user_id: int) -> int:
    other = (
        db.query(Category.id)
        .filter(Category.user_id == user_id, Category.slug == "other")
        .first()
    )
    if other:
        return other[0]
    any_category = db.query(Category.id).filter(Category.user_id == user_id).first()
    if any_category:
        return any_category[0]
    seeded = seed_default_categories(db, user_id)
    return next(c.id for c in seeded if c.slug == "other")


_WINDOW_FIELDS = (
    "notify_2_days_before",
    "notify_1_day_before",
    "notify_on_day",
    "notify_1_day_after",
)


def _schedule_out(user: User, ch: Channel) -> dict:
    out = {
        "enabled": getattr(user, ch.enabled),
        "send_minute": getattr(user, ch.send_minute),
        "monthly_summary_enabled": getattr(user, ch.summary_enabled),
    }
    for field, (_, user_attr, _) in zip(_WINDOW_FIELDS, ch.windows, strict=True):
        out[field] = getattr(user, user_attr)
    return out


def _apply_schedule(user: User, ch: Channel, s: BackupChannelSchedule) -> None:
    setattr(user, ch.enabled, s.enabled)
    setattr(user, ch.send_minute, s.send_minute)
    setattr(user, ch.summary_enabled, s.monthly_summary_enabled)
    for field, (_, user_attr, _) in zip(_WINDOW_FIELDS, ch.windows, strict=True):
        setattr(user, user_attr, getattr(s, field))


def _build_backup_arrays(
    db: Session,
    user_id: int,
    sections: tuple[Section, ...] | list[Section] = ALL_SECTIONS,
) -> dict:
    """Serialize the requested sections of a user's data into the backup shape
    shared by GET /export/json and the pre-restore snapshot. Only selected
    sections appear as keys."""
    user = db.get(User, user_id)
    assert user is not None
    out: dict = {}

    notifications: dict = {}
    if "email" in sections:
        notifications["email"] = _schedule_out(user, EMAIL)
        notifications["browser_enabled"] = user.browser_notifications_enabled
    if "telegram" in sections:
        notifications["telegram"] = _schedule_out(user, TELEGRAM)
    if notifications:
        # The send times are in this zone, so it travels with them.
        notifications["timezone"] = user.timezone
        out["notifications"] = notifications

    prefs: dict = {}
    if "languages" in sections:
        prefs["language_preference"] = user.language_preference
        prefs["enabled_languages"] = list(user.enabled_languages)
    if "currency" in sections:
        prefs["default_currency"] = user.default_currency
        prefs["decimal_separator"] = user.decimal_separator
    if "export" in sections:
        prefs["export_enabled"] = user.export_enabled
        prefs["export_fields"] = list(user.export_fields)
    if "pdf" in sections:
        prefs["pdf_enabled"] = user.pdf_enabled
        prefs["pdf_fields"] = list(user.pdf_fields)
    if "share" in sections:
        prefs["share_enabled"] = user.share_enabled
        prefs["share_emails"] = list(user.share_emails)
    if prefs:
        out["preferences"] = prefs

    if "categories" in sections:
        categories = db.query(Category).filter(Category.user_id == user_id).all()
        out["categories"] = [
            {
                "id": c.id,
                "name": c.name,
                "slug": c.slug,
                "color": c.color,
                "sort_order": c.sort_order,
                "is_default": c.is_default,
                "is_archived": c.is_archived,
            }
            for c in categories
        ]

    if "bills" in sections:
        templates = db.query(BillTemplate).filter(BillTemplate.user_id == user_id).all()
        template_ids = [t.id for t in templates]
        instances = (
            db.query(PaymentInstance)
            .filter(
                PaymentInstance.bill_id.in_(template_ids),
                PaymentInstance.hidden.is_(None),
            )
            .all()
            if template_ids
            else []
        )
        out["bill_templates"] = [
            {
                "id": t.id,
                "name": t.name,
                "category_id": t.category_id,
                "category_name": t.category.name,
                "frequency": t.frequency,
                "interval": t.interval,
                "amount": float(t.amount),
                "currency": t.currency,
                "due_day": t.due_day,
                "due_days": t.due_days,
                "notes": t.notes,
                "status": t.status,
                "start_period": t.start_period,
                "end_period": t.end_period,
                "draft_dates": t.draft_dates,
                "created_at": t.created_at.isoformat(),
            }
            for t in templates
        ]
        out["payment_instances"] = [
            {
                "id": i.id,
                "bill_id": i.bill_id,
                "period": i.period,
                "slot": i.slot,
                "due_date": i.due_date.isoformat(),
                "amount": float(i.amount),
                "status": i.status,
                "paid_at": i.paid_at.isoformat() if i.paid_at else None,
                "paid_amount": float(i.paid_amount) if i.paid_amount else None,
                "amount_override": (
                    float(i.amount_override) if i.amount_override is not None else None
                ),
                "notes": i.notes,
                "created_at": i.created_at.isoformat(),
                "reminder_sent_upcoming": i.reminder_sent_upcoming,
                "reminder_sent_overdue": i.reminder_sent_overdue,
            }
            for i in instances
        ]
    return out


def _merge_categories(db: Session, user_id: int, backup: BackupPayload) -> None:
    """Categories-only restore: existing bills reference the current categories,
    so match by slug (else name) and update in place; create the missing ones.
    Never deletes."""
    existing = db.query(Category).filter(Category.user_id == user_id).all()
    for bc in backup.categories:
        match = next(
            (
                c
                for c in existing
                if (bc.slug and c.slug == bc.slug)
                or (not bc.slug and c.name == bc.name)
            ),
            None,
        )
        if match is None:
            match = Category(user_id=user_id, name=bc.name, slug=bc.slug)
            db.add(match)
            existing.append(match)
        match.name = bc.name
        match.color = bc.color
        match.sort_order = bc.sort_order
        match.is_default = bc.is_default
        match.is_archived = bc.is_archived
    db.flush()


def _apply_backup(db: Session, user_id: int, backup: BackupPayload) -> tuple[int, int]:
    """Apply whatever sections the backup contains; absent sections leave the
    user's current data untouched. Bills/payments are destructively replaced when
    present. Shared by /restore and /restore-snapshot."""
    templates_in = backup.bill_templates
    if templates_in is None:
        if backup.categories:
            _merge_categories(db, user_id, backup)
    else:
        existing_ids = [
            t.id
            for t in db.query(BillTemplate.id)
            .filter(BillTemplate.user_id == user_id)
            .all()
        ]
        if existing_ids:
            db.query(PaymentInstance).filter(
                PaymentInstance.bill_id.in_(existing_ids)
            ).delete(synchronize_session=False)
            db.query(BillTemplate).filter(BillTemplate.user_id == user_id).delete(
                synchronize_session=False
            )

        category_id_map: dict[int, int] = {}
        if backup.categories:
            db.query(Category).filter(Category.user_id == user_id).delete(
                synchronize_session=False
            )
            for bc in backup.categories:
                category_obj = Category(
                    user_id=user_id,
                    name=bc.name,
                    slug=bc.slug,
                    color=bc.color,
                    sort_order=bc.sort_order,
                    is_default=bc.is_default,
                    is_archived=bc.is_archived,
                )
                db.add(category_obj)
                db.flush()
                category_id_map[bc.id] = category_obj.id

        fallback_category_id = _fallback_category_id(db, user_id)

        id_map: dict[int, int] = {}
        for bt in templates_in:
            if backup.categories:
                category_id = (
                    category_id_map.get(bt.category_id, fallback_category_id)
                    if bt.category_id is not None
                    else fallback_category_id
                )
            else:
                category_id = _legacy_category_id(
                    db, user_id, bt.category, fallback_category_id, bt.category_name
                )
            template_obj = BillTemplate(
                name=bt.name,
                category_id=category_id,
                frequency=BillFrequency(bt.frequency),
                interval=bt.interval,
                amount=Decimal(str(bt.amount)),
                currency=bt.currency,
                due_day=bt.due_day,
                due_days=bt.due_days,
                notes=bt.notes,
                status=BillStatus(bt.status),
                start_period=bt.start_period,
                end_period=bt.end_period,
                draft_dates=bt.draft_dates,
                user_id=user_id,
            )
            db.add(template_obj)
            db.flush()
            id_map[bt.id] = template_obj.id

        for bi in backup.payment_instances or []:
            instance_obj = PaymentInstance(
                bill_id=id_map[bi.bill_id],
                period=bi.period,
                slot=bi.slot,
                due_date=date.fromisoformat(bi.due_date),
                amount=Decimal(str(bi.amount)),
                status=PaymentStatus(bi.status),
                paid_at=datetime.fromisoformat(bi.paid_at) if bi.paid_at else None,
                paid_amount=(
                    Decimal(str(bi.paid_amount)) if bi.paid_amount is not None else None
                ),
                amount_override=(
                    Decimal(str(bi.amount_override))
                    if bi.amount_override is not None
                    else None
                ),
                notes=bi.notes,
                reminder_sent_upcoming=bi.reminder_sent_upcoming,
                reminder_sent_overdue=bi.reminder_sent_overdue,
            )
            db.add(instance_obj)

    if backup.notifications or backup.preferences:
        user = db.get(User, user_id)
        assert user is not None
        if n := backup.notifications:  # absent/partial: keep current settings
            if n.email:
                _apply_schedule(user, EMAIL, n.email)
            if n.telegram:
                _apply_schedule(user, TELEGRAM, n.telegram)
            if n.browser_enabled is not None:
                user.browser_notifications_enabled = n.browser_enabled
            if n.timezone is not None and is_valid_tz(n.timezone):
                user.timezone = n.timezone  # an unknown zone in a file is ignored
        if p := backup.preferences:
            if p.language_preference is not None:
                user.language_preference = p.language_preference
            if p.enabled_languages is not None:
                user.enabled_languages = p.enabled_languages
            if p.default_currency is not None:
                user.default_currency = p.default_currency
            if p.decimal_separator is not None:
                user.decimal_separator = p.decimal_separator
            if p.export_enabled is not None:
                user.export_enabled = p.export_enabled
            if p.pdf_enabled is not None:
                user.pdf_enabled = p.pdf_enabled
            if p.share_enabled is not None:
                user.share_enabled = p.share_enabled
            if p.share_emails is not None:
                user.share_emails = p.share_emails
            if p.export_fields is not None:
                user.export_fields = p.export_fields
            if p.pdf_fields is not None:
                user.pdf_fields = p.pdf_fields
            if (
                user.language_preference
                and user.language_preference not in user.enabled_languages
            ):
                raise HTTPException(
                    status_code=422,
                    detail="The active language must be one of the enabled languages",
                )

    return len(templates_in or []), len(backup.payment_instances or [])


def _active_snapshot(db: Session, user_id: int) -> RestoreSnapshot | None:
    """The user's snapshot if one exists and is still within the retention
    window. Shared by /last-snapshot and /restore-snapshot so they can't
    drift on what counts as "expired"."""
    cutoff = datetime.now(UTC) - timedelta(
        days=settings.restore_snapshot_retention_days
    )
    return (
        db.query(RestoreSnapshot)
        .filter(
            RestoreSnapshot.user_id == user_id, RestoreSnapshot.created_at >= cutoff
        )
        .first()
    )
