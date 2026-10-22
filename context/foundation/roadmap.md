---
project: paylark
version: 1
status: active
created: 2026-06-11
updated: 2026-09-23
prd_version: 1
main_goal: low-complexity
top_blocker: none
---

# Roadmap: PayLark

> Derived from `context/foundation/prd.md`. Edit-in-place. Full per-change history (decisions, pitfalls) lives in `context/archive/history.md`.
> `/10x-archive` closes items by exact `Change ID` (flips Status in the table below and appends to `## Done`).

## Vision recap

PayLark replaces the household spreadsheet with a self-hostable web app: recurring payment instances are generated automatically, the dashboard shows what is upcoming, overdue and paid, and each family member has an isolated account. No subscription, no third-party data sharing.

## At a glance

| ID | Change ID | Outcome | Status |
| --- | --- | --- | --- |
| F-01 | db-schema-migration | DB schema migrated; users, bill_templates, payment_instances exist | done |
| S-01 | auth-ui | Register and log in via the frontend | done |
| S-02 | bill-template-management | Create, edit, archive bill templates | done |
| S-03 | core-payment-tracking-loop | Payment list, mark paid with amount override, next instance auto-appears (north star) | done |
| S-04 | xlsx-export | Export payment history to .xlsx | done |
| S-05 | pwa-installability | Install as PWA on mobile and desktop | done |
| S-07 | language-support | Switch UI language; saved per account | done |
| S-08 | data-backup | Download full JSON backup | done |
| S-09 | data-restore | Restore from JSON backup | done |
| S-10 | email-reminders | Email reminder before bills become overdue | done |
| S-11 | per-user-data-scoping | Per-user data isolation (security) | done |
| S-12 | browser-notification | Browser notification for bills due today | done |
| S-13 | settings-page | Dedicated Settings page | done |
| S-15 | category-enum-grouping | Group bills/payments by category (later superseded by per-user categories) | done |
| S-16 | monthly-summary-email | Month-end summary email | done |
| S-17 | reset-password | Password reset by email link | done |
| I-01 | postgres-service-extract | (infra) PostgreSQL in its own Compose service | done |
| S-18 | restore-safety-comparison | Current-vs-backup comparison in restore dialog | done |
| S-19 | restore-auto-backup-safety-net | Server auto-snapshot before restore | done |
| S-20 | apprise-smtp | Email delivery via Apprise (mailto://) instead of smtplib | done |
| S-21 | telegram-notifications | Telegram reminders + monthly summary via Apprise, per-user chat id | done |
| S-22 | selective-backup | Choose backup sections (bills, categories, email, Telegram, languages, currency); restore applies what the file contains | done |

Work shipped after this roadmap was last extended (per-user categories, currencies, extra languages, delete account, calendar view, demo image, e2e suite, CI/release pipeline) was done directly and is recorded in the PRD (FR-023+) and `archive/history.md`. New slices: add rows above using the same columns.

## Open Roadmap Questions

1. **Local-mode PWA and HTTPS** — self-hosted deployment without HTTPS cannot install as a PWA on most browsers; needs a reverse-proxy/certificate note in deployment docs. Not blocking.

## Parked

- **Budgeting and savings goals** — PRD non-goal.
- **Bank / card integrations** — PRD non-goal; no automatic transaction import.
- **Multi-household / SaaS mode** — PRD non-goal; one household per deployment.
- **Native mobile app** — PRD non-goal; PWA is the mobile story.

## Done

All items in the table above are done; details in `context/archive/history.md`.
