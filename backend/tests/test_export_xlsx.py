"""Integration tests for GET /export/xlsx — row count, is_deleted exclusion,
full-year backfill, and language translation."""

import io
from datetime import date, timedelta

import openpyxl

from app.core.i18n import LOCALES
from app.models.bill import PaymentInstance
from tests.conftest import (
    auth,
    category_id,
    register_and_login,
    sync_payments,
    today_utc,
)

_BILL_A = {
    "name": "Electric",
    "frequency": "monthly",
    "amount": 100.00,
    "currency": "PLN",
    "due_day": 10,
    "notes": None,
}

_BILL_B = {
    "name": "Internet",
    "frequency": "monthly",
    "amount": 60.00,
    "currency": "PLN",
    "due_day": 15,
    "notes": None,
}


def _data_rows(xlsx_bytes: bytes) -> int:
    """Count total data rows (excluding header) across all sheets in an XLSX workbook."""
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes))
    return sum(ws.max_row - 1 for ws in wb.worksheets if ws.max_row and ws.max_row > 1)


def test_xlsx_backfills_full_year_not_just_visited_months(client):
    """Export must include every month the bill is active in, not only months
    the user has already opened in the UI (bug: past/future months missing)."""
    tok = register_and_login(client, "xlsx_count@test.com")
    cat_id = category_id(client, tok)

    # Active from January — 12 months this year.
    r1 = client.post(
        "/bills",
        json={**_BILL_A, "category_id": cat_id, "due_month": 1},
        headers=auth(tok),
    )
    assert r1.status_code == 201

    current_year = today_utc().year
    r = client.get(f"/export/xlsx?year={current_year}", headers=auth(tok))
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    assert _data_rows(r.content) == 12


def test_xlsx_excludes_months_before_bill_start(client):
    """A bill starting in December must not backfill phantom Jan–Nov rows —
    regression check for the _bill_active_in_period monthly-anchor fix."""
    tok = register_and_login(client, "xlsx_start@test.com")
    cat_id = category_id(client, tok)

    r1 = client.post(
        "/bills",
        json={**_BILL_A, "category_id": cat_id, "due_month": 12},
        headers=auth(tok),
    )
    assert r1.status_code == 201

    current_year = today_utc().year
    r = client.get(f"/export/xlsx?year={current_year}", headers=auth(tok))
    assert r.status_code == 200
    assert _data_rows(r.content) == 1


def test_xlsx_excludes_deleted_instances(client):
    """Soft-deleted instances are excluded from the XLSX export (Phase 1 filter check)."""
    tok = register_and_login(client, "xlsx_del@test.com")
    current_year = today_utc().year

    r = client.post(
        "/bills",
        json={**_BILL_A, "category_id": category_id(client, tok), "due_month": 12},
        headers=auth(tok),
    )
    assert r.status_code == 201

    sync_payments(client, tok, month=f"{current_year}-12")
    payments = client.get(
        f"/bills/payments?month={current_year}-12", headers=auth(tok)
    ).json()
    assert len(payments) == 1
    instance_id = payments[0]["id"]

    r = client.delete(f"/bills/payments/{instance_id}", headers=auth(tok))
    assert r.status_code == 204

    r = client.get(f"/export/xlsx?year={current_year}", headers=auth(tok))
    assert r.status_code == 200
    assert _data_rows(r.content) == 0


def test_xlsx_partial_deletion(client):
    """Deleting one of two instances leaves exactly one row — proves filter is scoped, not blanket."""
    tok = register_and_login(client, "xlsx_partial@test.com")
    cat_id = category_id(client, tok)
    current_year = today_utc().year

    r1 = client.post(
        "/bills",
        json={**_BILL_A, "category_id": cat_id, "due_month": 12},
        headers=auth(tok),
    )
    assert r1.status_code == 201
    r2 = client.post(
        "/bills",
        json={**_BILL_B, "category_id": cat_id, "due_month": 12},
        headers=auth(tok),
    )
    assert r2.status_code == 201

    sync_payments(client, tok, month=f"{current_year}-12")
    payments = client.get(
        f"/bills/payments?month={current_year}-12", headers=auth(tok)
    ).json()
    assert len(payments) == 2

    r = client.delete(f"/bills/payments/{payments[0]['id']}", headers=auth(tok))
    assert r.status_code == 204

    r = client.get(f"/export/xlsx?year={current_year}", headers=auth(tok))
    assert r.status_code == 200
    assert _data_rows(r.content) == 1


