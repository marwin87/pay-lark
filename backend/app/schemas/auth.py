import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from app.core.i18n import LOCALES
from app.core.tz import is_valid_tz


def _check_language(v: str) -> str:
    if v not in LOCALES:
        raise ValueError(f"Unsupported language: {v}")
    return v


SupportedLanguage = Annotated[str, AfterValidator(_check_language)]


def _check_bcrypt_length(v: str) -> str:
    # bcrypt 5 raises on >72 bytes (would surface as a 500); count bytes, not chars.
    if len(v.encode()) > 72:
        raise ValueError("Password must be at most 72 bytes")
    return v


# Any password the API accepts or checks must fit bcrypt's 72-byte limit.
Password = Annotated[str, AfterValidator(_check_bcrypt_length)]


def _normalize_email(v: str) -> str:
    # Emails are stored and compared lowercased, so A@x.com and a@x.com are one account.
    return v.strip().lower()


NormalizedEmail = Annotated[EmailStr, AfterValidator(_normalize_email)]


def _dedupe(v: list[str]) -> list[str]:
    return list(dict.fromkeys(v))


# Saved share recipients, one per line in Settings and checkboxes in the share dialog.
ShareEmails = Annotated[
    list[NormalizedEmail], Field(max_length=20), AfterValidator(_dedupe)
]


def _check_timezone(v: str) -> str:
    if not is_valid_tz(v):
        raise ValueError(f"Unknown time zone: {v}")
    return v


TimeZoneName = Annotated[str, AfterValidator(_check_timezone)]

Theme = Literal["light", "dark", "vesperfall"]

EXPORT_FIELD_KEYS: tuple[str, ...] = (
    "bill",
    "category",
    "period",
    "due_date",
    "amount",
    "currency",
    "status",
    "paid_amount",
    "paid_at",
    "notes",
)
MANDATORY_EXPORT_FIELDS: frozenset[str] = frozenset(
    {"bill", "due_date", "amount", "currency"}
)
ExportFieldKey = Literal[
    "bill",
    "category",
    "period",
    "due_date",
    "amount",
    "currency",
    "status",
    "paid_amount",
    "paid_at",
    "notes",
]


def validate_export_fields(v: list[str] | None) -> list[str] | None:
    if v is None:
        return v
    if not set(v).issubset(EXPORT_FIELD_KEYS):
        raise ValueError("export_fields contains an unknown field key")
    if not MANDATORY_EXPORT_FIELDS.issubset(v):
        raise ValueError(
            f"export_fields must include: {', '.join(sorted(MANDATORY_EXPORT_FIELDS))}"
        )
    return v


class RegisterRequest(BaseModel):
    email: NormalizedEmail
    password: Annotated[Password, Field(min_length=8)]
    # The browser's zone. Advisory: an unknown value is ignored (the server default
    # applies) rather than failing the sign-up.
    timezone: str | None = None


class LoginRequest(BaseModel):
    email: NormalizedEmail
    password: Password


class UserProfileOut(BaseModel):
    model_config = {"from_attributes": True}

    email: EmailStr
    language_preference: str | None
    enabled_languages: list[SupportedLanguage]
    default_currency: str | None
    decimal_separator: Literal[".", ","]
    timezone: str
    theme: Theme
    email_reminders_enabled: bool
    notify_2_days_before: bool
    notify_1_day_before: bool
    notify_on_day: bool
    notify_1_day_after: bool
    reminder_send_minute: int
    monthly_summary_enabled: bool
    telegram_chat_id: str | None
    telegram_bot_token_set: bool
    telegram_bot_token_unreadable: bool
    telegram_reminders_enabled: bool
    telegram_notify_2_days_before: bool
    telegram_notify_1_day_before: bool
    telegram_notify_on_day: bool
    telegram_notify_1_day_after: bool
    telegram_send_minute: int
    telegram_monthly_summary_enabled: bool
    browser_notifications_enabled: bool
    export_enabled: bool
    pdf_enabled: bool
    share_enabled: bool
    share_emails: list[str]
    export_fields: list[ExportFieldKey]
    pdf_fields: list[ExportFieldKey]


