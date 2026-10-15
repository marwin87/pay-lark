from datetime import UTC, datetime, timedelta

import bcrypt
from jose import jwt

from app.core.config import settings

# Ties an access token to this specific backend/app pair, so a token minted
# for some other issuer/audience (a different deployment sharing the same
# secret by mistake, say) is rejected outright rather than merely trusted on
# signature alone.
_TOKEN_ISSUER = "pay-tracker"
_TOKEN_AUDIENCE = "pay-tracker-app"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# Verified against when a login names an unknown email, so that path costs a bcrypt
# check like a real one and response time doesn't reveal whether the account exists.
DUMMY_PASSWORD_HASH = hash_password("not-a-real-password")


def create_access_token(subject: str, token_version: int) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {
            "sub": subject,
            "ver": token_version,
            "exp": expire,
            "iss": _TOKEN_ISSUER,
            "aud": _TOKEN_AUDIENCE,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str) -> tuple[str, int]:
    # python-jose only checks aud/iss when the token actually carries those
    # claims — a token with neither would otherwise pass straight through.
    # require_aud/require_iss make their absence a rejection too.
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        audience=_TOKEN_AUDIENCE,
        issuer=_TOKEN_ISSUER,
        options={"require_aud": True, "require_iss": True},
    )
    return str(payload["sub"]), int(payload.get("ver", 0))
