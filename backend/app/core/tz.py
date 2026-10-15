from datetime import UTC, date, datetime
from typing import Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def is_valid_tz(name: str | None) -> bool:
    """True for a real IANA zone name (e.g. "Europe/Warsaw")."""
    if not name or not name.strip() or name != name.strip():
        return False
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        # ValueError: malformed key (".."); OSError: a name that hits a directory
        return False
    return True


class _HasTimezone(Protocol):
    timezone: str


def _utcnow() -> datetime:
    """The one clock the helpers below read, so tests can pin it."""
    return datetime.now(UTC)


def user_tz(user: _HasTimezone) -> ZoneInfo:
    # A stored name that stopped resolving (tz database change) must not take the
    # whole API down; UTC is the safe reading.
    return ZoneInfo(user.timezone) if is_valid_tz(user.timezone) else ZoneInfo("UTC")


def now_for(user: _HasTimezone) -> datetime:
    return _utcnow().astimezone(user_tz(user))


def today_for(user: _HasTimezone) -> date:
    """The calendar date it is for this user right now."""
    return now_for(user).date()
