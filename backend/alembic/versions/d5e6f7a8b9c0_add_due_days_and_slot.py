"""add due_days to bill_templates and slot to payment_instances

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-10-09 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("bill_templates", sa.Column("due_days", sa.JSON(), nullable=True))
    op.add_column(
        "payment_instances",
        sa.Column("slot", sa.Integer(), nullable=False, server_default="0"),
    )
    op.drop_constraint(
        "uq_payment_instance_bill_period", "payment_instances", type_="unique"
    )
    op.create_unique_constraint(
        "uq_payment_instance_bill_period_slot",
        "payment_instances",
        ["bill_id", "period", "slot"],
    )


def downgrade() -> None:
    """Downgrade schema. Extra slots would violate the old key, so drop them first."""
    op.execute("DELETE FROM payment_instances WHERE slot > 0")
    op.drop_constraint(
        "uq_payment_instance_bill_period_slot", "payment_instances", type_="unique"
    )
    op.create_unique_constraint(
        "uq_payment_instance_bill_period", "payment_instances", ["bill_id", "period"]
    )
    op.drop_column("payment_instances", "slot")
    op.drop_column("bill_templates", "due_days")
