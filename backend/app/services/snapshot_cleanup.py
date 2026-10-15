import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models.restore_snapshot import RestoreSnapshot

logger = logging.getLogger(__name__)


def cleanup_old_snapshots(SessionLocal: sessionmaker) -> None:
    cutoff = datetime.now(UTC) - timedelta(
        days=settings.restore_snapshot_retention_days
    )
    db: Session = SessionLocal()
    try:
        deleted = (
            db.query(RestoreSnapshot)
            .filter(RestoreSnapshot.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        db.commit()
        logger.info("Snapshot cleanup: removed %d stale restore snapshot(s)", deleted)
    finally:
        db.close()
