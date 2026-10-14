# Changelog

Notable changes, release by release.

## v1.5.0 (Not released yet)

### Features

- New bills start as drafts you can edit freely, and “Generate payments” turns them on when you're ready
- Ribbons on bills and payments mark drafts, paused bills, overdue and due-today payments, and the last payment
- Upcoming payments show how many days are left
- Payment popups are tinted in the payment's status color
- Collapse or expand all tiles at once in every Settings tab
- The “Get started in 3 steps” card now sits on the Dashboard, the first page after login

### Fixes

- The “Get started” card is no longer hidden on a new account because it was hidden on another one

## v1.4.0 — 14-10-2026

### Features

- Pay one bill on several days of the month (e.g. single gym entries), or on chosen dates for one-off bills
- Bigger month arrows on the dashboard, the 12-month chart scrolls year by year and its bars pick the month, and the dashboard and Payments month pickers swipe on touch screens
- Browse the dashboard and Payments up to 5 years back and ahead
- About tab in Settings with app details and licenses
- Dutch and Portuguese language support
- Bottom tab bar on mobile, with a More tab for Settings, theme, language and log out
- Add a new category right from the bill form
- Cleaner month picker on Payments: one title, and a bottom sheet for months on mobile
- Help button with plain-language answers, and a “get started in 3 steps” card for new accounts
- Animated menu on mobile and desktop, with the overdue count on Payments
- Clearer tab names and helpful hints on empty screens
- Pause and resume bills right from the bills list, no separate archive page
- Delete categories you don't use
- Payments shows which day you are filtering by, pinned at the top while you scroll
- The selected month in the dashboard 12-month chart stands out more
- Reset filters button on Payments and Bills
- Pausing a bill hides its unpaid upcoming payments, and resuming brings them back
- Lighter install: the database is now a single SQLite file, no separate Postgres container

### Fixes

- All calendars now show the same, correct weekdays and today's date
- Default categories can now be renamed in Settings
- A payment moved to a future due date is no longer shown as overdue
- Edit and pause buttons on bills are always visible
- Switching tabs no longer flashes: pages crossfade and show the last data instantly
- Long bill names are shortened in confirmation messages so they fit

## v1.3.0 — 07-10-2026

### Features

- Browse the dashboard summary of previous months
- Share the month summary by email, with saved recipients to pick from (opt-in in the Settings Reports tab)
- Export payments to PDF for the month or the whole year (can be turned off in Settings)
- Time zone setting: reminders and “today” now follow your own time zone
- Vertical sidebar menu on desktop, with wider content on the dashboard and other pages
- Smoother page changes, without the loading flicker
- Installed app icon shows the number of overdue payments
- Last payment month shown on each bill, replacing “Pause recurrence”
- Confirmation messages after saving; a saved bill is highlighted
- New theme: Vesperfall
- New app logo

### Security

- Changing or resetting your password now signs out your other sessions
- Repeated failed logins and sign-up or password-reset spam are now blocked for a while
- Deleting your account now asks for your password
- Updated Next.js and other dependencies to patch known vulnerabilities

### Fixes

- Theme choice is now remembered per account
- Email addresses are no longer case-sensitive when signing up and logging in
- Passwords that are too long are rejected with a clear message
- The current time in Notification settings now follows your language
- Invalid or oversized values in bills and payments now show an error instead of failing
- Setting a last payment month removes later unpaid payments
- A payment already marked as paid, or one that was deleted, can no longer be paid again from a stale page
- Restoring deleted payments keeps already paid ones paid
- Restoring from a file that isn't a valid backup now shows an error instead of failing
- Opening Payments in several tabs at once no longer fails with an error
- Invalid values in profile settings now show an error instead of failing
- Choose the exact minute reminders are sent, not just every 30 minutes
- Excel export prints in landscape, fitted to page width, with a footer

## v1.2.0 — 30-09-2026

### License

- Pay Tracker is no longer MIT-licensed; commercial use now requires permission. See [LICENSE](LICENSE)

### Features

- Excel export: pick the selected month or the whole year, choose which columns to include or turn it off, follows your decimal separator
- Excel export, emails and Telegram messages are translated into all 7 app languages
- Decimal separator preference (period or comma) for displayed prices
- Search bills and payments by name on Payments, Bills, and Archived Bills
- Keyboard navigation for dropdowns and the category filter checklist
- Unpaid payments' due date can be edited per instance
- Redesigned auth screens and a warmer, unified app look
- Settings "send now" buttons: clearer labels, and sending reminders now no longer affects the schedule
- Telegram monthly summary shows amounts (paid or due) and lists unpaid bills first
- Icons on the Settings tabs and mobile sections

