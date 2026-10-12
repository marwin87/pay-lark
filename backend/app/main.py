import asyncio
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logging.getLogger("app").setLevel(logging.INFO)

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.i18n import BRAND
from app.core.deps import csrf_token_valid
from app.routers import auth, bills, categories, export
from app.services.reminder_job import send_catchup_reminders, send_daily_reminders
from app.services.snapshot_cleanup import cleanup_old_snapshots

# Pre-session endpoints: no cookie session exists yet, so CSRF (which protects
# an existing session from being abused) doesn't apply.
_CSRF_EXEMPT_PATHS = {
    "/auth/register",
    "/auth/login",
    "/auth/forgot-password",
    "/auth/reset-password",
}
_CSRF_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        send_daily_reminders,
        "cron",
        minute="*",
        args=[SessionLocal],
    )
    scheduler.add_job(
        cleanup_old_snapshots,
        "cron",
        hour=3,
        args=[SessionLocal],
    )
    scheduler.start()
    # Run once on startup (non-blocking) so the current hour's reminders aren't missed after a restart
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, send_catchup_reminders, SessionLocal)
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title=f"{BRAND['name']} API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)


@app.middleware("http")
async def csrf_protect(request: Request, call_next):
    if (
        request.method in _CSRF_UNSAFE_METHODS
        and request.url.path not in _CSRF_EXEMPT_PATHS
        and not csrf_token_valid(request)
    ):
        return JSONResponse(
            {"detail": "CSRF token missing or invalid"}, status_code=403
        )
    return await call_next(request)


# Added after csrf_protect so it wraps outside it (Starlette's middleware stack
# is outermost-added-last) and can still attach CORS headers to the 403s above.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
    expose_headers=["X-Backup-Warning"],
)


app.include_router(auth.router)
app.include_router(bills.router)
app.include_router(categories.router)
app.include_router(export.router)


@app.get("/health")
def health():
    return {"status": "ok"}
