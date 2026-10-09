from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from pydantic import BaseModel, Field, computed_field, field_validator, model_validator
from app.models.bill import BillFrequency, PaymentStatus
from app.schemas.auth import (
    ShareEmails,
    normalize_bot_token,
    normalize_chat_id,
    validate_export_fields,
)
from app.schemas.category import CategoryOut

_PERIOD_RE = r"^\d{4}-(0[1-9]|1[0-2])$"

# Bounds mirror the DB columns (Numeric(12,2), String(255)/String(10)); without
# them an oversized value passes validation and fails as a 500 at commit.
Money = Annotated[Decimal, Field(ge=0, le=Decimal("9999999999.99"))]
BillName = Annotated[str, Field(min_length=1, max_length=255)]
Currency = Annotated[str, Field(max_length=10)]
Notes = Annotated[str, Field(max_length=2000)]
# Payment days of one cycle: 1-31, any order on input, stored sorted and unique.
DueDays = Annotated[list[Annotated[int, Field(ge=1, le=31)]], Field(max_length=31)]
# Explicit dates of a one-off bill (any months).
OneOffDates = Annotated[list[date], Field(min_length=1, max_length=366)]


def _sorted_unique(value: list | None) -> list | None:
    return None if value is None else sorted(set(value))


def check_interval(frequency: BillFrequency, interval: int) -> None:
    """monthly: 1-12 months, annual: 1-5 years, one_off: always 1."""
    limit = {BillFrequency.annual: 5, BillFrequency.one_off: 1}.get(frequency, 12)
    if interval > limit:
        raise ValueError(f"interval must be <= {limit} for {frequency.value}")


class BillTemplateCreate(BaseModel):
    name: BillName
    category_id: int
    frequency: BillFrequency
    interval: int = Field(1, ge=1, le=12)
    amount: Money = Decimal("0")
    currency: Currency = "PLN"
    due_day: int | None = Field(None, ge=1, le=31)
    due_month: int | None = Field(None, ge=1, le=12)  # month for annual/one_off
    end_period: str | None = Field(None, pattern=_PERIOD_RE)  # last recurring month
    notes: Notes | None = None
    due_days: DueDays | None = None  # several days per cycle; due_day mirrors the first
    dates: OneOffDates | None = None  # one-off only

    _normalize_days = field_validator("due_days", "dates")(_sorted_unique)

    @model_validator(mode="after")
    def _interval_fits_frequency(self) -> "BillTemplateCreate":
        check_interval(self.frequency, self.interval)
        if self.dates is not None and self.frequency != BillFrequency.one_off:
            raise ValueError("dates are only for one_off bills")
        if self.due_days and self.frequency == BillFrequency.one_off:
            raise ValueError("due_days are not for one_off bills, use dates")
        return self


_REQUIRED_ON_UPDATE = frozenset(
    {"name", "category_id", "frequency", "amount", "currency"}
)


class BillTemplateUpdate(BaseModel):
    name: BillName | None = None
    category_id: int | None = None
    frequency: BillFrequency | None = None
    interval: int | None = Field(None, ge=1, le=12)
    amount: Money | None = None
    currency: Currency | None = None
    due_day: int | None = Field(None, ge=1, le=31)
    due_month: int | None = Field(None, ge=1, le=12)  # month for annual/one_off
    end_period: str | None = Field(None, pattern=_PERIOD_RE)  # null clears the end
    notes: Notes | None = None
    recreate_deleted_future: bool = False  # transient control flag — not persisted
    due_days: DueDays | None = None  # null clears back to the single due_day
    dates: OneOffDates | None = None  # one-off only: the full new list of dates

    _normalize_days = field_validator("due_days", "dates")(_sorted_unique)

    @model_validator(mode="after")
    def _no_null_on_required_fields(self) -> "BillTemplateUpdate":
        # Omitted = unchanged; an explicit null on a NOT NULL column would
        # otherwise reach the DB and fail as a 500 (or a misleading 404).
        for field in _REQUIRED_ON_UPDATE & self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class BillTemplateOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    category: CategoryOut
    frequency: BillFrequency
    interval: int
    amount: Decimal
    currency: str
    due_day: int | None
    due_days: list[int] | None = None  # null = just due_day
    dates: list[date] = []  # one-off bills: their payment dates
    paid_dates: list[date] = []  # subset of `dates` that is already paid
    notes: str | None
    is_archived: bool
    created_at: datetime
    start_period: str | None = None
    end_period: str | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def due_month(self) -> int | None:
        if self.start_period:
            return int(self.start_period.split("-")[1])
        return None


class PaymentInstanceOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    bill_id: int
    period: str
    due_date: date
    amount: Decimal
    amount_overridden: bool = False  # amount set on this payment only
    status: PaymentStatus
    paid_at: datetime | None
    paid_amount: Decimal | None
    notes: str | None
    bill_name: str
    currency: str
    frequency: BillFrequency
    interval: int = 1
    category: CategoryOut
    email_sent_at: datetime | None
    is_last: bool = False  # final instalment of a fixed-term bill


class TrendPointOut(BaseModel):
    period: str
    currency: str
    paid: Decimal
    unpaid: Decimal


class MarkPaidRequest(BaseModel):
    paid_amount: Money | None = None  # defaults to template amount when None
    notes: Notes | None = None
    paid_at: date | None = None  # defaults to now() when None; must not be future