### Security

- Backend, frontend, and demo-seed containers now run as non-root users

### Fixes

- Monthly summary email no longer shows a pointless "(expected: —)" note for payments without a planned amount
- Settings warns about unsaved changes before logout and uses an accordion on mobile
- Dashboard totals no longer rounded to whole currency units
- Category color picker separates used and unused colors, with a wider palette
- Category expanders reset to expanded on every login
- UI polish: dialogs, backup sections, mobile search field, consistent Save/Cancel order

### Internal

- Languages and translations have a single source shared by frontend and backend
- Typed responses for `/server-time` and restore endpoints; fixed foreign-key metadata drift

## v1.1.0 — 27-09-2026

### Features

- Per-user editable categories: create, rename, recolor, and archive categories, with backup/restore support
- Telegram reminders per user; email reminders now sent via Apprise. All notifications are off by default for new users
- Selective backup: choose which sections to export, and restore them partially
- Delete account, with full data cascade
- Default currency preference (plus CNY support)
- Interface languages: Spanish, Italian, French and Chinese added; choose which languages appear in the switcher
- Settings page regrouped into tabs (Account, Preferences, Notifications, Categories, Data), with the active tab kept in
  the URL
- Filters on Payments, Bills, and Archive views (multi-select category and status), plus category & status sorting
- Collapsible calendar view on Payments, marking days that have bills due
- "Mark as Paid" now includes a payment date field, and reverting a payment asks for confirmation
- Archived bills can be restored
- Archived categories are now flagged in filters and group headers instead of silently disappearing
- Show/hide toggle on password fields
- Recurring bills can now have an end month, so installments and fixed-term contracts stop generating payments and
  reminders after the last one
- Custom repeat interval: bills can repeat every 1–12 months or every 1–5 years (e.g. every 4 months, every 2 years).
  Existing "Every 2 months" and "Quarterly" bills were converted automatically with the same schedule, and older backups
  still import

### Security

- Hardened cookies/sessions: secure cookies, CSRF protection, logout token revocation
- Access tokens now require iss/aud claims
- CSP and other hardening headers sent from the proxy middleware
- Swagger/ReDoc/OpenAPI docs disabled outside development
- Patched high-severity vulnerabilities in next and pyasn1

### Fixes

- One-off bills now correctly generate a payment instance
- Unpaid payments now suggest the current template price
- xlsx export localized and backfilled to a full year of instances
- Fixed login/dashboard hydration mismatch
- Payment note moved out of the popup onto its own line
- Enlarged the calendar day tile count badge and thickened the today marker for readability
- Frontend build now correctly wires in NEXT_PUBLIC_API_URL
- Various Docker build fixes
- Consistent button, checkbox, and dropdown styling; action buttons aligned to ghost/outline style
- Localized auth error messages

## v1.0.2 — 20-07-2026

### Features

- Restore safety net: data is automatically snapshotted before a restore, with self-serve undo
- Restore preview: compare current data with the backup before confirming a restore

### Fixes

- Session expiry is now detected reliably: automatic logout and redirect to login
- Minimum password length of 8 characters enforced on registration
- Frontend arm64 image built on a native runner instead of QEMU
- CI: added mypy type-checking and dependency vulnerability audits

## v1.0.1 — 01-07-2026

### Fixes

- Release images are now built for both amd64 and arm64

## v1.0.0 — 01-07-2026

First release.

### Features

- Bill templates (one-off, recurring, annual) with automatic, idempotent payment generation; archive instead of delete
- Payments page: mark as paid (optional amount), revert payment, delete a single instance or all future entries, year
  navigation up to one year ahead
- Bills and payments grouped by category
- Currencies: PLN, EUR, USD and custom
- Interface languages: English, Polish, German, with per-user preference
- Registration, login, session management, forgot/reset password via email token
- Per-user data scoping
- Excel (xlsx) export, full JSON backup and restore
- PWA: installable, with browser notifications for due bills
- Email reminders and month-end summary email, with per-user toggles; missed reminders caught up on startup
- Settings page and green branding with new logo
- Docker Compose deployment with PostgreSQL 17 as a separate service and demo data
- Multi-arch images published to GHCR from CI, with Playwright E2E suite and 80% backend test coverage
