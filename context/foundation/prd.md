---
project: pay-tracker
version: 2
updated: 2026-09-23
status: active
created: 2026-06-11
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 7
  hard_deadline: null
  after_hours_only: true
---

# Pay Tracker — Product Requirements Document

## Vision & Problem Statement

Managing household bills and recurring payments in a spreadsheet is tedious and
error-prone. The pain combines three compounding problems: too many manual steps
(updating the sheet each month, creating next-month rows by hand), missing capability (no
reminders, no automation, no shared real-time view), and coordination overhead — family
members cannot see or update the same payment list without emailing the file back and
forth.

The insight: existing tools (YNAB, Mint, and similar) are subscription-based and
over-engineered for simple household bill tracking. They also depend on third-party cloud
services, offering no path to self-hosted or offline operation. A personal-first bill
tracker that works identically whether hosted in the cloud or on a home server — with no
third-party subscription, no data sharing with outside services, and no unnecessary
complexity — does not exist as an off-the-shelf product.

## User & Persona

**Primary persona:** A household finance manager — typically the one person (or couple)
responsible for tracking all recurring household bills. This person currently maintains
bills in a spreadsheet, manually updates it each month, and relies on their own memory for
reminders. They want a web app that replaces the spreadsheet with automation, while keeping
data under their control (either self-hosted or privately cloud-hosted).

**Secondary persona:** Other family members who each have their own account. Each account
has a fully isolated view — their own bill templates and payment instances, separate from
every other account on the same deployment.

## Success Criteria

### Primary

The core bill-tracking loop works end-to-end:

Given a user has created a bill template (e.g., "Electricity — due 15th, monthly, €120"),
when they mark this month's payment instance as paid (accepting the default amount of €120
or overriding with the actual amount paid), then the system automatically generates next
month's instance and it appears on the dashboard — with no manual intervention required.

Validated in local self-hosted deployment.

### Secondary

The system sends email reminders for payments that are upcoming or overdue, so the
household finance manager does not need to check the dashboard proactively.

### Guardrails

1. **No data loss.** Payment history is never silently corrupted or deleted. Exports and
   backups produce accurate, complete data at any point in time.
2. **Auth secure.** No unauthenticated access to any finance data.

## User Stories

### US-01: Core bill-tracking loop

- **Given** I have created a bill template (e.g., "Electricity — due 15th, monthly, €120")
- **When** I mark this month's payment instance as paid, accepting the default amount of
  €120 or overriding it with the actual amount paid
- **Then** the system automatically generates next month's instance and it appears on the
  dashboard — and the current instance's status changes to "paid" — with no manual action
  required

## Functional Requirements

### Authentication

- FR-001: User can register with email and password. Priority: must-have
  > Socratic: No counter-argument — registration is essential for family access; no simpler
  > onboarding path meets the multi-user requirement.

- FR-002: User can log in with email and password. Priority: must-have
  > Socratic: No counter-argument — authentication is foundational; cannot be deferred.

### Bill Templates

- FR-003: User can create a bill template with name, amount, currency, category, due day of month,
  recurrence type, and optional last payment month. Priority: must-have
  > Currency is a per-template string (PLN / EUR / USD / custom); default is PLN.
  > Socratic: Category kept as must-have — needed for export reporting and filtering.

- FR-004: User can edit an existing bill template. Priority: must-have
  > Socratic: No counter-argument — template values (amount, due day) change over time.

- FR-005: User can pause a bill template (hidden from active view; existing payment
  history preserved). Priority: must-have
  > Socratic: Pause (stored as `status = paused`) preferred over hard delete — prevents accidental financial history
  > loss. Archived templates' instances remain accessible via export.

### Payment Instances

- FR-006: System auto-generates a payment instance from a template for the current period;
  generation is idempotent (requesting the same instance twice produces one record).
  Priority: must-have
  > Socratic: No counter-argument — idempotent generation prevents duplicate records at
  > month boundaries.

- FR-007: User can view a unified payment list sorted by due date with status indicators
  (upcoming / overdue / paid). Priority: must-have
  > Socratic: Unified list chosen over separate upcoming/overdue views — simpler to build;
  > status indicators make overdue items visible. Separate filtered views deferred to v2.

- FR-008: User can mark a payment instance as paid; the recorded amount defaults to the
  template amount with an option to override before confirming. Priority: must-have
  > Socratic: Defaulting to template amount reduces friction for the common case where
  > actual equals expected; override is available for variable bills (e.g., utilities).

