# Archive history

Condensed record of every completed change (26 folders compressed on 2026-09-23, later entries added as changes are folded in). Full plans, research and reviews are in git history: `git log --all -- context/archive/<date>-<change-id>`.

Convention: `/10x-archive` still moves new changes into `context/archive/<date>-<id>/`. Periodically fold them into this file (one entry each, newest last) and delete the folders.

## db-schema-migration (2026-06-11)
**Outcome:** Fixed the BillTemplate/PaymentInstance model gaps and generated the initial Alembic migration creating users, bill_templates and payment_instances.
**Key decisions:**
- Added `category` as free-text `String(100)`, nullable; renamed `auto_generate` to `is_paused` (default False).
- Enforced `UNIQUE(bill_id, period)` at DB level (idempotency hard rule).
- No user FK on templates: flat household access model per PRD.
**Pitfalls/lessons:**
- Review: `instance.template` must be read before `db.commit()` in `mark_paid` (expire_on_commit); router comment added so nobody adds user_id scoping as a "fix".
**Files/areas:** backend/app/models/, backend/app/schemas/, backend/app/routers/bills.py, backend/app/routers/export.py, backend/alembic/versions/

## auth-ui (2026-06-12)
**Outcome:** Login, register, logout and a dashboard stub in the Next.js frontend, with cookie token storage, AuthContext and a middleware route guard (FR-001, FR-002).
**Key decisions:**
- Token in a JS-readable `auth_token` cookie (middleware can only read cookies); React Context `useAuth()`; inline Tailwind, no component library.
- Password min 8 chars validated client-side only; localhost:3010 added to backend CORS.
**Pitfalls/lessons:**
- Review fixes: cookie parsing must use indexOf/slice (not split on "="); API base URL moved to `NEXT_PUBLIC_API_URL` with localhost:8010 fallback; double-submit guard on register.
**Files/areas:** frontend/src/lib/{auth,api}.ts, frontend/src/context/auth-context.tsx, frontend/middleware.ts, frontend/src/app/{login,register,dashboard}/, backend/app/main.py

## bill-template-management (2026-06-12)
**Outcome:** Frontend CRUD UI for bill templates at /dashboard/bills, plus a read-only archived view (FR-003/004/005).
**Key decisions:**
- Inline accordion for create/edit (single `expandedId` state), native `<datalist>` category combobox, archive confirmation dialog, paused templates shown muted with badge.
- `due_day` shown only for monthly/quarterly; amount typed as string (Decimal JSON).
**Pitfalls/lessons:**
- Review found the dashboard layout had no auth guard; added useEffect guard + null render. Also a ThemeToggle hydration mismatch and missing back-nav on the archived page.
**Files/areas:** frontend/src/lib/bills-api.ts, frontend/src/components/bills/, frontend/src/app/dashboard/bills/, frontend/src/app/dashboard/layout.tsx

## core-payment-tracking-loop (2026-06-12)
**Outcome:** /dashboard/payments page: view instances by month, mark paid with optional amount override and notes, next-period instance auto-generated (US-01, FR-006..009).
**Key decisions:**
- Current-month instances seeded via side-effectful GET (`ensure_current_period_instances`), safe due to the unique constraint; overdue status computed dynamically in the response, no DB write.
- Mark-paid via modal dialog; year-based month selector (prev + current year); `bill_name`/`currency` added to PaymentInstanceOut; i18n en/pl/de.
**Pitfalls/lessons:**
- Review: N+1 in list_payments fixed with joinedload; loading state derived (`loadedMonth !== selectedMonth`) to avoid a setState-in-effect lint error; frequency scheduling anchored only to created_at was flagged and fixed.
**Files/areas:** backend/app/routers/bills.py, backend/app/services/recurrence.py, backend/app/schemas/, frontend/src/app/dashboard/payments/, frontend/src/components/payments/

