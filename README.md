# <img src="assets/paylark-icon-1024.png" width="32" alt="PayLark logo" valign="middle"> PayLark

A self-hosted household bill tracking PWA. Define your recurring bills once, then each month's payment instances are generated automatically. Mark bills paid from any device — phone, tablet, or desktop.

No third-party data sharing. No subscription. Runs locally with Docker Compose or in the cloud. Each user's data is fully isolated.


<p align="center">
  <a href="assets/dashboard.png">
    <img src="assets/dashboard.png" width="260" alt="Dashboard">
  </a>
  <a href="assets/bills.png">
    <img src="assets/bills.png" width="260" alt="Bills">
  </a>
  <a href="assets/settings.png">
    <img src="assets/settings.png" width="260" alt="Settings">
  </a>
</p>
<p align="center">
  <a href="assets/payments_light.png">
    <img src="assets/payments_light.png" width="260" alt="Payments light">
  </a>
  <a href="assets/payments_dark.png">
    <img src="assets/payments_dark.png" width="260" alt="Payments dark">
  </a>
  <a href="assets/payments_vesperfall.png">
    <img src="assets/payments_vesperfall.png" width="260" alt="Payments vesperfall">
  </a>
</p>


## 📋 What it does

- **Bill templates** — define a bill once: name, category, amount, currency, due day of month, and how often it repeats: monthly (every 1–12 months), annual (every 1–5 years) or one-off. Optionally set an end month to stop a recurring bill after its last installment. A new bill starts as a draft you can edit freely; **Generate payments** turns it on, and from then on PayLark generates payment instances automatically each period.
- **Dashboard** — month summary, a category donut and a 12-month trend at a glance.
- **Pause bills** — pause a bill you no longer need to hide it from the list; its payment history stays intact. Use "Show paused" to see them and resume one any time to start generating payments again. A bill with nothing paid (a draft, or a paused one) can be deleted instead.
- **Category grouping** — bills and payments are grouped under category headers. Every account starts with 9 defaults (Housing, Utilities, Insurance, Subscriptions, Entertainment, Transport, Healthcare, Education, Other); add your own, rename or recolor any of them, or delete ones you no longer use from Settings (a category used by bills is archived instead). Category is required on every bill. Archiving a category hides it from the "new bill" picker but doesn't touch bills already using it — they keep working and stay filterable, just flagged as archived.
- **Payment tracking** — view upcoming, overdue, and paid bills for any month, grouped by category. Mark as paid with an optional amount override and note. Edit the amount, date and note of any payment afterwards, or revert if you made a mistake (a paid payment of a paused bill can be reverted only after the bill is resumed). Unpaid bills can also have their due date nudged to a different day in the same month.
- **Email reminders** — optional, off by default for new accounts. Configure SMTP credentials and a send time (30-minute precision) and the app emails you before or after each bill's due date.
- **Monthly summary email** — optional. On the last day of each month, receive a full summary of what was paid (amount due vs. paid, date) and what was missed, with totals. Toggle it in Settings → Email Notifications. A "Send monthly summary now" button lets you request the current month's snapshot on demand.
- **Browser notifications** — optional. Get a desktop/mobile notification when a bill is due today (Settings → Browser Notifications).
- **Email sent indicator** — each payment row shows an `@` icon: gray if no reminder has been sent, amber if one was sent. Click it to see the exact timestamp.
- **Telegram reminders** — optional. Per-user bot token and chat ID, own schedule and monthly summary, independent of email. See `context/foundation/telegram-setup.md`.
- **Export & backup** — download payment history as `.xlsx` for the selected month or the whole year (one sheet per month) or a landscape `.pdf` (same columns, one section per month) or a backup file (`.bak`) where you choose what to include (bills & payments, custom categories, email setup, Telegram, languages, default currency, Excel/PDF export settings, sharing and saved recipients; select/deselect all). Restore applies whatever the file contains. Excel and PDF export can each be turned off, and which of its 10 columns are included is configurable, from Settings → Reports.
- **Share by email** — optional. Email a month's summary to any address from the Payments page. Save your usual recipients in Settings → Reports and tick them in the share dialog instead of retyping, or add one by hand. Requires SMTP.
- **Restore safety net** — before confirming a restore, see a comparison of your current data vs. the backup file (bill/payment counts, backup export date), with a warning if the backup would reduce your data. The server also auto-snapshots your current data immediately before any restore executes, so a mistaken restore can be undone from Settings — even if you proceeded past the warning or called the API directly.
- **Password reset** — optional. When SMTP is configured, a "Forgot password?" link appears on the login page. Users receive a secure one-time reset link by email (expires after 60 minutes by default).
- **Multilingual** — English, Polish, German, Spanish, Italian, French, Chinese, Dutch, Portuguese. Language and the set of enabled languages are saved per account. The Excel export, emails and Telegram messages follow it.
- **Themes** — light, dark and Vesperfall (a warm gold-and-leather dark theme). Switch from the sidebar (or the menu on mobile).
- **Installable as PWA** — works offline-first on mobile and desktop.


