from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.user import User


class BillFrequency(str, Enum):
    monthly = "monthly"
    annual = "annual"
    one_off = "one_off"


class PaymentStatus(str, Enum):
    upcoming = "upcoming"
    overdue = "overdue"
    paid = "paid"


class BillTemplate(Base):
    """Recurring bill definition. Instances are generated from this."""

    __tablename__ = "bill_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT")
    )
    frequency: Mapped[BillFrequency] = mapped_column(String(20), nullable=False)
    # Step size in months (monthly) or years (annual); always 1 for one_off.
    interval: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="PLN")
    due_day: Mapped[int | None] = mapped_column(
        Integer
    )  # day-of-month for monthly bills
    # Several payment days per cycle (sorted, unique). NULL = just [due_day]; due_day
    # always mirrors the first entry so single-day readers keep working.
    due_days: Mapped[list[int] | None] = mapped_column(JSON)
    notes: Mapped[str | None] = mapped_column(Text)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    # Recurrence anchor: YYYY-MM string set at creation from UTC month.
    # Avoids UTC-vs-local off-by-one when created_at straddles a month boundary.
    # NULL for rows created before this column existed; code falls back to created_at.
    start_period: Mapped[str | None] = mapped_column(String(7))
    # Last period (YYYY-MM, inclusive) to generate instances for; NULL = open-ended.
    end_period: Mapped[str | None] = mapped_column(String(7))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(timezone.utc)
    )

    user: Mapped[User] = relationship(back_populates="bills")
    category: Mapped[Category] = relationship()
    instances: Mapped[list["PaymentInstance"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )

    @property
    def days(self) -> list[int | None]:
        """Payment days of one cycle; the list index is the instance slot.
        [None] means "no day set" (due on the 1st), exactly as a lone due_day=None."""
        if self.due_days:
            return list[int | None](sorted(set(self.due_days)))
        return [self.due_day]

    # One-off bills keep their dates as instances. Only touched for one-off bills, so
    # list_bills lazy-loads instances for those few and never for recurring ones.
    @property
    def dates(self) -> list[date]:
        if self.frequency != BillFrequency.one_off:
            return []
        return sorted(i.due_date for i in self.instances if not i.is_deleted)

    @property
    def paid_dates(self) -> list[date]:
        if self.frequency != BillFrequency.one_off:
            return []
        return sorted(
            i.due_date
            for i in self.instances
            if not i.is_deleted and i.status == PaymentStatus.paid
        )


class PaymentInstance(Base):
    """A single payment record. Idempotent: (bill_id, period, slot) is unique, where slot is
    the position of the payment's day in the template's day list (0 for single-day bills).
    """

    __tablename__ = "payment_instances"
    __table_args__ = (
        UniqueConstraint(
            "bill_id", "period", "slot", name="uq_payment_instance_bill_period_slot"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_id: Mapped[int] = mapped_column(
        ForeignKey("bill_templates.id", ondelete="RESTRICT"), nullable=False
    )
    period: Mapped[str] = mapped_column(String(7), nullable=False)  # "YYYY-MM"
    slot: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        String(10), nullable=False, default=PaymentStatus.upcoming
    )
    paid_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    paid_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # Per-payment amount set by the user (e.g. a known invoice); None = follow
    # the template's amount. Never touches the template or other periods.
    amount_override: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Set together with is_deleted when archiving the bill hid this payment, so
    # unarchiving restores exactly those rows and not ones the user deleted by hand.
    deleted_by_archive: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    reminder_sent_upcoming: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    reminder_sent_overdue: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    reminder_sent_2_days_before: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    reminder_sent_on_day: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    telegram_sent_2_days_before: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    telegram_sent_upcoming: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    telegram_sent_on_day: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    telegram_sent_overdue: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    email_sent_at: Mapped[datetime | None] = mapped_column(
        UTCDateTime, nullable=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(timezone.utc)
    )

    template: Mapped["BillTemplate"] = relationship(back_populates="instances")

    def status_on(self, today: date) -> PaymentStatus:
        """Status as shown to the user: an unpaid payment follows its due date,
        never the stored value (a stored "overdue" must clear when the date moves)."""
        if self.status == PaymentStatus.paid:
            return PaymentStatus.paid
        return (
            PaymentStatus.overdue if self.due_date < today else PaymentStatus.upcoming
        )

    @property
    def current_amount(self) -> Decimal:
        """Amount expected for this payment: paid keeps its snapshot, unpaid
        follows the per-payment override, else the template's current price."""
        if self.status == PaymentStatus.paid:
            return self.amount
        if self.amount_override is not None:
            return self.amount_override
        return self.template.amount
