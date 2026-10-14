"""bill drafts

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-14

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default "1": every existing bill was already live.
    with op.batch_alter_table("bill_templates") as batch:
        batch.add_column(
            sa.Column("is_activated", sa.Boolean(), server_default="1", nullable=False)
        )
        batch.add_column(sa.Column("draft_dates", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("bill_templates") as batch:
        batch.drop_column("draft_dates")
        batch.drop_column("is_activated")
