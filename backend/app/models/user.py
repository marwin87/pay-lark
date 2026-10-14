from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UTCDateTime
from app.services.notify import decrypt_secret

if TYPE_CHECKING:
    from app.models.bill import BillTemplate
    from app.models.category import Category


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Bumped on logout to invalidate every previously issued JWT for this user.
    token_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    language_preference: Mapped[str | None] = mapped_column(
        String(5), nullable=True, default=None
    )
    enabled_languages: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        server_default='["en","pl","de","es","it","fr","zh","nl","pt"]',
    )
    # IANA zone name; "today", the month and the reminder send time follow it.
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, default="UTC", server_default="UTC"
    )
    default_currency: Mapped[str | None] = mapped_column(
        String(10), nullable=True, default=None
    )
    decimal_separator: Mapped[str] = mapped_column(
        String(1), nullable=False, default=".", server_default="."
    )
    theme: Mapped[str] = mapped_column(
        String(20), nullable=False, default="light", server_default="light"
    )
    email_reminders_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="true"
    )
    notify_2_days_before: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    notify_1_day_before: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="true"
    )
    notify_on_day: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    notify_1_day_after: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    reminder_send_minute: Mapped[int] = mapped_column(
        nullable=False, default=480, server_default="480"
    )
    monthly_summary_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="true"
    )
    monthly_summary_last_sent: Mapped[str | None] = mapped_column(
        String(7), nullable=True, default=None, server_default="null"
    )
    # Telegram has its own schedule, independent of the email settings above.
    telegram_reminders_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="true"
    )
    telegram_notify_2_days_before: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    telegram_notify_1_day_before: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="true"
    )
    telegram_notify_on_day: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    telegram_notify_1_day_after: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    telegram_send_minute: Mapped[int] = mapped_column(
        nullable=False, default=480, server_default="480"
    )
    telegram_monthly_summary_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="true"
    )
    telegram_monthly_summary_last_sent: Mapped[str | None] = mapped_column(
        String(7), nullable=True, default=None
    )
    # Browser notifications: the preference lives on the server (so it is backed up
    # and follows the user); the OS/browser permission is still per-browser.
    browser_notifications_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    export_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    pdf_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    share_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    share_emails: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, server_default="[]"
    )
    export_fields: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        server_default='["bill","category","period","due_date","amount","currency","status","paid_amount","paid_at","notes"]',
    )
    pdf_fields: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        server_default='["bill","category","period","due_date","amount","currency","status","paid_amount","paid_at","notes"]',
    )
    telegram_chat_id: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None
    )
    # Fernet-encrypted (app.services.notify); never returned by the API.
    telegram_bot_token: Mapped[str | None] = mapped_column(
        String(512), nullable=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(timezone.utc)
    )

    @property
    def telegram_bot_token_set(self) -> bool:
        """A token is stored AND can be decrypted with the current JWT_SECRET."""
        return (
            self.telegram_bot_token is not None
            and decrypt_secret(self.telegram_bot_token) is not None
        )

    @property
    def telegram_bot_token_unreadable(self) -> bool:
        """Stored, but undecryptable (JWT_SECRET changed): the user must re-enter it."""
        return self.telegram_bot_token is not None and not self.telegram_bot_token_set

    bills: Mapped[list[BillTemplate]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    categories: Mapped[list[Category]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


# Case-insensitive uniqueness; emails are also lowercased on input (schemas/auth.py).
Index("uq_users_email_lower", func.lower(User.email), unique=True)
