import warnings

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.tz import is_valid_tz

_DEFAULT_JWT_SECRET = "changeme-use-a-long-random-string"
_MIN_JWT_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    # Gates cookie `secure`, JWT secret strength, and password-reset token
    # expiry checks below. Must be set to a non-"development" value on real
    # deployments — see .env.example.
    environment: str = "development"

    # Baked in at image build (same value as the frontend footer); shown in notification footers.
    app_version: str = "dev"

    database_url: str = "sqlite:///./paylark.db"

    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # CORS — JSON array in env var, e.g. ALLOWED_ORIGINS=["https://app.example.com"]
    allowed_origins: list[str] = ["http://localhost:3010", "http://localhost:3000"]

    # SMTP (optional)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
    smtp_use_tls: bool = True
    reminder_from: str | None = None

    # Email domain blocklist — addresses whose domain matches are silently skipped
    # by the reminder/summary scheduler. Set via EMAIL_BLOCKED_DOMAINS as a JSON
    # array, e.g. '["test.com","example.com"]'. Defaults cover E2E test addresses.
    email_blocked_domains: list[str] = ["test.com", "example.com"]

    # Password reset
    app_base_url: str = "http://localhost:3010"
    password_reset_token_expire_minutes: int = 60

    # Time zone given to accounts that don't supply a valid one (and to existing
    # accounts by the migration that introduced per-user zones). IANA name.
    default_timezone: str = "UTC"

    # Brute-force / abuse protection on the auth endpoints (see core/rate_limit.py).
    rate_limit_enabled: bool = True

    # Restore safety net — how long a pre-restore snapshot stays recoverable
    restore_snapshot_retention_days: int = 7

    @field_validator("password_reset_token_expire_minutes")
    @classmethod
    def warn_if_no_token_expiry(cls, v: int, info) -> int:
        if v == 0:
            if info.data.get("environment", "development") != "development":
                raise ValueError(
                    "PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=0 (never expire) is not allowed "
                    "outside ENVIRONMENT=development."
                )
            warnings.warn(
                "PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=0: reset tokens never expire. "
                "Only use this in development/testing.",
                stacklevel=2,
            )
        return v

    @field_validator("default_timezone")
    @classmethod
    def default_timezone_must_exist(cls, v: str) -> str:
        if not is_valid_tz(v):
            raise ValueError(
                f"DEFAULT_TIMEZONE={v!r} is not a valid IANA time zone "
                "(e.g. UTC or Europe/Warsaw)."
            )
        return v

    @property
    def docs_enabled(self) -> bool:
        """API docs (Swagger/ReDoc/OpenAPI schema) are dev-only — same
        environment gate as the cookie/secret hardening above."""
        return self.environment.lower() == "development"

    @field_validator("jwt_secret")
    @classmethod
    def jwt_secret_must_be_strong(cls, v: str, info) -> str:
        is_weak = v == _DEFAULT_JWT_SECRET or len(v) < _MIN_JWT_SECRET_LENGTH
        if is_weak:
            if info.data.get("environment", "development") != "development":
                raise ValueError(
                    f"JWT_SECRET is missing or too weak (must be a random string of at "
                    f"least {_MIN_JWT_SECRET_LENGTH} characters). Set a strong random "
                    "value via the JWT_SECRET environment variable."
                )
            warnings.warn(
                "JWT_SECRET is weak or the default placeholder — insecure outside development.",
                stacklevel=2,
            )
        return v


settings = Settings()