def normalize_chat_id(v: str | None) -> str | None:
    v = (v or "").strip()
    if not v:
        return None  # empty string clears the chat id
    if not re.fullmatch(r"-?\d{1,20}", v):
        raise ValueError("Telegram chat id must be a number (negative for groups)")
    return v


def normalize_bot_token(v: str | None) -> str | None:
    v = (v or "").strip()
    if not v:
        return None
    if not re.fullmatch(r"\d{5,}:[A-Za-z0-9_-]{20,}", v):
        raise ValueError("Invalid Telegram bot token format")
    return v


# Columns where null is a valid "clear it" (everything else is NOT NULL).
_NULLABLE_PROFILE_FIELDS = frozenset(
    {
        "language_preference",
        "default_currency",
        "telegram_chat_id",
        "telegram_bot_token",
    }
)


class UserProfileUpdate(BaseModel):
    language_preference: SupportedLanguage | None = None
    enabled_languages: list[SupportedLanguage] | None = None
    default_currency: str | None = None
    decimal_separator: Literal[".", ","] | None = None
    timezone: TimeZoneName | None = None
    theme: Theme | None = None
    email_reminders_enabled: bool | None = None
    notify_2_days_before: bool | None = None
    notify_1_day_before: bool | None = None
    notify_on_day: bool | None = None
    notify_1_day_after: bool | None = None
    reminder_send_minute: Annotated[int, Field(ge=0, le=1439)] | None = None
    monthly_summary_enabled: bool | None = None
    telegram_chat_id: str | None = None
    telegram_bot_token: str | None = None  # write-only; "" clears
    telegram_reminders_enabled: bool | None = None
    telegram_notify_2_days_before: bool | None = None
    telegram_notify_1_day_before: bool | None = None
    telegram_notify_on_day: bool | None = None
    telegram_notify_1_day_after: bool | None = None
    telegram_send_minute: Annotated[int, Field(ge=0, le=1439)] | None = None
    telegram_monthly_summary_enabled: bool | None = None
    browser_notifications_enabled: bool | None = None
    export_enabled: bool | None = None
    pdf_enabled: bool | None = None
    share_enabled: bool | None = None
    share_emails: ShareEmails | None = None
    export_fields: list[ExportFieldKey] | None = None
    pdf_fields: list[ExportFieldKey] | None = None

    @model_validator(mode="after")
    def _no_null_on_required_fields(self) -> "UserProfileUpdate":
        # Omitted = unchanged. An explicit null is only meaningful for the nullable
        # columns (it clears them); on the NOT NULL ones it would reach the DB and
        # fail as a 500.
        for field in self.model_fields_set - _NULLABLE_PROFILE_FIELDS:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self

    @field_validator("telegram_chat_id")
    @classmethod
    def _chat_id(cls, v: str | None) -> str | None:
        return normalize_chat_id(v)

    @field_validator("telegram_bot_token")
    @classmethod
    def _bot_token(cls, v: str | None) -> str | None:
        return normalize_bot_token(v)

    @field_validator("export_fields", "pdf_fields")
    @classmethod
    def _export_fields(cls, v: list[str] | None) -> list[str] | None:
        return validate_export_fields(v)


class ChangePasswordRequest(BaseModel):
    current_password: Password
    new_password: Password


class DeleteAccountRequest(BaseModel):
    current_password: Password


class ChangeEmailRequest(BaseModel):
    new_email: NormalizedEmail
    current_password: Password


class SendNotificationNowOut(BaseModel):
    sent: int


class SendMonthlySummaryNowOut(BaseModel):
    sent: bool


class ShareMonthRequest(BaseModel):
    emails: Annotated[ShareEmails, Field(min_length=1)]
    month: Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


class ServerTimeOut(BaseModel):
    server_time: datetime


class ForgotPasswordRequest(BaseModel):
    email: NormalizedEmail


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: Password


class SmtpStatusResponse(BaseModel):
    configured: bool


class MessageResponse(BaseModel):
    message: str
