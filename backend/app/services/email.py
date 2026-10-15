import html
import re
from datetime import date
from decimal import Decimal
from html import escape as _escape
from typing import Any

from app.core.i18n import resolve_locale, t
from app.services import notify


def _deliver(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str | None,
    smtp_password: str | None,
    smtp_use_tls: bool,
    from_addr: str,
    to_addr: str,
    subject: str,
    body: str,
    *,
    html: bool = False,
) -> None:
    url = notify.smtp_url(
        host=smtp_host,
        port=smtp_port,
        user=smtp_user,
        password=smtp_password,
        use_tls=smtp_use_tls,
        from_addr=from_addr,
        to_addr=to_addr,
    )
    if (
        not html
    ):  # plain-text emails go out as HTML too, so the footer is identical everywhere
        body = re.sub(r"(https?://[^\s<]+)", r'<a href="\1">\1</a>', _escape(body))
        body = f'<div style="white-space:pre-wrap">{body}</div>'
    notify.send(url, subject, body, html=True)


def send_reminder_email(
    *,
    smtp_host: str,
    smtp_port: int,
    smtp_user: str | None,
    smtp_password: str | None,
    smtp_use_tls: bool = True,
    from_addr: str = "",
    to_addr: str,
    bill_name: str,
    due_date: date,
    amount: Decimal,
    currency: str,
    kind: str,
    language: str,
) -> None:
    subject, body = reminder_text(
        bill_name=bill_name,
        due_date=due_date,
        amount=amount,
        currency=currency,
        kind=kind,
        language=language,
    )
    _deliver(
        smtp_host,
        smtp_port,
        smtp_user,
        smtp_password,
        smtp_use_tls,
        from_addr,
        to_addr,
        subject,
        body,
    )


def _build_summary_html(
    month_label: str,
    paid_rows: list[dict[str, Any]],
    unpaid_rows: list[dict[str, Any]],
    lang: str,
) -> str:
    h = {
        k: t(lang, f"Notifications.summary.{k}")
        for k in (
            "intro",
            "paid_header",
            "unpaid_header",
            "bill",
            "due_date",
            "expected",
            "paid",
            "paid_on",
            "amount",
            "nothing_paid",
            "nothing_unpaid",
            "total_paid",
            "total_outstanding",
            "footer",
        )
    }

    def fmt_amount(amount: Any, currency: str) -> str:
        value = Decimal(str(amount))
        return f"{value:.2f} {currency}" if value > 0 else "—"  # no amount set

    # Paid section rows
    paid_html = ""
    for row in paid_rows:
        expected = fmt_amount(row["amount"], row["currency"])
        paid_actual = (
            fmt_amount(row["paid_amount"], row["currency"])
            if row.get("paid_amount")
            else expected
        )
        mismatch = (
            row.get("paid_amount")
            and Decimal(str(row["amount"])) > 0
            and Decimal(str(row["paid_amount"])) != Decimal(str(row["amount"]))
        )
        paid_cell = paid_actual
        if mismatch:
            paid_cell = f'{paid_actual} <span style="color:#b45309">({h["expected"]}: {expected})</span>'
        paid_on = row.get("paid_at", "")
        if paid_on and hasattr(paid_on, "strftime"):
            paid_on = paid_on.strftime("%Y-%m-%d")
        elif paid_on and "T" in str(paid_on):
            paid_on = str(paid_on)[:10]
        paid_html += (
            f"<tr>"
            f'<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">{html.escape(row["name"])}</td>'
            f'<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">{html.escape(str(row["due_date"]))}</td>'
            f'<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">{paid_cell}</td>'
            f'<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">{html.escape(str(paid_on))}</td>'
            f"</tr>"
        )

    if not paid_html:
        paid_html = f'<tr><td colspan="4" style="padding:10px 12px;color:#64748b;font-style:italic">{h["nothing_paid"]}</td></tr>'

    # Unpaid section rows
    unpaid_html = ""
    for row in unpaid_rows:
        unpaid_html += (
            f"<tr>"
            f'<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">{html.escape(row["name"])}</td>'
            f'<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">{html.escape(str(row["due_date"]))}</td>'
            f'<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">{fmt_amount(row["amount"], row["currency"])}</td>'
            f"</tr>"
        )

    if not unpaid_html:
        unpaid_html = f'<tr><td colspan="3" style="padding:10px 12px;color:#16a34a;font-style:italic">{h["nothing_unpaid"]}</td></tr>'

    # Totals
    total_paid = sum(
        Decimal(str(r.get("paid_amount") or r["amount"])) for r in paid_rows
    )
    total_outstanding = sum(Decimal(str(r["amount"])) for r in unpaid_rows)
    currencies = {r["currency"] for r in paid_rows + unpaid_rows}
    currency_label = next(iter(currencies), "")

    totals_html = (
        (
            f'<tr style="font-weight:bold;background:#f8fafc">'
            f'<td colspan="3" style="padding:8px 12px">{h["total_paid"]}</td>'
            f'<td style="padding:8px 12px">{total_paid:.2f} {currency_label}</td>'
            f"</tr>"
            f'<tr style="font-weight:bold;background:#f8fafc">'
            f'<td colspan="3" style="padding:8px 12px">{h["total_outstanding"]}</td>'
            f'<td style="padding:8px 12px">{total_outstanding:.2f} {currency_label}</td>'
            f"</tr>"
        )
        if paid_rows or unpaid_rows
        else ""
    )

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;max-width:680px;margin:0 auto;padding:20px">
  <h2 style="color:#0f172a">{h["intro"].format(month_label=html.escape(month_label))}</h2>

  <h3 style="color:#15803d;margin-top:24px">✓ {h["paid_header"]}</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="background:#f1f5f9;text-align:left">
        <th style="padding:8px 12px">{h["bill"]}</th>
        <th style="padding:8px 12px">{h["due_date"]}</th>
        <th style="padding:8px 12px">{h["paid"]}</th>
        <th style="padding:8px 12px">{h["paid_on"]}</th>
      </tr>
    </thead>
    <tbody>{paid_html}</tbody>
  </table>

  <h3 style="color:#dc2626;margin-top:32px">⚠ {h["unpaid_header"]}</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="background:#f1f5f9;text-align:left">
        <th style="padding:8px 12px">{h["bill"]}</th>
        <th style="padding:8px 12px">{h["due_date"]}</th>
        <th style="padding:8px 12px">{h["amount"]}</th>
      </tr>
    </thead>
    <tbody>{unpaid_html}</tbody>
  </table>

  {f'<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px"><tbody>{totals_html}</tbody></table>' if totals_html else ''}

  <p style="margin-top:32px;color:#64748b;font-size:13px">{h["footer"]}</p>
