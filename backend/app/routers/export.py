import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.core.i18n import BRAND, resolve_locale
from app.core.tz import today_for
from app.models.bill import BillTemplate, PaymentInstance
from app.models.restore_snapshot import RestoreSnapshot
from app.models.user import User
from app.schemas.bill import (
    BackupPayload,
    ExportSummaryOut,
    RestoreResultOut,
    RestoreSnapshotOut,
)
from app.services.backup import (
    ALL_SECTIONS,
    Section,
    _active_snapshot,
    _apply_backup,
    _build_backup_arrays,
)
from app.services.export_pdf import build_pdf
from app.services.export_xlsx import build_xlsx
from app.services.notify import decrypt_secret, encrypt_secret

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/xlsx")
def export_xlsx(
    year: int | None = Query(default=None),  # None: the user's current year
    month: int | None = Query(default=None, ge=1, le=12),
    lang: str = Query(default="en"),
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    if not me.export_enabled:
        raise HTTPException(status_code=403, detail="Excel export is disabled")
    today = today_for(me)
    year = year or today.year
    lang = resolve_locale(lang)
    buf = build_xlsx(db, me, today, year, month, lang)

    suffix = f"{year}-{month:02d}" if month else str(year)
    filename = f"{BRAND['slug']}-{lang}-{suffix}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/pdf")
def export_pdf(
    year: int | None = Query(default=None),  # None: the user's current year
    month: int | None = Query(default=None, ge=1, le=12),
    lang: str = Query(default="en"),
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    if not me.pdf_enabled:
        raise HTTPException(status_code=403, detail="PDF export is disabled")
    today = today_for(me)
    year = year or today.year
    lang = resolve_locale(lang)
    content = build_pdf(db, me, today, year, month, lang)

    suffix = f"{year}-{month:02d}" if month else str(year)
    filename = f"{BRAND['slug']}-{lang}-{suffix}.pdf"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/json")
def export_json(
    sections: list[Section] = Query(default=list(ALL_SECTIONS), min_length=1),
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    payload = {
        "schema_version": 8,
        "exported_by": me.email,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        **_build_backup_arrays(db, me.id, sections),
    }
    # Not in _build_backup_arrays: that also feeds the DB-stored restore snapshot,
    # which must never hold the bot token in plaintext.
    token = (
        decrypt_secret(me.telegram_bot_token)
        if "telegram" in sections and me.telegram_bot_token
        else None
    )
    if token and me.telegram_chat_id:
        payload["telegram"] = {"bot_token": token, "chat_id": me.telegram_chat_id}
    headers = {
        "Content-Disposition": f'attachment; filename="{BRAND["slug"]}-backup-{today_for(me)}.bak"'
    }
    if "telegram" in sections and me.telegram_bot_token_unreadable:
        # Stored but undecryptable (JWT_SECRET changed): the backup can't carry it.
        headers["X-Backup-Warning"] = "telegram-token-unreadable"
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers=headers,
    )


@router.get("/summary", response_model=ExportSummaryOut)
def export_summary(
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    template_ids = [
        t.id
        for t in db.query(BillTemplate.id).filter(BillTemplate.user_id == me.id).all()
    ]
    bill_count = len(template_ids)
    payment_count = (
        db.query(PaymentInstance)
        .filter(
            PaymentInstance.bill_id.in_(template_ids),
            PaymentInstance.is_deleted.is_(False),
        )
        .count()
        if template_ids
        else 0
    )
    return ExportSummaryOut(bill_count=bill_count, payment_count=payment_count)


@router.post("/restore", response_model=RestoreResultOut)
def restore_json(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    _ALLOWED_TYPES = ("application/json", "text/plain", "application/octet-stream")
    if file.content_type and file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported file type")
    _MAX_UPLOAD = 10 * 1024 * 1024  # 10 MB
    content = file.file.read(_MAX_UPLOAD + 1)
    if len(content) > _MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="Backup file too large (max 10 MB)")
    try:
        raw = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="Invalid backup file")

    if not isinstance(raw, dict):
        raise HTTPException(status_code=422, detail="Invalid backup file")
    version = raw.get("schema_version")
    # isinstance first: an unhashable value (list/dict) can't even be looked up in a set
    if not isinstance(version, int) or version not in {2, 3, 4, 5, 6, 7, 8}:
        raise HTTPException(status_code=422, detail="Unsupported schema version")

    try:
        backup = BackupPayload.model_validate(raw)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))

    template_ids_in_backup = {t.id for t in backup.bill_templates or []}
    orphaned = [
        i
        for i in backup.payment_instances or []
        if i.bill_id not in template_ids_in_backup
    ]
    if orphaned:
        raise HTTPException(
            status_code=422, detail="Backup contains orphaned payment instances"
        )

    has_existing_bills = (
        db.query(BillTemplate.id).filter(BillTemplate.user_id == me.id).first()
        is not None
    )
    if has_existing_bills and backup.bill_templates is not None:
        snapshot_payload = {
            "schema_version": 8,
            **_build_backup_arrays(db, me.id),
        }
        db.query(RestoreSnapshot).filter(RestoreSnapshot.user_id == me.id).delete(
            synchronize_session=False
        )
        db.add(RestoreSnapshot(user_id=me.id, payload=snapshot_payload))

    restored_templates, restored_instances = _apply_backup(db, me.id, backup)
    if backup.telegram:  # absent in older backups: keep the user's current setup
        me.telegram_bot_token = encrypt_secret(backup.telegram.bot_token)
        me.telegram_chat_id = backup.telegram.chat_id
    # Single commit for snapshot write + destructive delete + re-insert: if any
    # of it raises, nothing above commits — do not split this into multiple
    # commits, it would break the "abort restore on snapshot failure" guarantee.
    db.commit()

    return RestoreResultOut(
        restored_templates=restored_templates, restored_instances=restored_instances
    )


@router.get("/last-snapshot", response_model=RestoreSnapshotOut)
def last_snapshot(
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    snapshot = _active_snapshot(db, me.id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="No recoverable snapshot")
    return RestoreSnapshotOut(created_at=snapshot.created_at)


@router.post("/restore-snapshot", response_model=RestoreResultOut)
def restore_from_snapshot(
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    snapshot = _active_snapshot(db, me.id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="No snapshot to restore")

    backup = BackupPayload.model_validate(snapshot.payload)
    restored_templates, restored_instances = _apply_backup(db, me.id, backup)
    db.delete(snapshot)
    db.commit()

    return RestoreResultOut(
        restored_templates=restored_templates, restored_instances=restored_instances
    )
