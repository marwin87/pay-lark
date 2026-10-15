import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core import rate_limit
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import current_user
from app.core.i18n import BRAND
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    hash_password,
    verify_password,
)
from app.core.tz import is_valid_tz, today_for
from app.models.reset_token import PasswordResetToken
from app.models.user import User
from app.schemas.auth import (
    ChangeEmailRequest,
    ChangePasswordRequest,
    DeleteAccountRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    SendMonthlySummaryNowOut,
    SendNotificationNowOut,
    ServerTimeOut,
    ShareMonthRequest,
    SmtpStatusResponse,
    UserProfileOut,
    UserProfileUpdate,
)
from app.services.categories import seed_default_categories
from app.services.email import send_password_reset_email
from app.services.notify import NotificationError, encrypt_secret, telegram_url
from app.services.notify import send as notify_send
from app.services.reminder_job import (
    EMAIL,
    TELEGRAM,
    Channel,
    _is_blocked_domain,
    send_monthly_summary_for_user,
    send_reminders_for_user,
)

_logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_HOUR = 3600
_LOGIN_WINDOW = 900  # 15 min
_LOGIN_FAILS_PER_EMAIL = 10
_LOGIN_FAILS_PER_IP = 100  # generous: a shared proxy/NAT address can front many users
_PASSWORD_FAILS_PER_USER = 10  # change-password + delete-account share one budget
_REGISTER_PER_IP_HOUR = 10
_FORGOT_PER_IP_HOUR = 10
_FORGOT_PER_EMAIL_HOUR = 3  # stops mail-bombing one victim
_RESET_PER_IP_WINDOW = 20


def _set_auth_cookie(response: Response, token: str) -> None:
    """Set the JWT as an HttpOnly cookie plus a non-HttpOnly presence flag."""
    secure = settings.environment != "development"
    max_age = settings.access_token_expire_minutes * 60
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=max_age,
    )
    # Non-HttpOnly presence flag so the frontend can detect login state without XSS risk.
    response.set_cookie(
        key="auth_logged_in",
        value="1",
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=max_age,
    )
    # Non-HttpOnly double-submit CSRF token — the frontend echoes this back in
    # an X-CSRF-Token header on mutating requests (see core/deps.py:verify_csrf).
    response.set_cookie(
        key="csrf_token",
        value=secrets.token_urlsafe(32),
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=max_age,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="auth_logged_in", path="/")
    response.delete_cookie(key="csrf_token", path="/")


@router.post(
    "/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED
)
def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    rate_limit.hit(
        f"register:{rate_limit.client_ip(request)}", _REGISTER_PER_IP_HOUR, _HOUR
    )
    # Deliberately says so: a signup form that can't tell you the address is taken is
    # worse UX. This leaks account existence; hiding it needs email verification, and
    # the register rate limit above is what bounds enumeration.
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    zone = body.timezone if is_valid_tz(body.timezone) else settings.default_timezone
    user = User(
        email=body.email, password_hash=hash_password(body.password), timezone=zone
    )
    db.add(user)
    db.flush()
    seed_default_categories(db, user.id)
    db.commit()
    db.refresh(user)
    token = create_access_token(str(user.id), user.token_version)
    _set_auth_cookie(response, token)
    return MessageResponse(message="ok")  # the JWT travels only in the HttpOnly cookie


@router.post("/login", response_model=MessageResponse)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    # Only failures count, keyed by the submitted email whether or not it exists,
    # so neither a legitimate user nor account existence is affected/revealed.
    ip_key = f"login:ip:{rate_limit.client_ip(request)}"
    email_key = f"login:email:{body.email}"
    rate_limit.check(ip_key, _LOGIN_FAILS_PER_IP, _LOGIN_WINDOW)
    rate_limit.check(email_key, _LOGIN_FAILS_PER_EMAIL, _LOGIN_WINDOW)
    user = db.query(User).filter(User.email == body.email).first()
    # Always run one bcrypt check (against a dummy hash if there is no such user),
    # so a missing account isn't distinguishable by response time.
    password_ok = verify_password(
        body.password, user.password_hash if user else DUMMY_PASSWORD_HASH
    )
    if not user or not password_ok:
        rate_limit.record(ip_key, _LOGIN_WINDOW)
        rate_limit.record(email_key, _LOGIN_WINDOW)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(str(user.id), user.token_version)
    _set_auth_cookie(response, token)
    return MessageResponse(message="ok")  # the JWT travels only in the HttpOnly cookie


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # Invalidates every token issued for this user, not just the current one.
    user.token_version += 1
    db.commit()
    _clear_auth_cookies(response)