def test_xlsx_lang_translates_headers_and_sheet_names(client):
    """?lang=pl produces Polish column headers/sheet names and a matching filename."""
    tok = register_and_login(client, "xlsx_lang@test.com")
    r1 = client.post(
        "/bills",
        json={**_BILL_A, "category_id": category_id(client, tok), "due_month": 1},
        headers=auth(tok),
    )
    assert r1.status_code == 201

    current_year = today_utc().year
    r = client.get(f"/export/xlsx?year={current_year}&lang=pl", headers=auth(tok))
    assert r.status_code == 200
    assert f"pay-tracker-pl-{current_year}.xlsx" in r.headers["content-disposition"]

    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    assert "sty" in wb.sheetnames[0]
    header_row = [cell.value for cell in next(wb.worksheets[0].iter_rows(max_row=1))]
    assert header_row[0] == "Rachunek"


def test_xlsx_defaults_to_english_for_unknown_lang(client):
    tok = register_and_login(client, "xlsx_lang_default@test.com")
    r1 = client.post(
        "/bills",
        json={**_BILL_A, "category_id": category_id(client, tok), "due_month": 1},
        headers=auth(tok),
    )
    assert r1.status_code == 201

    current_year = today_utc().year
    r = client.get(f"/export/xlsx?year={current_year}&lang=xx", headers=auth(tok))
    assert r.status_code == 200
    assert f"pay-tracker-en-{current_year}.xlsx" in r.headers["content-disposition"]


def test_xlsx_shows_per_payment_amount_for_unpaid(client):
    """An unpaid payment with its own amount appears in the export with that amount."""
    tok = register_and_login(client, "xlsx_ovr@test.com")
    today = today_utc()
    r = client.post(
        "/bills",
        json={
            **_BILL_A,
            "category_id": category_id(client, tok),
            "due_month": today.month,
        },
        headers=auth(tok),
    )
    assert r.status_code == 201
    sync_payments(client, tok, month=today.strftime("%Y-%m"))
    [inst] = client.get("/bills/payments", headers=auth(tok)).json()
    r = client.patch(
        f"/bills/payments/{inst['id']}", json={"amount": "143.20"}, headers=auth(tok)
    )
    assert r.status_code == 200

    r = client.get(f"/export/xlsx?year={today.year}", headers=auth(tok))
    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    period = today.strftime("%Y-%m")
    rows = [
        row
        for ws in wb.worksheets
        for row in ws.iter_rows(min_row=2, values_only=True)
        if row[2] == period
    ]
    assert [row[4] for row in rows] == [
        "143.20"
    ]  # columns: Bill, Category, Period, Due Date, Amount


def test_xlsx_amount_uses_chosen_decimal_separator_and_is_text(client):
    """Amount/Paid Amount cells follow the user's decimal_separator preference and
    are written as Text (not Number) cells, so Excel never reflows the separator.

    A Number-cell + locale-tagged-format approach was tried instead (to avoid
    Excel's "stored as text" warning) but doesn't actually control the rendered
    decimal glyph — that's driven by the opening machine's own regional settings
    regardless of any locale tag — confirmed broken in real, non-US-locale Excel."""
    tok = register_and_login(client, "xlsx_sep@test.com")
    r = client.patch("/auth/me", json={"decimal_separator": ","}, headers=auth(tok))
    assert r.status_code == 200

    today = today_utc()
    r = client.post(
        "/bills",
        json={
            **_BILL_A,
            "category_id": category_id(client, tok),
            "due_month": today.month,
        },
        headers=auth(tok),
    )
    assert r.status_code == 201
    sync_payments(client, tok, month=today.strftime("%Y-%m"))

    r = client.get(f"/export/xlsx?year={today.year}", headers=auth(tok))
    assert r.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    period = today.strftime("%Y-%m")
    cells = [
        cell
        for ws in wb.worksheets
        for row in ws.iter_rows(min_row=2)
        if row[2].value == period
        for cell in [row[4]]
    ]
    assert [c.value for c in cells] == ["100,00"]
    assert all(c.data_type == "s" for c in cells)  # "s" = string, never a Number cell
    assert all(c.number_format == "@" for c in cells)


def _monthly_bill_from_january(client, email):
    tok = register_and_login(client, email)
    r = client.post(
        "/bills",
        json={**_BILL_A, "category_id": category_id(client, tok), "due_month": 1},
        headers=auth(tok),
    )
    assert r.status_code == 201
    return tok


def test_xlsx_month_param_exports_single_month(client):
    """?month=N yields one sheet with only that month's rows, and a month-suffixed filename."""
    tok = _monthly_bill_from_january(client, "xlsx_month@test.com")
    year = today_utc().year

    r = client.get(f"/export/xlsx?year={year}&month=3", headers=auth(tok))
    assert r.status_code == 200
    assert f"pay-tracker-en-{year}-03.xlsx" in r.headers["content-disposition"]

    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    assert wb.sheetnames == [f"Mar {year}"]
    assert _data_rows(r.content) == 1
    assert wb.worksheets[0]["C2"].value == f"{year}-03"


