"""Unit tests for app/services/email.py — mocks notify.send (Apprise)."""

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.core.i18n import BRAND
from app.services.email import (
    send_monthly_summary_email,
    send_password_reset_email,
    send_reminder_email,
)


@pytest.fixture
def sent():
    with patch("app.services.email.notify.send") as m:
        yield m


def _subject(m):
    return m.call_args.args[1]


def _body(m):
    return m.call_args.args[2]


_BASE = dict(
    smtp_host="smtp.example.com",
    smtp_port=587,
    smtp_user="user@example.com",
    smtp_password="secret",
    from_addr="reminders@example.com",
    to_addr="user@example.com",
    bill_name="Internet",
    due_date=date(2026, 6, 17),
    amount=Decimal("99.99"),
    currency="PLN",
)


def _call(**overrides):
    return {**_BASE, **overrides}


_SUBJECT_CASES = [
    ("2_days_before", "en", "Reminder: Internet due in 2 days (99.99 PLN)"),
    ("2_days_before", "pl", "Przypomnienie: Internet płatne za 2 dni (99.99 PLN)"),
    ("2_days_before", "de", "Erinnerung: Internet fällig in 2 Tagen (99.99 PLN)"),
    ("upcoming", "en", "Reminder: Internet due tomorrow (99.99 PLN)"),
    ("upcoming", "pl", "Przypomnienie: Internet płatne jutro (99.99 PLN)"),
    ("upcoming", "de", "Erinnerung: Internet fällig morgen (99.99 PLN)"),
    ("on_day", "en", "Due today: Internet (99.99 PLN)"),
    ("on_day", "pl", "Płatne dziś: Internet (99.99 PLN)"),
    ("on_day", "de", "Heute fällig: Internet (99.99 PLN)"),
    ("1_day_after", "en", "Overdue: Internet was due yesterday (99.99 PLN)"),
    ("1_day_after", "pl", "Zaległość: Internet było płatne wczoraj (99.99 PLN)"),
    ("1_day_after", "de", "Überfällig: Internet war gestern fällig (99.99 PLN)"),
]


@pytest.mark.parametrize("kind,language,expected_subject", _SUBJECT_CASES)
def test_subject_combinations(sent, kind, language, expected_subject):
    send_reminder_email(**_call(kind=kind, language=language))

    assert _subject(sent) == expected_subject


def test_unknown_language_falls_back_to_english(sent):
    send_reminder_email(**_call(kind="upcoming", language="xx"))

    assert _subject(sent) == "Reminder: Internet due tomorrow (99.99 PLN)"


def test_reminder_body_contains_bill_name_amount_due_date(sent):
    """HTML body must contain the bill name, amount, and due date — blank template vars fail here."""
    send_reminder_email(**_call(kind="upcoming", language="en"))

    body = _body(sent)
    assert "Internet" in body
    assert "99.99" in body
    assert "2026-06-17" in body or "June 17" in body or "17" in body


def test_reminder_body_on_day_kind_contains_bill_details(sent):
    send_reminder_email(**_call(kind="on_day", language="en"))

    body = _body(sent)
    assert "Internet" in body
    assert "PLN" in body


# ---------------------------------------------------------------------------
# Monthly summary email tests
# ---------------------------------------------------------------------------

_SUMMARY_BASE = dict(
    smtp_host="smtp.example.com",
    smtp_port=587,
    smtp_user="user@example.com",
    smtp_password="secret",
    from_addr="reminders@example.com",
    to_addr="user@example.com",
    month_label="June 2026",
    language="en",
)

_PAID_ROW = {
    "name": "Internet",
    "due_date": "2026-06-10",
    "amount": Decimal("99.99"),
    "paid_amount": Decimal("99.99"),
    "currency": "PLN",
    "paid_at": datetime(2026, 6, 10, 12, 0, tzinfo=UTC),
}

_UNPAID_ROW = {
    "name": "Netflix",
    "due_date": "2026-06-20",
    "amount": Decimal("45.00"),
    "currency": "PLN",
}


def test_monthly_summary_sends_html_email(sent):
    send_monthly_summary_email(
        **_SUMMARY_BASE,
        paid_rows=[_PAID_ROW],
        unpaid_rows=[_UNPAID_ROW],
    )

    sent.assert_called_once()
    assert _subject(sent) == "Monthly summary for June 2026"
    html = _body(sent)
    assert "Internet" in html
    assert "Netflix" in html


def test_monthly_summary_mismatch_shows_both_amounts(sent):
    mismatch_row = {**_PAID_ROW, "paid_amount": Decimal("95.00")}
    send_monthly_summary_email(
        **_SUMMARY_BASE,
        paid_rows=[mismatch_row],
        unpaid_rows=[],
    )

    html = _body(sent)
    assert "95.00" in html
    assert "99.99" in html  # expected amount also shown


def test_monthly_summary_empty_paid_section(sent):
    send_monthly_summary_email(
        **_SUMMARY_BASE,
        paid_rows=[],
        unpaid_rows=[_UNPAID_ROW],
    )

    html = _body(sent)
    assert "No payments were marked as paid this month" in html
    assert "Netflix" in html


@pytest.mark.parametrize(
    "language,expected_subject",
    [
        ("en", "Monthly summary for June 2026"),
        ("pl", "Miesięczne podsumowanie za June 2026"),
        ("de", "Monatliche Zusammenfassung für June 2026"),
    ],
)
def test_monthly_summary_multilingual_subject(sent, language, expected_subject):
    send_monthly_summary_email(
        **{**_SUMMARY_BASE, "language": language},
        paid_rows=[],
        unpaid_rows=[],
    )

    assert _subject(sent) == expected_subject


def test_monthly_summary_unknown_language_falls_back_to_english(sent):
    send_monthly_summary_email(
        **{**_SUMMARY_BASE, "language": "xx"},
        paid_rows=[],
        unpaid_rows=[],
    )

    assert _subject(sent) == "Monthly summary for June 2026"


# ---------------------------------------------------------------------------
# Password reset email tests
# ---------------------------------------------------------------------------

_RESET_BASE = dict(
    smtp_host="smtp.example.com",
    smtp_port=587,
    smtp_user="user@example.com",
    smtp_password="secret",
    smtp_use_tls=True,
    from_addr="noreply@example.com",
    to_addr="target@example.com",
    reset_url="http://localhost:3010/reset-password?token=abc123",
    language="en",
)


@pytest.mark.parametrize(
    "language,expected_subject",
    [
        ("en", f"Reset {BRAND['name']} password"),
        ("pl", f"Zresetuj hasło {BRAND['name']}"),
        ("de", f"{BRAND['name']} Passwort zurücksetzen"),
    ],
)
def test_reset_email_subject_per_language(sent, language, expected_subject):
    send_password_reset_email(**{**_RESET_BASE, "language": language})

    assert _subject(sent) == expected_subject


def test_reset_email_body_contains_reset_url(sent):
    reset_url = "http://localhost:3010/reset-password?token=my-special-token"
    send_password_reset_email(**{**_RESET_BASE, "reset_url": reset_url})

    body = _body(sent)
    assert reset_url in body


def test_reset_email_unknown_language_falls_back_to_english(sent):
    send_password_reset_email(**{**_RESET_BASE, "language": "xx"})

    assert _subject(sent) == f"Reset {BRAND['name']} password"
