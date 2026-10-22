---
project: paylark
researched_at: 2026-06-24
updated: 2026-09-23
recommended_platform: self-hosted-docker-compose
runner_up: railway
context_type: mvp
tech_stack:
  language: TypeScript + Python
  framework: Next.js 16 + FastAPI
  runtime: Node.js + Python 3.13
  database: PostgreSQL 17
---

## Recommendation

**Self-hosted Docker Compose with images published to GitHub Container Registry (GHCR).**

Deployment is three services (`postgres`, `backend`, `frontend`) plus an optional `demo` profile, defined in `docker-compose.yml` (build from source) and `docker-compose.prod.yml` (pulls `ghcr.io/marwin87/paylark-*:${PAYLARK_VERSION:-latest}`). Images are built and released by `.github/workflows/release.yml`; `ci.yml` runs build/lint/tests on PRs. Reference remote setup: a small VPS (e.g. Hetzner CX22, ~€4/mo) behind Cloudflare's free proxy tier for TLS. Serverless-only platforms (Vercel, Netlify, Workers) are excluded — APScheduler needs a persistent process. Runner-up if managed hosting is ever wanted: Railway (Postgres is already a separate service, so migration is straightforward).

## Operational Story

- **Preview/staging**: none platform-provided; test with `docker compose up --build`.
- **Secrets**: `.env` on the host (never committed). Production requires `ENVIRONMENT=production` and a strong `JWT_SECRET` (enables secure cookies, disables `/docs`).
- **Rollback**: pin `PAYLARK_VERSION` to a previous tag and `docker compose -f docker-compose.prod.yml up -d`. Migrations run automatically on backend start; reverse manually with `alembic downgrade -1` if needed.
- **Logs**: `docker compose logs -f --tail=100 <service>`.
- **Backups**: users can export JSON from Settings; server-side `pg_dump` via `docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"` on a cron is recommended. Restores also auto-snapshot current data (see `archive/history.md`, restore-auto-backup-safety-net).
- **Approval**: production actions (deploy, rollback, secret rotation) are human-only.

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `pg_dump` cron fails silently | M | H | Dry-run a restore on day 1; add a health-check ping |
| Postgres volume fills up | L | H | Disk-usage alert (>80%) |
| APScheduler stops without crashing | L | M | Monitor that reminders still send; consider a health endpoint exposing job count |
| Docker not autostarting after reboot | L | M | `systemctl enable docker`; `restart: unless-stopped` on services |
| GHCR images accidentally private | L | L | Set package visibility to Public after first push |
| Reminder timing shifts with DST | L | L | Server runs in UTC; settings UI shows server time |
| Deploy restart gap (5–10 s) | H | L | Acceptable for a household app |

## Out of Scope
Multi-region/HA, Nginx setup for non-Cloudflare TLS, SMTP provider choice, HTTPS/PWA setup for local-only deployments (see roadmap open questions).
