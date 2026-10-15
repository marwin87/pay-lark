import secrets

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

# auto_error=False so we can fall through to cookie auth when header is absent.
bearer = HTTPBearer(auto_error=False)


def current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    # Accept token from Authorization header OR HttpOnly cookie.
    token: str | None = None
    if creds is not None:
        token = creds.credentials
    else:
        token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    try:
        user_id, token_version = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from None
    user = db.get(User, int(user_id))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    # Logout bumps token_version, invalidating every token issued before it.
    if token_version != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    return user


def csrf_token_valid(request: Request) -> bool:
    """Double-submit CSRF check for cookie-authenticated mutating requests.

    Bearer-token clients (tests, non-browser clients) aren't cookie-based and
    so aren't exposed to CSRF — they're exempt. A request with no access_token
    cookie at all isn't an authenticated cookie session either — it's exempt
    too, and falls through to the route's own 401 (current_user), rather than
    this returning a misleading 403 for a request that never claimed a session.
    Used by the CSRF middleware in main.py, applied to every unsafe-method route.
    """
    if request.headers.get("authorization"):
        return True
    if not request.cookies.get("access_token"):
        return True
    cookie = request.cookies.get("csrf_token")
    header = request.headers.get("x-csrf-token")
    # `is not None` (not `bool(...)`) so mypy actually narrows cookie/header
    # to `str` before they reach compare_digest, which doesn't accept None.
    return (
        cookie is not None
        and header is not None
        and secrets.compare_digest(cookie, header)
    )
