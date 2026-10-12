import base64
import hashlib
import logging
from datetime import datetime
from typing import Protocol
from urllib.parse import quote

import apprise
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings
from app.core.i18n import BRAND


class NotificationError(Exception):
    """Delivery failed; callers must not mark the notification as sent."""


def smtp_url(
    *,
    host: str,
    port: int,
    user: str | None,
    password: str | None,
    use_tls: bool,
    from_addr: str,
    to_addr: str,
) -> str:
    auth = f"{quote(user, safe='')}:{quote(password or '', safe='')}@" if user else ""
    mode = "starttls" if use_tls else "insecure"
    return (
        f"mailto://{auth}{host}:{port}"
        f"?mode={mode}&from={quote(from_addr, safe='')}&to={quote(to_addr, safe='')}"
    )


logger = logging.getLogger(__name__)


def _fernet() -> Fernet:
    # ponytail: key derived from JWT_SECRET — rotating it makes stored bot tokens
    # undecryptable (users re-enter them). Add a dedicated key if that hurts.
    digest = hashlib.sha256(settings.jwt_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str | None:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return None


class _TelegramUser(Protocol):
    id: int
    telegram_chat_id: str | None
    telegram_bot_token: str | None


def telegram_url(user: _TelegramUser) -> str | None:
    """Apprise URL for this user's bot and chat, or None if either is missing/unreadable."""
    if not user.telegram_chat_id or not user.telegram_bot_token:
        return None
    token = decrypt_secret(user.telegram_bot_token)
    if token is None:
        logger.warning("Cannot decrypt Telegram bot token for user %s", user.id)
        return None
    return f"tgram://{token}/{user.telegram_chat_id}"


def footer_text() -> str:
    """Single source for the app footer line (notifications and exports)."""
    return f"© {datetime.now().year} {BRAND["name"]} · {settings.app_version}"


def send(url: str, title: str, body: str, *, html: bool = False) -> None:
    footer = footer_text()
    body += (
        f'\n<p style="color:#94a3b8;font-size:12px">{footer}</p>'
        if html
        else f"\n\u200b\n{footer}"  # zero-width space: Apprise collapses blank lines
    )
    fmt = apprise.NotifyFormat.HTML if html else apprise.NotifyFormat.TEXT
    ap = apprise.Apprise()
    if not ap.add(url) or not ap.notify(title=title, body=body, body_format=fmt):
        raise NotificationError("apprise could not deliver the notification")