</body>
</html>"""


def reminder_text(
    *,
    bill_name: str,
    due_date: date,
    amount: Decimal,
    currency: str,
    kind: str,
    language: str,
) -> tuple[str, str]:
    ctx = {
        "bill_name": bill_name,
        "due_date": due_date.isoformat(),
        "amount": amount,
        "currency": currency,
    }
    subject = t(language, f"Notifications.reminder.{kind}.subject").format(**ctx)
    body = t(language, f"Notifications.reminder.{kind}.body").format(**ctx)
    if amount <= 0:  # bills without an amount: drop "(0.00 PLN)" and the Amount line
        subject = subject.removesuffix(f" ({amount} {currency})")
        body = body.rsplit("\n", 1)[0]
    return subject, body


def send_reminder_telegram(*, url: str, **text_kwargs: Any) -> None:
    # The subject already names the bill, timing and amount; the body only adds
    # the exact due date instead of repeating the same sentence (email keeps both).
    subject, _ = reminder_text(**text_kwargs)
    label = t(text_kwargs["language"], "Notifications.dueDateLabel")
    notify.send(url, subject, f"{label}: {text_kwargs['due_date'].isoformat()}")


def send_summary_telegram(
    *,
    url: str,
    month_label: str,
    paid_rows: list[dict[str, Any]],
    unpaid_rows: list[dict[str, Any]],
    language: str,
) -> None:
    # bills without an amount (0.00) show only the name and due date
    lines = [
        f"❌ {r['name']}"
        + (f" — {r['amount']} {r['currency']}" if r["amount"] > 0 else "")
        + f" ({r['due_date']})"
        for r in unpaid_rows
    ]
    # paid rows show what was actually paid; 0.00 (no amount set) is omitted
    for r in paid_rows:
        paid = r.get("paid_amount") or r["amount"]
        lines.append(
            f"✅ {r['name']}" + (f" — {paid} {r['currency']}" if paid > 0 else "")
        )
    notify.send(
        url,
        t(language, "Notifications.summary.subject").format(month_label=month_label),
        # Apprise strips leading whitespace, so a zero-width space on its own line
        # is what keeps the blank line under the title.
        "\u200b\n" + ("\n".join(lines) or "—"),
    )


def send_password_reset_email(
    *,
    smtp_host: str,
    smtp_port: int,
    smtp_user: str | None,
    smtp_password: str | None,
    smtp_use_tls: bool = True,
    from_addr: str = "",
    to_addr: str,
    reset_url: str,
    language: str,
    expires_minutes: int = 60,
) -> None:
    if expires_minutes > 0:
        expires_label = t(language, "Notifications.reset.expires").format(
            minutes=expires_minutes
        )
    else:
        expires_label = t(language, "Notifications.reset.noExpiry")

    subject = t(language, "Notifications.reset.subject")
    body = t(language, "Notifications.reset.body").format(
        reset_url=reset_url, expires_label=expires_label
    )
    _deliver(
        smtp_host,
        smtp_port,
        smtp_user,
        smtp_password,
        smtp_use_tls,
        from_addr,
        to_addr,
        subject,
        body,
    )


def send_monthly_summary_email(
    *,
    smtp_host: str,
    smtp_port: int,
    smtp_user: str | None,
    smtp_password: str | None,
    smtp_use_tls: bool = True,
    from_addr: str = "",
    to_addr: str,
    month_label: str,
    paid_rows: list[dict[str, Any]],
    unpaid_rows: list[dict[str, Any]],
    language: str,
) -> None:
    subject = t(language, "Notifications.summary.subject").format(
        month_label=month_label
    )
    body = _build_summary_html(
        month_label, paid_rows, unpaid_rows, resolve_locale(language)
    )

    _deliver(
        smtp_host,
        smtp_port,
        smtp_user,
        smtp_password,
        smtp_use_tls,
        from_addr,
        to_addr,
        subject,
        body,
        html=True,
    )
