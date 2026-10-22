---
starter_id: next
package_manager: npm
project_name: paylark
hints:
  language_family: multi
  team_size: solo
  deployment_target: self-host
  ci_provider: github-actions
  ci_default_flow: build-and-release-on-tag
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: false
    can_judge_agent: true
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: true
---

## Why this stack

PayLark is a solo, after-hours project with auth, background tasks
(auto-generated payment instances, email reminders, monthly summary), Excel/JSON
export/restore, and a self-hosted Docker Compose deployment target.
The stack is intentionally polyglot: Next.js 16 (TypeScript, App Router,
Tailwind 4, next-intl for 7 locales) is the frontend and primary scaffolding
layer — it passes all four agent-friendly gates and ships from an official CLI
(create-next-app); FastAPI (Python 3.13, Pydantic, SQLAlchemy 2.0, Alembic, uv)
handles the API, OpenPyXL export, cookie-based JWT auth, APScheduler jobs and
SMTP email. Both starters pass all four quality gates. Bootstrapper scaffolded
the Next.js shell; the FastAPI backend was added as a second service.

## Current shape (as of 2026-09-23)

- **Services** (`docker-compose.yml`, `docker-compose.prod.yml`): `postgres` (official PostgreSQL 17 image, own service since I-01), `backend` (FastAPI + Alembic auto-migrate on start), `frontend` (Next.js), optional `demo` profile with seed data. Ports: backend 8010, frontend 3010.
- **Auth**: JWT in an HttpOnly cookie (plus presence flag cookie); password reset via SMTP. All outbound mail goes through Apprise (`backend/app/services/notify.py`), the seam for future channels (Telegram).
- **Testing**: backend pytest against real PostgreSQL (`backend/tests/`); Playwright e2e in `frontend/tests/e2e/` (see `test-plan.md`).
- **CI/CD**: GitHub Actions — `ci.yml` (env guard, frontend lint+build, backend black/mypy/pytest, Docker build + Playwright e2e) and `release.yml` (multi-arch images to GHCR on version tags). No auto-deploy: self-hosters pull tagged images (`infrastructure.md`).
- **Deployment target**: self-host; no Cloudflare/Vercel lock-in.
