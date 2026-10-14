from datetime import datetime, timezone

from sqlalchemy import DateTime, create_engine, event
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.types import TypeDecorator

from app.core.config import settings


class UTCDateTime(TypeDecorator[datetime]):
    """Timezone-aware datetimes on SQLite, which drops tzinfo: store UTC, return aware UTC."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime; use a timezone-aware value")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect):
        return None if value is None else value.replace(tzinfo=timezone.utc)


# check_same_thread: FastAPI runs sync endpoints on a thread pool.
engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record):
    # pysqlite's default transaction handling breaks SAVEPOINT: take control of BEGIN.
    dbapi_conn.isolation_level = None
    cur = dbapi_conn.cursor()
    cur.execute(
        "PRAGMA foreign_keys=ON"
    )  # off by default; ondelete=RESTRICT/CASCADE rely on it
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=5000")
    cur.close()


@event.listens_for(engine, "begin")
def _sqlite_begin(conn):
    conn.exec_driver_sql("BEGIN")


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
