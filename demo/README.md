# Demo Seed Data

This folder contains a seed script that populates Pay Tracker with realistic demo data — useful for testing, screenshots, or showing the app to someone for the first time.

## What it creates

**User:** `demo@demo.com` / `demo1234`

All notifications are switched off for this account (email, Telegram, browser), so the demo never sends anything even when SMTP is configured. Share by email is switched on, but it only sends when someone clicks Share.

**12 categories** — the 10 defaults every user gets, plus 2 custom ones used to exercise category-specific edge cases:

| Category | Type | State |
|---|---|---|
| Streaming (Old) | custom | **archived** — still referenced by an active bill |
| Side Hustle | custom | active |

**36 bill templates** covering all frequencies, plus these edge cases:

| Name | Category | Frequency | Amount | Notes |
|---|---|---|---|---|
| Rent | Housing | Monthly | €1,200.00 | |
| Electricity | Utilities | Monthly, every 2 months | €95.00 | |
| Internet | Utilities | Monthly | €39.99 | |
| Netflix | Subscriptions | Monthly | €17.99 | |
| Car Insurance | Insurance | Annual | €680.00 | |
| Gym Membership | Healthcare | Monthly | €45.00 | |
| Property Tax | Housing | Monthly, every 3 months | €210.00 | |
| Spotify *(archived bill)* | Subscriptions | Monthly | €10.99 | |
| Tyre Change | Transport | One-off | €180.00 | |
| Old Music App | **Streaming (Old)** *(archived category)* | Monthly | €4.99 | bill stays active — category is what's archived |
| Coworking Desk | **Side Hustle** *(custom category)* | Monthly | €120.00 | |
| Newspaper Subscription | Subscriptions | Monthly | €12.00 | with `end_period` 2026-12 (shows the last payment month on the tile) |
| Laptop Installments | Loans | Monthly | €89.99 | **fixed term** (`end_period` 2026-06) — all 6 instalments paid, no further payments generated |
| Phone Installments | Loans | Monthly | 129.00 PLN | **fixed term** (`end_period` 2026-12) — no payments generated after the last month |
| Climbing Gym Entries | Entertainment | Monthly | €12.00 | **several payment days** (3rd, 10th, 17th): one payment tile per day, every month |
| Concert Tickets | Entertainment | One-off | €65.00 | **several dates in different months**: one payment per date |
| Yoga Studio Membership *(archived bill)* | Healthcare | Monthly | €60.00 | |
| Cloud Storage 2TB *(archived bill)* | Subscriptions | Monthly | €9.99 | |
| Car Lease *(archived bill)* | Transport | Monthly | €310.00 | |
| Piano Lessons *(archived bill)* | Education | Monthly | €40.00 | |
| Course Instalments | Education | Monthly | €75.00 | **fixed term ending this month** (`inject_last_payment_bill` in `seed.py`): the current month's payment gets the "Last" ribbon |
| New Apartment Rent, Bike Insurance, Dentist Visits *(drafts)* | Housing, Insurance, Healthcare | Monthly, annual, one-off | €950.00, €85.00, €120.00 | **not activated yet**: no payments, Draft ribbon and Generate payments button on the Bills page (`inject_draft_bills` in `seed.py`) |
| Magazine Bundle *(draft)* | Subscriptions | Monthly | €14.00 | draft in the Subscriptions category, which holds every lifecycle state: active bills, drafts, paused with payments (Spotify, Cloud Storage 2TB), and the paused bill below (`inject_subscriptions_lifecycle` in `seed.py`) |
| Audiobook Plan *(paused, no payments)* | Subscriptions | Monthly | €9.50 | paused before its first payment, so the tile offers **Delete** next to Resume |

6 bills are archived in total, spread across 4 categories, so the Archive page (`/dashboard/bills/archived`) has enough entries to exercise its category filter and sort.

**80 payment instances** in `seed_data.json` (180 after the seed script adds the generated ones below) covering all statuses:
- **paid** — historical records with `paid_at` timestamps, across all four combinations of full/partial amount and with/without a note
- **overdue** — several bills with a missed payment
- **upcoming** — future periods ready to be paid
- Amounts that differ from the template (real-world invoice variance)

**Plus multi-currency history generated at seed time** (`inject_history` in `seed.py`): the 11 months before today get paid instances in EUR, PLN, USD and CHF (plus GBP/EUR annual insurance in single months), with varying utility amounts, so the dashboard's 12-month trend and currency chips have data whichever day you run the script. It only fills gaps: static rows for the same bill and month are kept. The account's default currency is set to EUR and its time zone to Europe/Warsaw (seed dates such as "due today" are computed in that zone).

**Plus the multi-day bills' payments generated at seed time** (`inject_multi_day_bills` in `seed.py`): Climbing Gym Entries gets three payments a month from three months back to next month, Concert Tickets gets one in this month and one in the next, dated relative to today.

**Plus 9 instances generated for the current month at seed time** (`inject_current_month_cases` in `seed.py`), since the static rows above are dated in fixed 2026 months that won't generally line up with whatever "today" is when you run the script. Whichever month the Payments page opens to by default, it shows every case at a glance: upcoming (due today), overdue, paid full amount with/without a note, and paid partial amount with/without a note.

## Requirements

- Docker containers must be running: `docker compose up`
- Python 3 with the `requests` package

## How to use

**1. Install the dependency (one time):**

```bash
python3 -m pip install requests
```

**2. Start the app:**

```bash
docker compose up
```

**3. Run the seed script from the project root**

```bash
python3 demo/seed.py
```

**4. Open the app:**

Go to [http://localhost:3010](http://localhost:3010) and log in with `demo@demo.com` / `demo1234`.

## Re-running

Running the script again on the same account **wipes and re-seeds** — the restore endpoint replaces all existing data for that user. Safe to run multiple times. If demo data is already present, the script skips the restore (to get the newest generated data run `docker compose down -v` first); force it with the export/restore API directly if you need to reapply an edited `seed_data.json` to an account that already has data.

## Editing the data

All seed data lives in `demo/seed_data.json`. It follows the same backup format used by the app's export/restore feature (`schema_version: 9`), including an explicit `categories` array — bill templates reference categories by `category_id`. Edit the JSON directly and re-run the script to apply changes.
