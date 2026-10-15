#!/usr/bin/env python3
"""Seed the database with demo data via the restore API endpoint."""

import json
import os
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    import requests
except ImportError:
    print("Missing dependency. Run: pip install requests")
    sys.exit(1)

BASE_URL = os.environ.get("SEED_BASE_URL", "http://localhost:8010")
EMAIL = "demo@demo.com"
PASSWORD = "demo1234"
DATA_FILE = Path(__file__).parent / "seed_data.json"
# The demo account's time zone. "Today" below is the calendar date in this zone, the same
# one the app uses for this account, so "due today" isn't overdue when the script runs
# near midnight UTC.
DEMO_TIMEZONE = "Europe/Warsaw"


def today_in_demo_zone() -> date:
    try:
        return datetime.now(ZoneInfo(DEMO_TIMEZONE)).date()
    except ZoneInfoNotFoundError:  # e.g. Windows without the tzdata package
        return date.today()


def register(session: requests.Session) -> None:
    r = session.post(f"{BASE_URL}/auth/register", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code == 201:
        print(f"  User created: {EMAIL}")
    elif r.status_code in (400, 409) and "already" in r.text.lower():
        print(f"  User already exists: {EMAIL}")
    else:
        print(f"  Register failed ({r.status_code}): {r.text}")
        sys.exit(1)


def login(session: requests.Session) -> str:
    r = session.post(f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        print(f"  Login failed ({r.status_code}): {r.text}")
        sys.exit(1)
    token = r.cookies["access_token"]  # the JWT is cookie-only
    print("  Logged in, token received")
    return token


def inject_current_month_cases(data: dict) -> dict:
    """Replace whichever bills the current month lands on with instances covering
    every status/amount/note combination, so the Payments page shows the full
    variety immediately on the month it opens to by default — regardless of
    which real-world date the script is run on. Static seed_data.json rows are
    dated in fixed 2026 months and won't generally line up with "today"."""
    today = today_in_demo_zone()
    period = today.strftime("%Y-%m")
    today_iso = today.isoformat()
    created_at = f"{today_iso}T09:00:00+00:00"

    def day(n: int) -> str:
        # Earlier day in the current month, clamped to the 1st if that would
        # spill into the previous month (e.g. script run on the 1st/2nd).
        d = today - timedelta(days=n)
        if d.month != today.month or d.year != today.year:
            d = today.replace(day=1)
        return d.isoformat()

    current_month_cases = [
        # Rent — upcoming, due today
        {
            "id": 9001, "bill_id": 1, "period": period, "due_date": today_iso,
            "amount": 1200.0, "status": "upcoming", "paid_at": None,
            "paid_amount": None, "notes": None, "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": False,
        },
        # Internet — overdue
        {
            "id": 9002, "bill_id": 4, "period": period, "due_date": day(6),
            "amount": 39.99, "status": "overdue", "paid_at": None,
            "paid_amount": None, "notes": None, "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": True,
        },
        # Gym Membership — paid, full amount, no note
        {
            "id": 9003, "bill_id": 14, "period": period, "due_date": day(5),
            "amount": 45.0, "status": "paid", "paid_at": f"{day(5)}T07:00:00+00:00",
            "paid_amount": 45.0, "notes": None, "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": False,
        },
        # Netflix — paid, full amount, with note
        {
            "id": 9004, "bill_id": 8, "period": period, "due_date": day(4),
            "amount": 17.99, "status": "paid", "paid_at": f"{day(4)}T08:00:00+00:00",
            "paid_amount": 17.99, "notes": "Paid via gift card", "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": False,
        },
        # Language School — paid, partial amount, no note
        {
            "id": 9005, "bill_id": 17, "period": period, "due_date": day(3),
            "amount": 89.0, "status": "paid", "paid_at": f"{day(3)}T09:00:00+00:00",
            "paid_amount": 80.0, "notes": None, "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": False,
        },
        # Cinema Club — paid, partial amount, with note
        {
            "id": 9006, "bill_id": 11, "period": period, "due_date": day(2),
            "amount": 24.99, "status": "paid", "paid_at": f"{day(2)}T09:00:00+00:00",
            "paid_amount": 19.99, "notes": "Group discount applied", "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": False,
        },
        # Multi-currency: Bus Pass (PLN) overdue, Property Tax (PLN) upcoming,
        # Old Music App (USD) overdue, so every currency chip on the dashboard has data.
        {
            "id": 9007, "bill_id": 12, "period": period, "due_date": day(8),
            "amount": 55.0, "status": "overdue", "paid_at": None,
            "paid_amount": None, "notes": None, "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": True,
        },
        {
            "id": 9008, "bill_id": 2, "period": period, "due_date": today_iso,
            "amount": 210.0, "status": "upcoming", "paid_at": None,
            "paid_amount": None, "notes": None, "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": False,
        },
        {
            "id": 9009, "bill_id": 20, "period": period, "due_date": day(7),
            "amount": 4.99, "status": "overdue", "paid_at": None,
            "paid_amount": None, "notes": None, "created_at": created_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": True,
        },
    ]

    # Remove any static instance that would collide on (bill_id, period)
    current_month_keys = {(inst["bill_id"], period) for inst in current_month_cases}
    data["payment_instances"] = [
        inst for inst in data["payment_instances"]
        if (inst["bill_id"], inst["period"]) not in current_month_keys
    ]
    data["payment_instances"].extend(current_month_cases)
    return data


# (bill_id, base amount, due day, spread): monthly bills in four currencies.
# spread > 0 makes the amount vary month to month (utilities), so trend bars aren't flat.
HISTORY_MONTHLY = [
    (1, 1200.0, 1, 0.0),    # Rent, EUR
    (3, 95.0, 15, 0.25),    # Electricity, EUR
    (5, 45.0, 20, 0.30),    # Gas, EUR
    (14, 45.0, 1, 0.0),     # Gym, EUR
    (12, 55.0, 1, 0.0),     # Bus Pass, PLN
    (17, 89.0, 3, 0.0),     # Language School, PLN
    (21, 120.0, 1, 0.0),    # Coworking, PLN
    (8, 17.99, 22, 0.0),    # Netflix, USD
    (20, 4.99, 12, 0.0),    # Old Music App, USD
    (25, 310.0, 1, 0.0),    # Car Lease, CHF (bill archived now, was active then)
]
# One-off yearly bills: (bill_id, amount, due day, months back). Car Insurance is the GBP one.
HISTORY_ANNUAL = [(6, 680.0, 1, 7), (7, 320.0, 1, 4)]


def inject_history(data: dict) -> dict:
    """Fill the 11 months before today with paid instances in EUR/PLN/USD/CHF/GBP so
    the dashboard trend chart is populated relative to whenever the script runs.
    Only fills gaps: a static instance for the same (bill_id, period) is kept, so
    the hand-written edge cases (overdue, partial, notes) survive."""
    today = today_in_demo_zone()
    rng = random.Random(42)  # deterministic: re-seeding gives the same chart
    taken = {(i["bill_id"], i["period"]) for i in data["payment_instances"]}
    next_id = 8000

    def month_back(n: int) -> tuple[int, int]:
        idx = today.year * 12 + today.month - 1 - n
        return idx // 12, idx % 12 + 1

    def add(bill_id: int, amount: float, due_day: int, n: int) -> None:
        nonlocal next_id
        y, m = month_back(n)
        period = f"{y}-{m:02d}"
        if (bill_id, period) in taken:
            return
        due = date(y, m, min(due_day, 28))
        paid_at = f"{(due - timedelta(days=1)).isoformat()}T09:00:00+00:00"
        data["payment_instances"].append({
            "id": next_id, "bill_id": bill_id, "period": period,
            "due_date": due.isoformat(), "amount": amount, "status": "paid",
            "paid_at": paid_at, "paid_amount": amount, "notes": None,
            "created_at": paid_at,
            "reminder_sent_upcoming": True, "reminder_sent_overdue": False,
        })
        next_id += 1
        taken.add((bill_id, period))

    for n in range(1, 12):
        for bill_id, base, due_day, spread in HISTORY_MONTHLY:
            amount = round(base * (1 + rng.uniform(-spread, spread)), 2)
            add(bill_id, amount, due_day, n)
    for bill_id, amount, due_day, n in HISTORY_ANNUAL:
        add(bill_id, amount, due_day, n)
    return data


def inject_multi_day_bills(data: dict) -> dict:
    """Two bills that pay on several days: a monthly one (3rd, 10th and 17th, one
    payment each) and a one-off with dates in two different months. Dated relative to
    today like the other generated rows, so it looks right whenever the script runs."""
    today = today_in_demo_zone()
    ENTERTAINMENT = 2

    def period_at(offset: int) -> tuple[int, int]:
        idx = today.year * 12 + today.month - 1 + offset
        return idx // 12, idx % 12 + 1

    sy, sm = period_at(-3)
    cy, cm = period_at(0)
    data["bill_templates"].extend([
        {
            "id": 29, "name": "Climbing Gym Entries",
            "category_id": ENTERTAINMENT, "frequency": "monthly",
            "interval": 1, "amount": 12.0, "currency": "EUR", "due_day": 3,
            "due_days": [3, 10, 17], "notes": "Single entries instead of a pass",
            "status": "active", "start_period": f"{sy}-{sm:02d}", "end_period": None,
            "created_at": f"{sy}-{sm:02d}-01T08:00:00+00:00",
        },
        {
            "id": 30, "name": "Concert Tickets",
            "category_id": ENTERTAINMENT, "frequency": "one_off",
            "interval": 1, "amount": 65.0, "currency": "EUR", "due_day": None,
            "notes": "Two shows, bought separately", "status": "active",
            "start_period": f"{cy}-{cm:02d}", "end_period": None,
            "created_at": f"{cy}-{cm:02d}-01T08:00:00+00:00",
        },
    ])

    next_id = 7000

    def instance(bill_id: int, period: str, slot: int, due: date, amount: float) -> dict:
        nonlocal next_id
        if due < today and (period < today.strftime("%Y-%m") or slot == 0):
            status = "paid"
        elif due < today:
            status = "overdue"
        else:
            status = "upcoming"
        paid = status == "paid"
        paid_at = f"{(due - timedelta(days=1)).isoformat()}T09:00:00+00:00" if paid else None
        next_id += 1
        return {
            "id": next_id, "bill_id": bill_id, "period": period, "slot": slot,
            "due_date": due.isoformat(), "amount": amount, "status": status,
            "paid_at": paid_at, "paid_amount": amount if paid else None, "notes": None,
            "created_at": f"{period}-01T08:00:00+00:00",
            "reminder_sent_upcoming": True, "reminder_sent_overdue": status == "overdue",
        }

    for offset in range(-3, 2):  # three past months, this one, next
        y, m = period_at(offset)
        for slot, day in enumerate([3, 10, 17]):
            data["payment_instances"].append(
                instance(29, f"{y}-{m:02d}", slot, date(y, m, day), 12.0)
            )
    for offset, day in [(0, 20), (1, 5)]:
        y, m = period_at(offset)
        data["payment_instances"].append(
            instance(30, f"{y}-{m:02d}", 0, date(y, m, day), 65.0)
        )
    return data


def inject_last_payment_bill(data: dict) -> dict:
    """A fixed-term bill whose final instalment is this month, so the Payments page shows
    the "Last" ribbon on the month it opens to, whenever the script runs."""
    today = today_in_demo_zone()
    EDUCATION = 1

    def period_at(offset: int) -> tuple[int, int]:
        idx = today.year * 12 + today.month - 1 + offset
        return idx // 12, idx % 12 + 1

    sy, sm = period_at(-5)
    cy, cm = period_at(0)
    data["bill_templates"].append({
        "id": 34, "name": "Course Instalments", "category_id": EDUCATION,
        "frequency": "monthly", "interval": 1, "amount": 75.0, "currency": "EUR",
        "due_day": 28, "notes": "Six instalments, this is the last one",
        "status": "active", "start_period": f"{sy}-{sm:02d}",
        "end_period": f"{cy}-{cm:02d}", "created_at": f"{sy}-{sm:02d}-01T08:00:00+00:00",
    })
    for n, offset in enumerate(range(-5, 1)):
        y, m = period_at(offset)
        due = date(y, m, 28)
        paid = offset < 0
        paid_at = f"{date(y, m, 27).isoformat()}T09:00:00+00:00" if paid else None
        status = "paid" if paid else ("overdue" if due < today else "upcoming")
        data["payment_instances"].append({
            "id": 7500 + n, "bill_id": 34, "period": f"{y}-{m:02d}", "slot": 0,
            "due_date": due.isoformat(), "amount": 75.0, "status": status,
            "paid_at": paid_at, "paid_amount": 75.0 if paid else None, "notes": None,
            "created_at": f"{y}-{m:02d}-01T08:00:00+00:00",
            "reminder_sent_upcoming": True, "reminder_sent_overdue": status == "overdue",
        })
    return data


def inject_draft_bills(data: dict) -> dict:
    """Bills that are not activated yet (no payments exist): a monthly one starting next
    month, an annual one, and a one-off with its dates kept on the draft."""
    today = today_in_demo_zone()

    def period_at(offset: int) -> tuple[int, int]:
        idx = today.year * 12 + today.month - 1 + offset
        return idx // 12, idx % 12 + 1

    ny, nm = period_at(1)
    ay, am = period_at(4)
    d1, d2 = date(ny, nm, 12), date(*period_at(2), 12)
    created_at = f"{today.isoformat()}T09:00:00+00:00"
    base = {"interval": 1, "status": "draft", "end_period": None,
            "created_at": created_at}
    data["bill_templates"].extend([
        {**base, "id": 31, "name": "New Apartment Rent", "category_id": 4,
         "frequency": "monthly", "amount": 950.0, "currency": "EUR", "due_day": 1,
         "notes": "Starts when the lease begins", "start_period": f"{ny}-{nm:02d}"},
        {**base, "id": 32, "name": "Bike Insurance", "category_id": 5,
         "frequency": "annual", "amount": 85.0, "currency": "EUR", "due_day": 10,
         "notes": None, "start_period": f"{ay}-{am:02d}"},
        {**base, "id": 33, "name": "Dentist Visits", "category_id": 3,
         "frequency": "one_off", "amount": 120.0, "currency": "EUR", "due_day": None,
         "notes": "Two appointments", "start_period": f"{ny}-{nm:02d}",
         "draft_dates": [d1.isoformat(), d2.isoformat()]},
    ])
    return data


def inject_subscriptions_lifecycle(data: dict) -> dict:
    """Completes the Subscriptions category so it shows every bill lifecycle state: Cloud
    Storage 2TB and Spotify are already paused with payments (Resume only), so this adds a
    draft and a paused bill with no payments at all (Resume and Delete)."""
    today = today_in_demo_zone()
    SUBSCRIPTIONS = 6
    ny, m0 = divmod(today.year * 12 + today.month - 1 + 2, 12)
    start = f"{ny}-{m0 + 1:02d}"
    created_at = f"{today.isoformat()}T09:00:00+00:00"
    base = {"category_id": SUBSCRIPTIONS, "interval": 1, "frequency": "monthly",
            "currency": "EUR", "end_period": None, "created_at": created_at}
    data["bill_templates"].extend([
        {**base, "id": 35, "name": "Magazine Bundle", "amount": 14.0, "due_day": 8,
         "notes": "Waiting for the offer to start", "status": "draft",
         "start_period": start},
        {**base, "id": 36, "name": "Audiobook Plan", "amount": 9.5, "due_day": 8,
         "notes": "Paused before the first payment", "status": "paused",
         "start_period": start},
    ])
    return data


def has_data(session: requests.Session, token: str) -> bool:
    r = session.get(
        f"{BASE_URL}/bills",
        headers={"Authorization": f"Bearer {token}"},
    )
    return r.status_code == 200 and len(r.json()) > 0


def configure_profile(session: requests.Session, token: str) -> None:
    r = session.patch(
        f"{BASE_URL}/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        json={
            # Every notification channel off: the demo account must never send anything.
            "email_reminders_enabled": False,
            "monthly_summary_enabled": False,
            "telegram_reminders_enabled": False,
            "telegram_monthly_summary_enabled": False,
            "browser_notifications_enabled": False,
            # Share by email only sends when a user clicks Share, so it is safe to leave on.
            "share_enabled": True,
            # enabled_languages left out: new accounts get every app language by default.
            "language_preference": "en",
            "default_currency": "EUR",
            "timezone": DEMO_TIMEZONE,
        },
    )
    if r.status_code != 200:
        print(f"  Profile configuration failed ({r.status_code}): {r.text}")
        sys.exit(1)
    print(f"  All notifications (email, Telegram, browser) disabled, language English (all languages enabled), default currency EUR, time zone {DEMO_TIMEZONE}, share by email enabled")


def restore(session: requests.Session, token: str) -> None:
    if has_data(session, token):
        print("  Demo data already present, skipping restore.")
        return
    data = json.loads(DATA_FILE.read_text())
    data = inject_current_month_cases(data)
    data = inject_history(data)
    data = inject_multi_day_bills(data)
    data = inject_last_payment_bill(data)
    data = inject_draft_bills(data)
    data = inject_subscriptions_lifecycle(data)
    payload = json.dumps(data)
    r = session.post(
        f"{BASE_URL}/export/restore",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("seed_data.json", payload, "application/json")},
    )
    if r.status_code != 200:
        print(f"  Restore failed ({r.status_code}): {r.text}")
        sys.exit(1)
    result = r.json()
    print(f"  Restored {result['restored_templates']} bill templates")
    print(f"  Restored {result['restored_instances']} payment instances")


def main() -> None:
    if not DATA_FILE.exists():
        print(f"Seed data file not found: {DATA_FILE}")
        sys.exit(1)

    print("Pay Tracker — demo seed")
    print(f"Target: {BASE_URL}")
    print()

    with requests.Session() as session:
        print("1. Registering user...")
        register(session)

        print("2. Logging in...")
        token = login(session)

        print("3. Restoring seed data...")
        restore(session, token)

        print("4. Configuring profile...")
        configure_profile(session, token)

    print()
    print("Done. Log in at http://localhost:3010")
    print(f"  Email:    {EMAIL}")
    print(f"  Password: {PASSWORD}")


if __name__ == "__main__":
    main()
