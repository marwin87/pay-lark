# Repository Guidelines

Pay Tracker is a household bill-tracking PWA. Stack: Next.js 16 (App Router, TypeScript, Tailwind) frontend, FastAPI + Python 3.13 backend, SQLite (file on the `app_data` Compose volume).

## Hard Rules

- **Next.js 16 has breaking changes from training data.** Before writing any frontend code, read `@frontend/AGENTS.md` — its warning is load-bearing.
- **Recurrence auto-generation is idempotent.** The key is `(bill_id, period)`. Never insert a `PaymentInstance` without checking for an existing row on that pair — see `@backend/app/services/recurrence.py`.
- **Archive templates, never delete.** Set `is_archived = True` on `BillTemplate`; hard deletes cascade to payment history.
- **Migrations run automatically on container start.** `alembic upgrade head` fires in the backend container's start command (`backend/Dockerfile`), before uvicorn. New model changes require a new revision: `docker compose exec backend alembic revision --autogenerate -m "<desc>"`.
- **i18n has one source: `frontend/messages/`.** Languages live in `locales.json`, strings in `<code>.json`. Backend reads them via `app.core.i18n` (`t()`, `LOCALES`) — never add per-language dicts in Python or a second language list. Adding a language: JSON file + `locales.json` entry + import/map entry in `frontend/src/lib/locales.ts`.
- **Help/FAQ stays current.** Any user-visible change (new button, flow, setting, renamed label) must update the `Help` strings in all `frontend/messages/*.json` (items + `checklist`) and `SECTIONS` in `frontend/src/components/help/HelpContent.tsx`, in the same change. Reference button/tab names via the `labels` map, never hardcode them.
- **Use SQLAlchemy 2.0 `Mapped[T]` / `mapped_column()` style.** The 1.x `Column()` pattern will pass linting but is wrong for this codebase — see `@backend/app/models/bill.py`.

## Project Structure

```
frontend/   Next.js 16 PWA — App Router, src/, Tailwind
backend/    FastAPI — app/{routers,models,schemas,services,core}/, alembic/, tests/
demo/       Seed data + demo image
context/    10x workflow artifacts (foundation/ PRD, tech-stack, roadmap, test-plan; archive/history.md)
SQLite     single file /data/paytracker.db, `app_data` named volume
```

See `@context/foundation/prd.md` for domain rules and `@context/foundation/tech-stack.md` for stack rationale.

## Build & Development Commands

- `docker compose up --build` — start everything (backend `8010`, frontend `3010`)
- `docker compose down -v && docker compose up --build` — clean start, wipes DB volume
- `cd frontend && npm run dev` — frontend only, no Docker
- `cd backend && uv run uvicorn app.main:app --reload` — backend only, no Docker
- `cd frontend && npm run lint` — ESLint
- `docker compose exec backend alembic revision --autogenerate -m "<desc>"` — new migration (then `upgrade head`)

API docs: `http://localhost:8010/docs`.

## Coding Style & Conventions

- **Frontend:** No `any`. Do not add a `pages/` directory — this project is App Router only. Components in `frontend/src/`.
- **Backend:** All request/response types use Pydantic schemas in `backend/app/schemas/`. Never use raw dicts as router return types. Routers in `backend/app/routers/`, business logic in `backend/app/services/`.
- **Env vars:** copy `.env.example` → `.env`; never commit `.env`.

## Pre-commit Hooks

After cloning, install the hooks once:

```bash
pip install pre-commit
pre-commit install          # file-staged secrets scan on git commit
pre-commit install --hook-type commit-msg   # conventional-commit lint on commit message
```

Hooks defined in `.pre-commit-config.yaml`:
- `detect-secrets` — prevents accidental secret commits; baseline in `.secrets.baseline`
- Test passwords/tokens (any literal near `password`, `secret`, `token`) trip `detect-secrets`: define each once as a module constant with `# pragma: allowlist secret` (see `_PASSWORD` in `backend/tests/test_rate_limit.py`) and reuse it. The pragma must sit on the line holding the literal — formatters move it when they reflow multi-line statements. Check before staging: `git diff --cached --name-only | xargs detect-secrets-hook --baseline .secrets.baseline`.
- `conventional-pre-commit` — enforces Conventional Commits message format

To update the secrets baseline after an intentional addition: `detect-secrets scan > .secrets.baseline`.

## Changelog

`CHANGELOG.md` entries are one short line each — what the user gets, no implementation details, limits or caveats.

## Commit Guidelines

Conventional Commits format required: `type(scope): subject` — e.g. `fix(pre-commit): restore project-specific hooks`. Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`. One-line subject under 72 characters. Reference the PRD FR number in the body when implementing a functional requirement (e.g. `Implements FR-009`).
