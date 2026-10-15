from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.user import User


class Category(Base):
    """A bill category. Every user owns their own set, seeded from
    DEFAULT_CATEGORIES at registration; users may add/rename/recolor/archive
    their own on top of that starter set."""

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    # Stable key for the seeded defaults (e.g. "housing", "other"), used to look up
    # the translated label client-side and to remap legacy (pre-categories-table)
    # backups on restore. NULL for user-created categories — free-text `name` only.
    slug: Mapped[str | None] = mapped_column(String(50), nullable=True)
    color: Mapped[str] = mapped_column(String(50), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=lambda: datetime.now(UTC)
    )

    user: Mapped[User] = relationship(back_populates="categories")