@router.get("/me", response_model=UserProfileOut)
def get_me(user: User = Depends(current_user)):
    return user


@router.patch("/me", response_model=UserProfileOut)
def update_me(
    body: UserProfileUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # UserProfileUpdate is the security boundary — only fields declared there are patchable.
    updates = body.model_dump(exclude_unset=True)
    if "enabled_languages" in updates or "language_preference" in updates:
        effective_lang = updates.get("language_preference", user.language_preference)
        effective_enabled = updates.get("enabled_languages", user.enabled_languages)
        if effective_lang and effective_lang not in effective_enabled:
            raise HTTPException(
                status_code=422,
                detail="The active language must be one of the enabled languages",
            )
    if "telegram_bot_token" in updates:
        token = updates.pop("telegram_bot_token")
        user.telegram_bot_token = encrypt_secret(token) if token else None
    for field, value in updates.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


def _check_current_password(user: User, password: str) -> None:
    # Only failures count, so a stolen session can't brute-force the password
    # through these re-auth endpoints.
    key = f"pwd:user:{user.id}"
    rate_limit.check(key, _PASSWORD_FAILS_PER_USER, _LOGIN_WINDOW)
    if not verify_password(password, user.password_hash):
        rate_limit.record(key, _LOGIN_WINDOW)
        raise HTTPException(status_code=401, detail="Current password is incorrect")


@router.delete("/users/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    body: DeleteAccountRequest,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # Irreversible, so a stolen session alone must not be enough.
    _check_current_password(user, body.current_password)
    db.delete(user)
    db.commit()
    _clear_auth_cookies(response)


@router.patch("/change-password", status_code=status.HTTP_200_OK)
def change_password(
    body: ChangePasswordRequest,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    _check_current_password(user, body.current_password)
    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="New password must be at least 8 characters",
        )
    user.password_hash = hash_password(body.new_password)
    # Revokes every other session; this one gets a fresh token so it stays logged in.
    user.token_version += 1
    db.commit()
    _set_auth_cookie(response, create_access_token(str(user.id), user.token_version))


def _channel_or_400(user: User, name: str) -> Channel:
    if name == "telegram":
        if not telegram_url(user):
            raise HTTPException(status_code=400, detail="Telegram not configured")
        return TELEGRAM
    if settings.smtp_host is None:
        raise HTTPException(status_code=400, detail="SMTP not configured")
    return EMAIL


@router.post("/send-notification-now", response_model=SendNotificationNowOut)
def send_notification_now(
    channel: Literal["email", "telegram"] = "email",
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ch = _channel_or_400(user, channel)
    if not getattr(user, ch.enabled):
        return SendNotificationNowOut(sent=0)
    return SendNotificationNowOut(
        sent=send_reminders_for_user(db, user, ch, force=True)
    )


@router.post("/send-monthly-summary-now", response_model=SendMonthlySummaryNowOut)
def send_monthly_summary_now(
    channel: Literal["email", "telegram"] = "email",
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ch = _channel_or_400(user, channel)
    if not getattr(user, ch.enabled) or not getattr(user, ch.summary_enabled):
        return SendMonthlySummaryNowOut(sent=False)
    current_month = today_for(user).strftime("%Y-%m")
    sent = send_monthly_summary_for_user(db, user, current_month, ch)
    return SendMonthlySummaryNowOut(sent=sent)


_SHARE_LIMIT = 10  # sends per user per hour
_share_sent: dict[int, list[datetime]] = {}


@router.post("/share-month", response_model=SendMonthlySummaryNowOut)
def share_month(
    body: ShareMonthRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    _channel_or_400(user, "email")
    if not user.share_enabled:
        raise HTTPException(status_code=403, detail="Sharing by email is disabled")
    if any(_is_blocked_domain(e) for e in body.emails):
        raise HTTPException(status_code=400, detail="Recipient domain not allowed")
    # ponytail: per-process memory, resets on restart; move to DB/redis if multi-worker
    cutoff = datetime.now(UTC) - timedelta(hours=1)
    recent = [ts for ts in _share_sent.get(user.id, []) if ts > cutoff]
    if len(recent) + len(body.emails) > _SHARE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many shares, try later")
    now = datetime.now(UTC)
    _share_sent[user.id] = recent + [now] * len(body.emails)
    results = [
        send_monthly_summary_for_user(db, user, body.month, EMAIL, e)
        for e in body.emails
    ]
    sent = all(results)
    return SendMonthlySummaryNowOut(sent=sent)


@router.get("/server-time", response_model=ServerTimeOut)
def server_time(_: User = Depends(current_user)):
    return ServerTimeOut(server_time=datetime.now(UTC))


@router.patch("/change-email", response_model=UserProfileOut)
def change_email(
    body: ChangeEmailRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    existing = db.query(User).filter(User.email == body.new_email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user.email = body.new_email
    db.commit()
    db.refresh(user)
    return user


@router.get("/smtp-status", response_model=SmtpStatusResponse)
def smtp_status():
    return SmtpStatusResponse(configured=settings.smtp_host is not None)


@router.post("/send-telegram-test", response_model=MessageResponse)
def send_telegram_test(user: User = Depends(current_user)):
    url = telegram_url(user)
    if url is None:
        raise HTTPException(status_code=400, detail="Telegram not configured")
    try:
        notify_send(url, BRAND["name"], "✅ Telegram notifications are working.")
    except NotificationError:
        raise HTTPException(
            status_code=502, detail="Telegram delivery failed"
        ) from None
    return MessageResponse(message="sent")


_FORGOT_PASSWORD_RESPONSE = MessageResponse(
    message="If that email is registered, you'll receive a reset link shortly."
)


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(
    body: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)
):
    rate_limit.hit(
        f"forgot:ip:{rate_limit.client_ip(request)}", _FORGOT_PER_IP_HOUR, _HOUR
    )
    rate_limit.hit(f"forgot:email:{body.email}", _FORGOT_PER_EMAIL_HOUR, _HOUR)
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        return _FORGOT_PASSWORD_RESPONSE

    # Invalidate any existing tokens for this user before issuing a new one.
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).delete()

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    if settings.password_reset_token_expire_minutes > 0:
        expires_at = datetime.now(UTC) + timedelta(
            minutes=settings.password_reset_token_expire_minutes
        )
    else:
        expires_at = None

    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
    )
    db.commit()

    if settings.smtp_host:
        reset_url = f"{settings.app_base_url}/reset-password#token={raw_token}"
        try:
            send_password_reset_email(
                smtp_host=settings.smtp_host,
                smtp_port=settings.smtp_port,
                smtp_user=settings.smtp_user,
                smtp_password=(
                    settings.smtp_password.get_secret_value()
                    if settings.smtp_password
                    else None
                ),
                smtp_use_tls=settings.smtp_use_tls,
                from_addr=settings.reminder_from or "",
                to_addr=user.email,
                reset_url=reset_url,
                language=user.language_preference or "en",
                expires_minutes=settings.password_reset_token_expire_minutes,
            )
        except Exception:
            _logger.exception("Failed to send password reset email to user %s", user.id)

    return _FORGOT_PASSWORD_RESPONSE


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    body: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)
):
    rate_limit.hit(
        f"reset:ip:{rate_limit.client_ip(request)}", _RESET_PER_IP_WINDOW, _LOGIN_WINDOW
    )
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    token_row = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == token_hash)
        .first()
    )
    if not token_row:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if token_row.expires_at and token_row.expires_at < datetime.now(UTC):
        db.delete(token_row)
        db.commit()
        raise HTTPException(status_code=400, detail="Reset token has expired")

    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=400, detail="Password must be at least 8 characters"
        )

    user = db.query(User).filter(User.id == token_row.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user.password_hash = hash_password(body.new_password)
    user.token_version += 1  # a reset implies possible compromise: drop all sessions
    db.delete(token_row)
    db.commit()

    return MessageResponse(message="Password updated successfully.")