- FR-009: System auto-creates the next-period payment instance when the current one is
  marked as paid; auto-creation stops after the template's last payment month.
  Priority: must-have
  > Socratic: Pause flag at template level allows stopping recurrence without deleting the
  > template or losing its payment history.

- FR-021: User can delete a payment instance with a confirmation dialog. Deletion is
  permanent from the user's perspective but implemented as a soft-delete (`hidden = user`
  on the payment) so the row acts as a tombstone and the seeder never regenerates the entry.
  Only the selected instance is affected — the bill template and all other instances
  are untouched. Priority: must-have
  > Hard-delete + regeneration-prevention via template-level flags was attempted and
  > rejected: it coupled instance lifecycle to template state and required a "reactivate"
  > concept that had no natural UX home. Soft-delete on the instance is the correct
  > abstraction — the idempotency check in ensure_current_period_instances already
  > skips periods where any row (including soft-deleted) exists.

- FR-019: User can revert an accidentally marked-as-paid payment instance back to its
  natural unpaid state (upcoming or overdue) without a confirmation dialog. Priority: must-have
  > Reverting clears paid_at and paid_amount; status is recomputed dynamically (overdue if
  > due_date < today, otherwise upcoming). The auto-generated next-period instance created
  > by the original mark-paid action is preserved to avoid cascading data loss. Action is
  > trivially reversible (user can mark paid again), so no confirmation gate is needed.

- FR-020: Bill templates and payment instances are owned by the user who created them.
  User A cannot read, modify, or delete User B's templates or payment instances.
  All API endpoints that return or mutate bill or payment data must filter by the
  authenticated user's ID. Priority: must-have (security — blocking)
  > This is enforced at the data layer (`BillTemplate.user_id` FK), not at the router
  > level alone. PaymentInstance inherits user scope transitively through its
  > `bill_id → BillTemplate.user_id` FK; no direct `user_id` column is needed on
  > `PaymentInstance`. Every query on bill or payment data must join or filter through
  > `BillTemplate.user_id = current_user.id`.

### Export & Backup

- FR-010: User can export their own payment data to a spreadsheet file (.xlsx). The export
  is scoped to the authenticated user's templates and instances only. Priority: must-have
  > Socratic: Both export and backup are must-have — spreadsheet export serves family
  > review; data backup enables portability between deployment modes.

- FR-011: User can download a backup of their own data in a portable machine-readable
  format, choosing which sections to include (select/deselect all): bills and payments,
  custom categories, email notification setup (schedule and browser switch), Telegram (bot
  token, chat id, schedule), language settings, default currency. The backup is scoped to
  the authenticated user. Restore applies whatever sections the file contains and leaves
  the rest untouched. Priority: must-have
  > Socratic: Backup and spreadsheet export serve distinct purposes; both justified for v1.

### Reminders

- FR-012: System sends email reminders for upcoming and overdue payments. Outbound mail goes through Apprise; users may additionally receive the same reminders and the monthly summary on Telegram (each user connects their own bot: token stored encrypted, chat id; Telegram has its own on/off, timing windows, send time and monthly summary, independent of email — see `telegram-setup.md`).
  Priority: nice-to-have
  > Scoped to email-only delivery — browser push notifications deferred due to
  > implementation complexity. Email works in both deployment modes with appropriate mail
  > provider configuration.
  > Reminder send time is configurable per user in 30-minute increments (00:00–23:30,
  > stored as minutes since midnight). The scheduler fires every 30 minutes and matches
  > users whose configured time equals the current UTC time. Server time (UTC) is shown
  > in the settings UI so users can account for the timezone offset.

- FR-022: Each payment row displays an email notification indicator (@ icon): gray when
  no reminder has been sent for that instance, amber when at least one reminder was sent.
  Clicking the icon shows the timestamp of the most recent send. Priority: nice-to-have
  > Implemented via `email_sent_at` (timestamptz, nullable) on `PaymentInstance` — stamped
  > on every successful reminder send. Exposed in `PaymentInstanceOut` and rendered in the
  > frontend without a separate API call.

### PWA

- FR-013: App is installable as a PWA on mobile and desktop.
  Priority: must-have
  > Local operators are expected to configure HTTPS; guidance deferred to deployment docs.

### Localisation

- FR-016: UI is available in English, Polish, German, Spanish, Italian, French, Chinese, Dutch and Portuguese.
  The user can switch language via a toggle and choose which languages appear in it
  (per-user enabled languages). Priority: must-have
  > Started as EN/PL; extended after v1 (S-07 and later commits).