## language-support (2026-06-12)
**Outcome:** i18n with next-intl (en/pl, de added during the work), browser-detected default, language toggle in nav, per-user persistence via `GET/PATCH /auth/me` (FR-016/017).
**Key decisions:**
- No URL locale prefix; both message files statically imported; `LocaleProvider` inside `AuthProvider` syncs with backend, `setLocale` fires PATCH in background.
- `language_preference` column on users + Alembic migration.
**Pitfalls/lessons:**
- Review: server-side whitelist `Literal["en","pl","de"]` on language_preference; validate locale before casting in LocaleProvider; missing AbortController on fetchMe (post-logout setState).
**Files/areas:** backend/app/schemas/auth.py, backend/app/routers/auth.py, backend/app/models/user.py, frontend/src/context/locale-context.tsx, frontend/messages/*.json, LanguageToggle

## xlsx-export (2026-06-13)
**Outcome:** "Export .xlsx" button on the Payments page downloads `paylark-<year>.xlsx`, a 12-sheet (Jan-Dec) workbook with Category and Currency columns (FR-010).
**Key decisions:**
- `GET /export/xlsx?year=` defaults to current year; no year picker in UI.
- Blob download via raw fetch with JWT header, since `apiFetch` is JSON-only; inline error, spinner on button.
**Pitfalls/lessons:**
- Review: unplanned revert-payment feature (`POST /bills/payments/{id}/unpay`, `revertPay()`) landed in the same commit; documented separately in the revert-payment change.
**Files/areas:** backend/app/routers/export.py, frontend/src/lib/export-api.ts, frontend/src/app/dashboard/payments/page.tsx, frontend/messages/*.json

## browser-notification (2026-06-15)
**Outcome:** Bell icon in the dashboard header that requests permission and fires one browser notification per unpaid bill due today on app open.
**Key decisions:**
- Client-side only via the existing service worker `showNotification()`; no push/VAPID or backend changes.
- Dedup once per day per bill in localStorage; due-date-only alerts; i18n en/pl/de.
**Pitfalls/lessons:**
- Review: NotificationToggle.tsx was not committed (broken build); `serviceWorker.ready` rejection unhandled (now try/catch); SSR hydration issue with initial permission state.
**Files/areas:** frontend/src/hooks/useNotifications.ts, frontend/src/components/NotificationToggle.tsx, frontend/src/app/dashboard/layout.tsx

## data-backup (2026-06-15)
**Outcome:** `/export/json` made a full DB snapshot (`schema_version`, all columns), plus a Backup button with confirmation dialog in the nav (FR-011).
**Key decisions:**
- Full 1:1 export of templates and instances with `schema_version` for future restore; download only, import out of scope at the time.
**Pitfalls/lessons:**
- Review (critical): plan exported all users' password_hash; fixed by scoping users export to the authenticated user only.
**Files/areas:** backend/app/routers/export.py, frontend/src/lib/export-api.ts, frontend/src/components/BackupButton.tsx, frontend/src/app/dashboard/layout.tsx

## data-restore (2026-06-15)
**Outcome:** `POST /export/restore` plus a RestoreButton (two-step modal) to atomically replace a user's data from a schema_version 2 backup file.
**Key decisions:**
- Replace mode in a single transaction with template old-to-new ID remapping; only schema v2 accepted; orphaned instances reject the whole file.
- Backend integration tests only (6); no frontend E2E.
**Pitfalls/lessons:**
- Review criticals: 10 MB upload cap (413) against memory DoS; enum coercion (BillFrequency/PaymentStatus) ran after the destructive delete, so validation must happen before any delete.
**Files/areas:** backend/app/routers/export.py, backend/app/schemas/bill.py, frontend/src/components/RestoreButton.tsx, frontend/src/lib/export-api.ts, backend tests

## per-user-data-scoping (2026-06-15)
**Outcome:** Added `user_id` FK to `BillTemplate` and scoped every bills/export query to the authenticated user (FR-020), with an isolation test suite.
**Key decisions:**
- Cross-user access returns 403 (not 404); `PaymentInstance` scope inherited via `bill_id -> BillTemplate.user_id`; `ensure_current_period_instances` takes explicit `user_id`.
- Migration truncated `bill_templates` (dev data only); JSON backup bumped to `schema_version: 2`.
**Pitfalls/lessons:**
- Ownership check must precede status check (404->403->400) or 400 leaks paid state; the TRUNCATE migration is destructive, never run it on populated DBs.
**Files/areas:** backend/app/routers/{bills,export}.py, models/bill.py, services/recurrence.py, backend/tests/test_user_scoping.py

## pwa-installability (2026-06-15)
**Outcome:** App installable as a PWA (FR-013) via `app/manifest.ts`, placeholder icons and a fetch-passthrough service worker.
**Key decisions:**
- No library; SW is passthrough only (no offline caching); browser-native install prompt.
**Pitfalls/lessons:**
- Unplanned over-broad `proxy.ts` PNG exclusion was narrowed; SW registration errors were swallowed.
**Files/areas:** frontend/src/app/manifest.ts, frontend/public/sw.js, components/pwa-register.tsx, src/proxy.ts

## revert-payment (2026-06-15)
**Outcome:** Undo an accidental "Mark as Paid" via `POST /bills/payments/{id}/unpay` and a revert icon in the payment row.
**Key decisions:**
- No confirmation originally (later a confirm was added); clears paid_at/paid_amount; auto-generated next-period instance is kept.
**Files/areas:** backend/app/routers/bills.py, frontend payments-api.ts, PaymentRow.tsx

## email-reminders (2026-06-16)
**Outcome:** Email reminders (FR-012) for payments due soon / overdue, sent by an embedded APScheduler job with a per-user opt-out.
**Key decisions:**
- Idempotency via reminder-sent flags on `PaymentInstance`, flipped only after successful SMTP send (failures retry).
- Missing SMTP logs a warning and skips; `smtp_use_tls` gates STARTTLS; backup schema v3 includes reminder flags (v2 still restorable).
**Pitfalls/lessons:**
- Use `BackgroundScheduler` (AsyncIO one blocked the event loop); wrap commit-after-send to avoid double-send; migration FKs need explicit CASCADE for downgrade.
**Files/areas:** backend/app/services/{email,reminder_job}.py, main.py lifespan, core/config.py

## settings-page (2026-06-16)
**Outcome:** `/dashboard/settings` with per-section tiles (profile, email/browser notifications, backup, restore), each with Save/Cancel, decluttering the nav header.
**Key decisions:**
- Configurable email timing end-to-end; email/password change require current password; unsaved-navigation guard; gear in nav.
**Pitfalls/lessons:**
- Review initially rejected: scheduler ignored the enabled flag, soft-deleted/paused/archived items still triggered reminders, missing send-hour validation, startup reminder blocked lifespan (all fixed).
**Files/areas:** frontend/src/app/dashboard/settings/, backend auth profile endpoints, reminder job

## notification-toggles (2026-06-16)
**Outcome:** Master on/off Switch for email notifications and a client-side preference switch for browser notifications.
**Key decisions:**
- Frontend-only; reusable `components/ui/Switch.tsx`; browser preference in localStorage via `useNotifications`.
**Pitfalls/lessons:**
- Default must not opt in without consent; stale closure right after `requestPermission`.
**Files/areas:** frontend/src/components/ui/Switch.tsx, settings tiles, hooks/useNotifications.ts

## testing-export-restore-round-trip (2026-06-17)
**Outcome:** Round-trip integration tests proving backup->restore is lossless and v2 backups restore with correct defaults; production fix excluding soft-deleted instances from exports.
**Key decisions:**
- Compare all exported fields (minus remapped ids); v2 payload built by omitting reminder keys.
**Pitfalls/lessons:**
- Guard against vacuous pass with zero instances.
**Files/areas:** backend/tests/test_restore.py, routers/export.py

## testing-postgresql-integration (2026-06-17)
**Outcome:** Replaced SQLite test fixtures with a session-scoped PostgreSQL 17 testcontainer; added the missing cross-user IDOR test for `delete_payment`.
**Key decisions:**
- One shared `postgres_engine` in conftest.py; `drop_all`/`create_all` per test; CI needs no changes (Docker on ubuntu-latest).
**Files/areas:** backend/tests/conftest.py and test modules

## testing-recurrence-unit (2026-06-17)
**Outcome:** 42 tests in `backend/tests/test_recurrence_service.py` covering period math and next-instance generation (test-plan Phase 1).
**Key decisions:**
- Parametrized pure tests plus service tests; expected dates derived independently (Feb clamping, Dec->Jan, leap year).
**Files/areas:** backend/tests/test_recurrence_service.py, services/recurrence.py

## restore-deleted-future-instances (2026-06-18)
**Outcome:** Saving a bill template edit now offers to restore previously soft-deleted future payment instances (tombstones) with the updated amount and due date.
**Key decisions:**
- Soft-delete/tombstones unchanged; recurrence engine still skips any (bill_id, period) row even if is_deleted, so restore is an explicit opt-in on template save.
- New `GET /bills/{bill_id}/has-deleted-future` (declared before PATCH) plus transient `recreate_deleted_future` flag on `BillTemplateUpdate`; restore runs after setattr so it uses the new template values.
**Pitfalls/lessons:**
- Review: the control flag leaked through the `model_dump` setattr loop (exclude it); Skip handler closed the dialog before the await; dialogs lacked createPortal (project rule).
**Files/areas:** backend/app/routers/bills.py, backend/app/schemas/bill.py, frontend bills page + RestoreDeletedDialog / ArchiveConfirmDialog.

## category-enum-grouping (2026-06-19)
**Outcome:** Bill category became a required 9-value enum (Housing, Utilities, Insurance, Subscriptions, Entertainment, Transport, Healthcare, Education, Other) with a select, and Bills, Archived Bills and Payments pages group by category.
**Key decisions:**
- Fixed vocabulary, NOT NULL; migration handwritten (null -> 'other'); backup restore maps unknown categories to "other".
- Non-collapsible section headers with bill count; within-group alphabetical sort. SUPERSEDED later: the enum was replaced by an archivable per-user Category DB table.
**Pitfalls/lessons:**
- Review: `readOnly={false}` hardcoded in PaymentRow call (past-month rows showed Mark as Paid); CATEGORY_ORDER alphabetical rather than planned domain order; TS union and CATEGORY_ORDER lack an exhaustiveness check.
**Files/areas:** backend/app/models/bill.py, schemas, alembic migration, frontend/src/lib/categories.ts, CategorySelect, BillTemplateForm, Bills/Payments pages, locale files.

## monthly-summary-email (2026-06-23)
**Outcome:** A month-end HTML summary email (paid/unpaid, totals; en/pl/de) is auto-sent on the last day of the month and can be sent on demand from Settings.
**Key decisions:**
- Piggybacks on the existing 30-min APScheduler job (no new cron); `monthly_summary_last_sent` (YYYY-MM) on User is set only on success, giving natural retries; manual send also sets it; startup catch-up included.
- Gated by new `monthly_summary_enabled` toggle under master `email_reminders_enabled`; endpoint `POST /auth/send-monthly-summary-now`.
**Pitfalls/lessons:**
- Review: user strings needed HTML-escaping; `smtp_host=None` guard missing (socket.gaierror not caught); check-then-send is not atomic (accepted at household scale).
**Files/areas:** backend/app/services/email.py, scheduler, routers/auth.py, User model + migration, frontend Settings page, locale files.

## postgres-service-extract (2026-06-24)
**Outcome:** PostgreSQL moved out of the backend container into its own official `postgres:17` Compose service; supervisord and entrypoint.sh removed.
**Key decisions:**
- Fresh start on default PGDATA `/var/lib/postgresql/data` (old volume wiped with `down -v`); backend DATABASE_URL overridden in compose to `@postgres:5432` while `.env.example` keeps localhost.
- Inline `CMD` (alembic upgrade head && uvicorn) in the Dockerfile; Compose healthcheck + depends_on replace the pg_isready loop.
**Pitfalls/lessons:**
- Review: `uv run` at cold start rebuilds the venv; `:-changeme` password fallback; healthcheck lacked start_period; `env_file` leaks all secrets into the postgres container; frontend depends_on doesn't wait for backend health.
**Files/areas:** docker-compose.yml, backend/Dockerfile, deleted backend/supervisord.conf and entrypoint.sh.

## reset-password (2026-06-24)
**Outcome:** Email-token forgot/reset password flow with `/forgot-password` and `/reset-password` pages and a "Forgot password?" link enabled only when SMTP is configured.
**Key decisions:**
- Raw `secrets.token_urlsafe(32)` emailed; only SHA-256 hash stored in new `password_reset_tokens` table (UUID PK, optional expiry via `PASSWORD_RESET_TOKEN_EXPIRE_HOURS`, 0 = none); old tokens deleted on new request; generic 200 always (no enumeration).
- Reset URL from `APP_BASE_URL` env var (not Host header); public `GET /auth/smtp-status`; migration handwritten. Out of scope: rate limiting, session invalidation on reset.
**Pitfalls/lessons:**
- Review: SMTP failure after token commit returned 500 and leaked enumeration (now caught and logged); wrong i18n key on error; email body hardcoded "1 hour".
**Files/areas:** backend/app/routers/auth.py, services/email.py, core/config.py, models + alembic, frontend/src/app/{login,forgot-password,reset-password}, locale files.

## restore-auto-backup-safety-net (2026-07-10)
**Outcome:** `POST /export/restore` now snapshots the user's data first into a new `restore_snapshots` table, with a self-serve undo in Settings > Restore and daily retention cleanup (default 7 days).
**Key decisions:**
- Snapshot written in the same transaction as the restore; if it fails the restore aborts; skipped when there is no data; one snapshot per user (unique constraint); retention configurable via .env.
- Phase 4 pivoted from a dashboard banner to a persistent Settings > Restore subsection with absolute date/time and no dismiss. Endpoints `GET /export/last-snapshot`, `POST /export/restore-snapshot`.
**Pitfalls/lessons:**
- E2E found a missing `ON DELETE CASCADE` on `restore_snapshots.user_id`; review found POST restore-snapshot ignored the retention cutoff that GET enforces (fixed).
**Files/areas:** backend/app/routers/export.py, RestoreSnapshot model + migration, cleanup job, frontend Settings restore section, e2e specs, locale files.

## restore-safety-comparison (2026-07-10)
**Outcome:** The restore confirmation dialog now compares current vs backup bill/payment counts and export date, warns if the backup has less data, and rejects malformed files at selection time.
**Key decisions:**
- New read-only `GET /export/summary` (counts scoped to user, excluding is_deleted to match `/export/json`); backup parsed client-side at file selection; schema_version 2 shows "export date unknown"; summary fetch failure degrades to backup-only info.
- `POST /export/restore` semantics unchanged (safety aid only; server-side snapshot is the sibling S-19).
**Files/areas:** backend/app/routers/export.py, schemas, frontend RestoreButton.tsx, locale files, e2e 06-export-restore.spec.ts.

## bootstrap-verification
Scaffold of the Next.js starter (`next`, npm, confidence verified, path custom, self-host, GitHub Actions) into paylark was verified OK on 2026-06-11.
Follow-ups noted: review CLAUDE.md.scaffold/AGENTS.md, run npm audit (2 moderate), scaffold the FastAPI backend and docker-compose manually.

## selective-backup (2026-09-23)
**Outcome:** Backup export is selectable per section (`GET /export/json?sections=`: bills, categories, email, telegram, languages, currency) with select/deselect all in the dialog; restore applies whatever sections the file contains. Schema version 5 (2–4 still restore). Also: new users start with all notifications off, password toggle hidden while the field is empty, Telegram help expander restyled.
**Key decisions:**
- Absent section = untouched: bills/payments are wiped only if the file has them; categories-only files merge (match by slug, else name; never delete) to avoid breaking bills' FKs.
- Bills exported without categories carry `category_name` so they map to a category by name, falling back to "other".
- `browser_enabled` travels with the email option; Telegram option = token + chat id + schedule. Restore rejects an active language not in enabled languages.
- Snapshot still full (adds preferences), written only when the file replaces bills.
**Pitfalls/lessons:**
- Flipping a model `default` broke tests that silently relied on it; added `enable_notifications` test helper. No migration needed (only Python-side defaults changed; existing users keep settings).
- Test bot tokens need `# pragma: allowlist secret` (detect-secrets).
**Files/areas:** backend/app/routers/export.py, schemas/bill.py, models/user.py, tests/test_backup_sections.py, frontend BackupButton/RestoreButton/PasswordInput, locale files.

## remove-pause-show-end-period (2026-10-05)
**Outcome:** Removed the "pause recurrence" flag (`is_paused`) end to end, since `end_period` already stops instance generation; the Bills tile now shows "Last payment: <month year>" when an end month is set. Same release: saving, paying, reverting, deleting and archiving now confirm with a toast, and a saved bill is scrolled into view and highlighted.
**Key decisions:**
- Migration `d8e9f0a1b2c3` turns each paused bill into an `end_period` (month of its last non-deleted instance, else this month; never before `start_period`, never later than an existing end), then drops the column. Downgrade re-adds the column but paused state is not restorable.
- Setting `end_period` hard-deletes unpaid instances after it (system-made, regenerate if the end moves) instead of soft-deleting, so they don't show up as user tombstones in the "restore deleted payments" prompt. Paid ones stay; `is_last_instance` ignores periods past the end.
- Old backups with `is_paused` are not converted (no such files existed); the field is just dropped from the backup schema.
- Toasts live in a shared `ToastProvider` (`useToast()`) in the dashboard layout; Settings switches and Save forms use one generic "Settings saved" message, password/email changes have their own.
**Pitfalls/lessons:**
- Theme CSS that sets `box-shadow` (Vesperfall cards) swallows Tailwind `ring-*`; the bill highlight needed its own `bill-row-highlight` rule. Recorded in lessons.md.
- Toast text contains the bill name, so e2e `getByText(billName)` must use `exact: true`.
- Migration was verified with a one-off script against Postgres (4 cases), not a test in the repo.
**Files/areas:** backend/alembic/versions/d8e9f0a1b2c3_*, backend/app/{models,schemas,routers/bills.py,services/{recurrence,backup,reminder_job,export_xlsx}.py}, frontend/src/{context/toast-context.tsx,components/ui/Toast.tsx,components/bills/,components/settings/,app/dashboard/{bills,payments}/}, frontend/messages/*.json, frontend/src/app/globals.css, demo/seed_data.json.

## multi-day-bills (2026-10-09)
**Outcome:** A bill can be paid on several days: monthly and annual bills take a list of days of the month (`due_days`) that repeats every cycle, and one-off bills take explicit dates in any months. Each day is its own payment tile. Requested by a tester who pays single gym entries instead of a monthly pass.
**Key decisions:**
- Payment identity is `(bill_id, period, slot)`, slot = position of the day in the sorted day list (migration `d5e6f7a8b9c0`). `due_day` stays and mirrors the first day, `due_days` is only stored for 2+ days, so single-day bills, ~35 tests and old backups are unchanged. Backup `schema_version` 8 adds `due_days` and `slot`; v2-v7 still restore.
- Editing the day list remaps unpaid payments by slot position and hard-deletes unpaid payments of dropped slots (system-made, same as the `end_period` cleanup, so they never become tombstones that block a re-added slot). Paid history is never touched. A user-deleted tile stays a tombstone per slot.
- Changing frequency, interval or start period hard-deletes unpaid, non-deleted payments from the current month on that the new cycle skips; past ones and tombstones stay.
- One-off dates live as instances (no template column): the API takes `dates`, returns `dates` and `paid_dates`, and edits diff them (paid dates are locked in the UI).
- A monthly bill's start month cannot change on edit (the server never recomputes `start_period` for monthly; it anchors the cycle and history), so the form shows it read-only instead of a field that silently does nothing.
- UI reuses the one shared `Calendar` (`DaysOfMonthPicker`, `MultiDatePicker`, `CalendarPopup`); a first separate 1-31 grid was rejected for the missing weekdays.
**Pitfalls/lessons:**
- The test schema comes from `create_all`, so the migration is not covered by tests; it was verified once with a script on a fresh Postgres (upgrade, downgrade, upgrade).
- The `generate_next_instance` race test mocks `db.query`; moving the existence check to `(period, slot)` pairs required updating that mock.
- Monthly `due_month` on PATCH is ignored by design; e2e `11-edit-bill` and the end-period specs were the only ones touching the old date picker.
**Files/areas:** backend/alembic/versions/d5e6f7a8b9c0_*, backend/app/{models/bill.py,schemas/bill.py,routers/{bills,export}.py,services/{recurrence,backup}.py}, backend/tests/{test_multi_day_bills,test_recurrence_service,test_restore}.py, frontend/src/{components/ui/{Calendar,CalendarPopup,DaysOfMonthPicker,MultiDatePicker}.tsx,components/bills/{BillTemplateForm,BillTemplateRow,MonthYearPicker}.tsx,lib/bills-api.ts}, frontend/messages/*.json, frontend/tests/e2e/{11-edit-bill,29-multi-day-bill}.spec.ts, demo/{seed.py,README.md}.
