from collections import defaultdict
from decimal import Decimal

from sqlalchemy.orm import Session, selectinload

from app.models.bill import BillTemplate, PaymentInstance, PaymentStatus

TREND_MONTHS = 12


def trend_periods(month: str) -> list[str]:
    """The TREND_MONTHS periods ending at `month` (YYYY-MM), oldest first."""
    year, mon = map(int, month.split("-"))
    end = year * 12 + mon - 1
    return [
        f"{i // 12:04d}-{i % 12 + 1:02d}"
        for i in range(end - TREND_MONTHS + 1, end + 1)
    ]


def payment_trend(db: Session, user_id: int, month: str) -> list[dict]:
    """Per (period, currency) paid vs unpaid totals for the 12 months ending at
    `month`. Currencies are never mixed; periods with no instances are omitted."""
    periods = trend_periods(month)
    instances = (
        db.query(PaymentInstance)
        .options(selectinload(PaymentInstance.template))
        .join(BillTemplate, PaymentInstance.bill_id == BillTemplate.id)
        .filter(
            BillTemplate.user_id == user_id,
            PaymentInstance.period.in_(periods),
            PaymentInstance.hidden.is_(None),
        )
        .all()
    )
    totals: dict[tuple[str, str], list[Decimal]] = defaultdict(
        lambda: [Decimal(0), Decimal(0)]
    )
    for inst in instances:
        bucket = totals[(inst.period, inst.template.currency)]
        if inst.status == PaymentStatus.paid:
            # What was actually paid, falling back to the expected amount.
            bucket[0] += (
                inst.paid_amount if inst.paid_amount is not None else inst.amount
            )
        else:
            bucket[1] += inst.current_amount
    return [
        {"period": p, "currency": c, "paid": paid, "unpaid": unpaid}
        for (p, c), (paid, unpaid) in sorted(totals.items())
    ]
