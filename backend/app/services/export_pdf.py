from datetime import date
from pathlib import Path

from fpdf import FPDF
from sqlalchemy.orm import Session

from app.core.i18n import t
from app.models.user import User
from app.services.export_xlsx import (
    _COLUMN_KEYS,
    _COLUMNS,
    _STATUS_STYLES,
    _rows_by_month,
)
from app.services.notify import footer_text

_PDF_FONTS = Path(__file__).resolve().parent.parent / "assets" / "fonts"
_PDF_HEADER_FILL = (243, 244, 246)


def _rgb(hex_color: str) -> tuple[int, int, int]:
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


class _ReportPDF(FPDF):
    footer_date: date  # the report's "today" (the user's), set by the caller

    def footer(self) -> None:
        self.set_y(-10)
        self.set_font("DejaVu", "", 7)
        self.set_text_color(120, 120, 120)
        self.cell(0, 5, f"{footer_text()} · {self.footer_date.isoformat()}", align="L")
        self.set_x(self.l_margin)
        self.cell(0, 5, f"{self.page_no()} / {{nb}}", align="R")
        self.set_text_color(0, 0, 0)


def build_pdf(
    db: Session, me: User, today: date, year: int, month: int | None, lang: str
) -> bytes:
    selected_keys = set(me.pdf_fields)
    keys = [k for k in _COLUMN_KEYS if k in selected_keys]
    columns = [
        c for k, c in zip(_COLUMN_KEYS, _COLUMNS, strict=True) if k in selected_keys
    ]
    headers = [t(lang, f"SettingsPage.excelExport.fields.{k}") for k in keys]
    by_month = _rows_by_month(db, me, lang, year)

    pdf = _ReportPDF(orientation="L", format="A4")
    pdf.footer_date = today
    pdf.alias_nb_pages()
    pdf.add_font("DejaVu", "", str(_PDF_FONTS / "DejaVuSans.ttf"))
    pdf.add_font("DejaVu", "B", str(_PDF_FONTS / "DejaVuSans-Bold.ttf"))
    # DejaVu has no CJK glyphs; NotoSC (GB2312 subset) covers zh text.
    pdf.add_font("NotoSC", "", str(_PDF_FONTS / "NotoSansSC-Regular.ttf"))
    pdf.add_font("NotoSC", "B", str(_PDF_FONTS / "NotoSansSC-Bold.ttf"))
    pdf.set_fallback_fonts(["NotoSC"])
    pdf.set_auto_page_break(auto=True, margin=12)
    right_aligned = {"amount", "paid_amount"}
    pad = 4  # total horizontal cell padding, mm
    page_w = 277  # A4 landscape minus 2 * 10mm margins

    def column_widths(rows: list[dict]) -> list[float]:
        """Fit each column to its widest content (header or cell) plus padding;
        if the table is wider than the page, shrink only the widest columns."""
        natural = []
        for h, col in zip(headers, columns, strict=True):
            pdf.set_font("DejaVu", "B", 8)
            w = pdf.get_string_width(h)
            pdf.set_font("DejaVu", "", 8)
            for row in rows:
                w = max(w, pdf.get_string_width(str(row[col] or "")))
            natural.append(w + pad)
        excess = sum(natural) - page_w
        if excess <= 0:  # spread the spare width evenly
            return [w - excess / len(natural) for w in natural]
        if excess > 0:
            # ponytail: shave proportionally from columns wider than the average
            avg = page_w / len(natural)
            wide = [i for i, w in enumerate(natural) if w > avg]
            over = sum(natural[i] - avg for i in wide)
            for i in wide:
                natural[i] -= excess * (natural[i] - avg) / over
        return natural

    all_rows = [r for rs in by_month.values() for r in rs]
    widths = column_widths(all_rows)

    for m in [month] if month else range(1, 13):
        rows = by_month[m]
        if not month and not rows:
            continue
        pdf.add_page()
        pdf.set_font("DejaVu", "B", 14)
        pdf.cell(
            0,
            10,
            f"{t(lang, f'Notifications.monthLong.{m}')[:1].upper()}"
            f"{t(lang, f'Notifications.monthLong.{m}')[1:]} {year}",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.set_font("DejaVu", "B", 8)
        pdf.set_fill_color(*_PDF_HEADER_FILL)
        for h, w in zip(headers, widths, strict=True):
            pdf.cell(w, 7, h, border=1, fill=True)
        pdf.ln()
        pdf.set_font("DejaVu", "", 8)
        for row in rows:
            for key, col, w in zip(keys, columns, widths, strict=True):
                text = str(row[col] if row[col] is not None else "")
                pdf.set_fill_color(255, 255, 255)
                pdf.set_text_color(0, 0, 0)
                if key == "status":
                    if style := _STATUS_STYLES.get(row["_status_key"]):
                        pdf.set_fill_color(*_rgb(style[0]))
                        pdf.set_text_color(*_rgb(style[1]))
                # ponytail: only clips if a column had to shrink to fit the page
                pdf.cell(
                    w,
                    6,
                    text,
                    border=1,
                    fill=key == "status",
                    align="R" if key in right_aligned else "L",
                )
            pdf.set_text_color(0, 0, 0)
            pdf.ln()
    if pdf.page == 0:
        pdf.add_page()
    return bytes(pdf.output())