- FR-017: The user's selected language is persisted per account and restored automatically
  after login. Priority: must-have
  > Socratic: Without persistence the user must re-select the language on every session,
  > which contradicts the "household-first" convenience goal.

### Post-v1 additions (implemented; details in `context/archive/history.md`)

- FR-023: Categories are per-user DB records (9 defaults seeded; create, rename, recolor,
  delete when unused, archive instead when bills use it). Archiving a category does not touch bills or payments using it.
  Supersedes the fixed category enum from S-15.
- FR-024: Per-user default currency (PLN, EUR, USD, CNY, custom) used for new bills.
- FR-025: Restore is guarded: the confirmation dialog compares current vs. backup data,
  and the server auto-snapshots current data before every restore; the last snapshot can
  be restored from Settings.
- FR-026: Password reset by emailed one-time link (available when SMTP is configured).
- FR-027: Monthly summary email (paid vs. missed, totals), toggle plus "send now" in Settings.
- FR-028: User can delete their account with all data (cascade).
- FR-029: Payments view: calendar of due days, multi-select status/category filters,
  payment date and note on Mark as Paid, confirmation before reverting.
- FR-030: Paused bill templates are listed with the active ones ("Show paused") and can be resumed.
- FR-031: Settings page (tabs: profile, preferences, notifications, categories, backup/restore).
- FR-032: Demo mode: pre-seeded demo account/image (`demo/`), all notifications (email, Telegram, browser) disabled.
- FR-033: New accounts start with every notification (email, Telegram, browser, monthly
  summaries, all timing windows) disabled; the user opts in from Settings.
- FR-034: Password fields have a show/hide toggle that appears only once the field has text.

## Non-Functional Requirements

- **Data persistence:** All payment data is retained durably. The user's payment history
  survives app restarts and redeployments without data loss.

- **Mobile usability:** The app layout is fully operable on screens as narrow as 375px
  without requiring pinch-zoom. Family members check bills on phones; the primary view
  must work on a standard mobile screen.

## Business Logic

Pay Tracker automatically derives the status of each payment and creates the next recurring
instance without user intervention: given a bill's due date and whether it has been marked
paid, the system classifies the instance as upcoming, overdue, or paid — and when a
recurring instance is marked paid, the system produces the next period's instance from the
bill's recurrence schedule, without any additional user action.

Two distinct rules compose this behavior:

1. **Status classification:** Given today's date, a payment instance's due date, and
   whether it has been marked paid, the system assigns one of three statuses: `upcoming`
   (due date is in the future and unpaid), `overdue` (due date has passed and unpaid), or
   `paid`. This classification drives the dashboard display and email reminder triggers.

2. **Recurrence automation:** Given a bill template's recurrence schedule (its frequency and interval — monthly every 1–12 months, annual every 1–5 years —
   and scheduled due day within the month) and a payment instance that has been marked
   paid, the system derives the next period's due date and creates a new instance for that
   period — unless the template's last payment month has passed. The output is a new payment instance
   ready to appear on the dashboard with `upcoming` status. Auto-creation does not occur
   for one-time (non-recurring) bills or past a template's last payment month.

## Access Control

All users authenticate before accessing any finance data.

Authentication method: email and password.

Role model: per-user isolation. Each authenticated user owns their own bill templates and
payment instances. User A cannot see, edit, or delete User B's data. There are no
shared views, no cross-account reads, and no admin override path in the application
layer. Isolation is enforced at the data layer via `BillTemplate.user_id` — see FR-020.

Self-registration is supported so family members can join without requiring an invitation
from another user. Registration is intentionally open to anyone who knows the app's URL —
appropriate for a privately deployed household tool where URL distribution is controlled
by the household. Each registrant gets a fully isolated data partition.

## Non-Goals

- **No budgeting or savings goals.** Pay Tracker tracks bills and payments only; it does
  not advise on budget allocation, savings targets, or financial planning.

- **No bank or card integrations.** No automatic transaction import of any kind (no open
  banking, no statement parsing). All data is entered manually by the user.

- **No multi-household or SaaS mode.** One household per deployment instance. No public
  sign-up, no per-user billing. Within a deployment, each user account is data-isolated
  (FR-020) — this is a security property, not a SaaS feature. Personal-first, not
  platform-first.

- **No native mobile app.** PWA is the mobile story. No app store distribution, no
  platform-specific build.

## Open Questions

1. **Local-mode PWA and HTTPS.** A self-hosted deployment without HTTPS cannot install
   as a PWA on most browsers; needs deployment-docs guidance. Not blocking.