def test_xlsx_without_month_exports_all_twelve_sheets(client):
    """Regression: the month query param must not leak into the whole-year export
    (it was once overwritten by a loop variable, yielding a single month)."""
    tok = _monthly_bill_from_january(client, "xlsx_allmonths@test.com")
    year = today_utc().year

    r = client.get(f"/export/xlsx?year={year}", headers=auth(tok))
    assert r.status_code == 200
    assert f"pay-tracker-en-{year}.xlsx" in r.headers["content-disposition"]
    assert len(openpyxl.load_workbook(io.BytesIO(r.content)).sheetnames) == 12
    assert _data_rows(r.content) == 12


def test_xlsx_rejects_out_of_range_month(client):
    tok = register_and_login(client, "xlsx_badmonth@test.com")
    for bad in (0, 13):
        r = client.get(f"/export/xlsx?year=2026&month={bad}", headers=auth(tok))
        assert r.status_code == 422


def test_xlsx_supports_every_frontend_locale(client):
    """Every locale in locales.json must have translated headers, status and
    sheet names — an unsupported one silently falls back to English."""
    locales = LOCALES
    assert len(locales) >= 7
    tok = _monthly_bill_from_january(client, "xlsx_alllocales@test.com")
    year = today_utc().year

    headers = {}
    for lang in locales:
        r = client.get(f"/export/xlsx?year={year}&lang={lang}", headers=auth(tok))
        assert r.status_code == 200
        assert f"pay-tracker-{lang}-{year}.xlsx" in r.headers["content-disposition"]
        ws = openpyxl.load_workbook(io.BytesIO(r.content)).worksheets[0]
        headers[lang] = tuple(c.value for c in ws[1])
    # en is the fallback, so every other locale must differ from it.
    assert all(h != headers["en"] for lang, h in headers.items() if lang != "en")


def test_xlsx_has_print_footer(client):
    tok = _monthly_bill_from_january(client, "xlsx_footer@test.com")
    r = client.get("/export/xlsx", headers=auth(tok))
    ws = openpyxl.load_workbook(io.BytesIO(r.content)).worksheets[0]
    assert ws.oddFooter.left.text.startswith("© ")
    assert ws.oddFooter.right.text == "&P / &N"
    assert ws.page_setup.orientation == "landscape"
    assert ws.sheet_properties.pageSetUpPr.fitToPage
    assert (ws.page_setup.fitToWidth, ws.page_setup.fitToHeight) == (1, 0)


def test_xlsx_status_follows_due_date_not_stored_value(client_db):
    """Same rule as the API: a stored "overdue" with a future due date reads
    Upcoming, and a stored "upcoming" that is past due reads Overdue."""
    client, db = client_db
    tok = register_and_login(client, "xlsx_status@test.com")
    cat_id = category_id(client, tok)
    today = today_utc()
    for name in ("Stored overdue", "Stored upcoming"):
        r = client.post(
            "/bills",
            json={
                **_BILL_A,
                "name": name,
                "category_id": cat_id,
                "due_month": today.month,
            },
            headers=auth(tok),
        )
        assert r.status_code == 201
    sync_payments(client, tok, month=today.strftime("%Y-%m"))
    by_name = {i.template.name: i for i in db.query(PaymentInstance).all()}
    by_name["Stored overdue"].status = "overdue"
    by_name["Stored overdue"].due_date = today + timedelta(days=5)
    by_name["Stored upcoming"].status = "upcoming"
    by_name["Stored upcoming"].due_date = today - timedelta(days=5)
    db.commit()

    r = client.get(f"/export/xlsx?year={today.year}", headers=auth(tok))
    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    period = today.strftime("%Y-%m")
    # columns: Bill, Category, Period, Due Date, Amount, Currency, Status
    status = {
        row[0]: row[6]
        for ws in wb.worksheets
        for row in ws.iter_rows(min_row=2, values_only=True)
        if row[2] == period
    }
    assert status["Stored overdue"] == "Upcoming"
    assert status["Stored upcoming"] == "Overdue"


def test_xlsx_has_a_row_per_payment_day(client):
    """A bill with three days a month exports three rows for every active month."""
    tok = register_and_login(client, "xlsx_multi@test.com")
    r = client.post(
        "/bills",
        json={
            **_BILL_A,
            "category_id": category_id(client, tok),
            "due_month": 1,
            "due_days": [3, 10, 17],
        },
        headers=auth(tok),
    )
    assert r.status_code == 201, r.text

    r = client.get(f"/export/xlsx?year={today_utc().year}", headers=auth(tok))

    assert r.status_code == 200
    assert _data_rows(r.content) == 36