class PaymentInstanceUpdate(BaseModel):
    """Edit one payment; only fields present in the body change.

    Paid: paid_amount / paid_at / notes. Unpaid: amount / notes / due_date,
    where amount applies to this payment only (null clears it → follows the
    bill's amount).
    """

    amount: Money | None = None
    paid_amount: Money | None = None
    notes: Notes | None = None  # sent as null/"" clears the note
    paid_at: date | None = None  # must not be future
    due_date: date | None = (
        None  # unpaid only; must fall within the instance's period month
    )


class HasDeletedFutureOut(BaseModel):
    has_deleted_future: bool


class BackupCategory(BaseModel):
    id: int
    name: str
    slug: str | None
    color: str
    sort_order: int
    is_default: bool
    is_archived: bool


class BackupTemplate(BaseModel):
    id: int
    name: str
    # v4 backups carry category_id (resolved against this payload's own
    # `categories` array). v2/v3 backups carry the old free-text `category`
    # string instead — kept here so old files still parse; restore falls back
    # to matching it by slug against the user's current categories.
    category_id: int | None = None
    category: str | None = None
    # Lets bills restored without a `categories` section find a category by name.
    category_name: str | None = None
    frequency: BillFrequency
    interval: int = 1
    amount: Decimal
    currency: str
    due_day: int | None
    due_days: list[int] | None = None  # v8+: several payment days per cycle
    notes: str | None
    is_archived: bool
    start_period: str | None
    end_period: str | None = None
    created_at: str

    @model_validator(mode="before")
    @classmethod
    def _legacy_frequency(cls, data: object) -> object:
        # Pre-v6 backups: every_2_months / quarterly became monthly + interval.
        if isinstance(data, dict):
            legacy = {"every_2_months": 2, "quarterly": 3}.get(
                str(data.get("frequency"))
            )
            if legacy:
                data = {**data, "frequency": "monthly", "interval": legacy}
        return data


class BackupInstance(BaseModel):
    # Intentionally excluded from backup: reminder_sent_2_days_before,
    # reminder_sent_on_day, telegram_sent_*, email_sent_at — transient flags reset
    # to False on restore.
    id: int
    bill_id: int
    period: str
    slot: int = 0  # v8+: which of the template's days this payment is for
    due_date: str
    amount: Decimal
    status: PaymentStatus
    paid_at: str | None
    paid_amount: Decimal | None
    amount_override: Decimal | None = None
    notes: str | None
    created_at: str
    reminder_sent_upcoming: bool = False
    reminder_sent_overdue: bool = False


class BackupTelegram(BaseModel):
    """Plaintext on purpose: backups must restore on an instance with a different
    JWT_SECRET, so the token cannot travel in its encrypted-at-rest form."""

    bot_token: str
    chat_id: str

    @field_validator("bot_token")
    @classmethod
    def _token(cls, v: str) -> str:
        token = normalize_bot_token(v)
        if token is None:
            raise ValueError("bot_token must not be empty")
        return token

    @field_validator("chat_id")
    @classmethod
    def _chat(cls, v: str) -> str:
        chat_id = normalize_chat_id(v)
        if chat_id is None:
            raise ValueError("chat_id must not be empty")
        return chat_id


class BackupChannelSchedule(BaseModel):
    """One channel's (email or telegram) reminder schedule."""

    enabled: bool
    notify_2_days_before: bool
    notify_1_day_before: bool
    notify_on_day: bool
    notify_1_day_after: bool
    send_minute: int = Field(ge=0, le=1439)
    monthly_summary_enabled: bool


class BackupNotifications(BaseModel):
    email: BackupChannelSchedule | None = None
    telegram: BackupChannelSchedule | None = None
    browser_enabled: bool | None = None
    timezone: str | None = Field(default=None, max_length=64)


class BackupPreferences(BaseModel):
    language_preference: str | None = Field(default=None, max_length=5)
    enabled_languages: list[str] | None = None
    default_currency: str | None = Field(default=None, max_length=10)
    decimal_separator: Literal[".", ","] | None = None
    export_enabled: bool | None = None
    pdf_enabled: bool | None = None
    share_enabled: bool | None = None
    share_emails: ShareEmails | None = None
    export_fields: list[str] | None = None
    pdf_fields: list[str] | None = None

    @field_validator("enabled_languages")
    @classmethod
    def _langs(cls, v: list[str] | None) -> list[str] | None:
        if v is not None and (not v or any(not x or len(x) > 5 for x in v)):
            raise ValueError("enabled_languages must be non-empty language codes")
        return v

    @field_validator("export_fields", "pdf_fields")
    @classmethod
    def _export_fields(cls, v: list[str] | None) -> list[str] | None:
        return validate_export_fields(v)


class BackupPayload(BaseModel):
    schema_version: int
    # None = section absent from the file; restore leaves that data untouched.
    bill_templates: list[BackupTemplate] | None = None
    payment_instances: list[BackupInstance] | None = None
    preferences: BackupPreferences | None = None
    categories: list[BackupCategory] = []
    telegram: BackupTelegram | None = None
    notifications: BackupNotifications | None = None


class ExportSummaryOut(BaseModel):
    bill_count: int
    payment_count: int


class RestoreSnapshotOut(BaseModel):
    created_at: datetime


class RestoreResultOut(BaseModel):
    restored_templates: int
    restored_instances: int