## 🚀 Quick start without cloning

Pull the published images from GitHub Container Registry and run the app with just two files — no repo clone required.

```bash
mkdir paylark && cd paylark
curl -O https://raw.githubusercontent.com/marwin87/paylark/main/docker-compose.prod.yml
curl -O https://raw.githubusercontent.com/marwin87/paylark/main/.env.example
cp .env.example .env
```

Edit `.env`: set a strong `JWT_SECRET` and `ENVIRONMENT=production` — this is a real deployment, and that flag is what enables secure cookies and rejects a weak/default JWT secret (see the [environment variables](#environment-variables) table). Then:

```bash
docker compose -f docker-compose.prod.yml up -d
```

- Frontend: http://localhost:3010

(`/docs` is intentionally unavailable in `ENVIRONMENT=production` — see [Getting started](#getting-started) below if you need the API docs.)

To try it with pre-seeded demo data instead of starting empty:

```bash
docker compose -f docker-compose.prod.yml --profile demo up -d
```

Pin a specific released version instead of the latest one by setting `PAYLARK_VERSION` (e.g. `PAYLARK_VERSION=1.1.0 docker compose -f docker-compose.prod.yml up -d`).


## 🏁 Getting started

The steps below build the images from source — use this if you're developing PayLark or want to run unreleased changes. If you just want to run the app, see [Quick start without cloning](#quick-start-without-cloning) above.

### 1. Set up environment

```bash
cp .env.example .env
```

Edit `.env` and set a strong `JWT_SECRET`. Everything else works with the defaults for local use.

### 2. Start the app

```bash
docker compose up --build
```

- Frontend: http://localhost:3010
- API docs: http://localhost:8010/docs

### 3. Create your account

Open http://localhost:3010 and register. Each account is isolated — register separately for each family member.

### 4. Add your first bill

Go to **Bills → New Bill**. Fill in the name, category, amount, frequency (monthly/annual + interval), and due day of month. Save it as a draft, then click **Generate payments** on its tile — PayLark generates this month's payment instance and keeps creating them automatically.

### 5. Track payments

Go to **Payments**. Use the month selector to browse any period. Click **Mark as Paid** when a bill is settled. The next month's instance is created automatically for recurring bills.

### 6. Set up email reminders (optional)

Add SMTP credentials to `.env` (see the `# Reminders` section in `.env.example`), then restart (mail is delivered through [Apprise](https://github.com/caronc/apprise), which will also carry other channels later). Open **Settings** in the sidebar (or the menu on mobile) → **Email Notifications** to configure when reminders are sent and which timing windows to use (2 days before, 1 day before, on the day, 1 day after).

Send times and "today" follow your own time zone: it is taken from your browser when you sign up and can be changed under **Settings → Preferences → Time zone**. The Notifications tab shows the current time in that zone.


## ⚙️ Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ENVIRONMENT` | no (default: `development`) | Set to `production` for any real deployment — enables the `Secure` cookie flag, rejects a weak/default `JWT_SECRET`, and disables `/docs`, `/redoc`, `/openapi.json` |
| `JWT_SECRET` | yes | JWT signing secret — use a long random string |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | Login session lifetime in minutes (default: 60) |
| `DATABASE_URL` | no | SQLite URL (default: `sqlite:///./paylark.db`; the Docker image uses `/data/paylark.db` on the `app_data` volume) |
| `NEXT_PUBLIC_API_URL` | yes | Backend URL as seen by the browser. **Baked in at frontend build time**, not read at container startup — only takes effect when building the frontend yourself (`docker compose up --build`, see [Getting started](#getting-started)). The pre-built images used in [Quick start without cloning](#quick-start-without-cloning) always ship with this set to `http://localhost:8010`, since it's baked in once at release time before any deployment's real domain is known |
| `NEXT_PUBLIC_SESSION_HEARTBEAT_SECONDS` | no | Seconds between session-expiry checks on an idle open tab (default: 180). Build-time, like `NEXT_PUBLIC_API_URL` |
| `SMTP_HOST` | no | SMTP server for email reminders |
| `SMTP_PORT` | no | SMTP port (default: 587) |
| `SMTP_USER` | no | SMTP login |
| `SMTP_PASSWORD` | no | SMTP password |
| `REMINDER_FROM` | no | From address for reminder emails |
| `APP_BASE_URL` | no | Public URL of the frontend — used in password reset links (default: `http://localhost:3010`) |
| `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES` | no | How long a reset token is valid in minutes (default: 60; set to 0 for no expiry) |
| `DEFAULT_TIMEZONE` | no (default: `UTC`) | IANA time zone (e.g. `Europe/Warsaw`) for accounts whose browser doesn't report one. **Set it before upgrading to the version that introduced per-user time zones:** the migration gives it to every existing account and converts their reminder send times (until then in UTC) so nothing is sent at a different moment. Changing it afterwards converts nothing |
| `RESTORE_SNAPSHOT_RETENTION_DAYS` | no | Days a pre-restore snapshot stays recoverable before the cleanup job deletes it (default: 7) |

Copy `.env.example` to `.env`. Never commit `.env`.


## 🧱 Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, next-intl
- **Backend:** FastAPI, Python 3.13, SQLAlchemy 2.0, Alembic, Pydantic v2
- **Database:** SQLite (a file on the `app_data` Compose volume)
- **Runtime:** Docker Compose


## 🛠️ Development commands

```bash
# Start everything
docker compose up --build

# Wipe DB and start clean
docker compose down -v && docker compose up --build

# Frontend only (against a running backend)
cd frontend && npm run dev

# Backend only
cd backend && uv run uvicorn app.main:app --reload

# Lint
cd frontend && npm run lint

# Backend tests
cd backend && uv run pytest tests/ -v

# New DB migration after changing a model
docker compose exec backend alembic revision --autogenerate -m "describe the change"
```

> **Migration note:** Always read the generated migration file before applying — autogenerate can miss new columns. For renames, write `add_column` + `UPDATE` + `drop_column` manually instead of relying on `alter_column(new_column_name=...)`.


## 📲 Installing as a PWA

- **Chrome / Brave (desktop):** install icon (⊕) in the address bar, or browser menu → Install PayLark
- **Android:** browser menu (⋮) → Add to Home screen
- **iOS Safari:** Share (⎋) → Add to Home Screen

Requires HTTPS in production. Localhost works as an exception in most browsers.


## 💾 Export & backup

- **PDF** — Payments page → PDF icon → Current month or Whole year; uses the same columns as XLSX and is toggled in Settings → Reports.
- **XLSX** — Payments page → Excel Export → Current month or Whole year. One sheet per month; which of the 10 columns are included, and whether the button is available at all, is configured in Settings → Reports (4 columns — Bill, Due Date, Amount, Currency — are always required).
- **Backup file** (`.bak`) — Settings → Backup → Download Backup. Tick the sections to include (bills & payments, custom categories, email notification setup, Telegram, language settings, default currency, Excel export settings, sharing and saved recipients) or use select/deselect all. Scoped to your account. The Telegram option writes the bot token in plaintext, so keep such files private.
- **Restore** — Settings → Backup → Restore from Backup. Shows a comparison of your current data vs. the backup (bill/payment counts, export date) before you confirm, then atomically replaces the data the file contains — sections missing from the file (e.g. a currency-only backup) are left untouched. Accepts `schema_version` 9 only; backups made by older versions can no longer be restored.
- **Undo a restore** — every restore automatically snapshots your prior data server-side first (skipped if you had no existing bills). If a restore turns out to be a mistake, Settings → Restore shows a "Restore This Snapshot" option with the snapshot's timestamp, letting you revert. Snapshots are kept for `RESTORE_SNAPSHOT_RETENTION_DAYS` (default 7) and only the single most recent one is retained per account.


## ⚖️ License

Releases up to and including v1.1.0 are MIT-licensed. **From v1.2.0 onward**, PayLark is free for personal, educational, research and other non-commercial use — including modifying, forking and redistributing — with attribution back to this repository. Commercial use requires the copyright holder's written permission. See [LICENSE](LICENSE) for the full terms.
