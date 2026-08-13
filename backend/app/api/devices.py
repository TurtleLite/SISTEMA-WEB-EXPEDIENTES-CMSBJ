from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.services.auth_service import require_role
from app.services.audit_service import client_ip
from app.services import device_service

router = APIRouter(prefix="/devices", tags=["Equipos"])


@router.get("/")
def list_devices(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    devices = device_service.list_devices(db)
    counts = {"pending": 0, "approved": 0, "blocked": 0}
    for d in devices:
        counts[d["status"]] = counts.get(d["status"], 0) + 1
    return {"items": devices, "counts": counts}


@router.post("/{device_id}/approve")
def approve_device(
    device_id: str,
    request: Request,
    data: dict = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    if data is None:
        data = {}
    try:
        reg = device_service.approve_device(db, device_id, current_user.username)
        if (data.get("note") or "").strip():
            reg = device_service.set_device_note(db, device_id, data["note"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    from app.services.audit_service import log_audit
    log_audit(db, current_user, "device_approved", entity_type="device", entity_id=reg.id,
              detail=f"equipo {device_id} aprobado", ip_address=client_ip(request))
    return {"message": f"Equipo {device_id} aprobado"}


@router.post("/{device_id}/block")
def block_device(
    device_id: str,
    request: Request,
    data: dict = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    if data is None:
        data = {}
    try:
        reg = device_service.block_device(db, device_id, current_user.username)
        if (data.get("note") or "").strip():
            reg = device_service.set_device_note(db, device_id, data["note"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    from app.services.audit_service import log_audit
    log_audit(db, current_user, "device_blocked", entity_type="device", entity_id=reg.id,
              detail=f"equipo {device_id} bloqueado (sesiones cerradas)", ip_address=client_ip(request))
    return {"message": f"Equipo {device_id} bloqueado y sus sesiones cerradas"}


@router.post("/{device_id}/note")
def set_device_note(
    device_id: str,
    data: dict = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    if data is None:
        data = {}
    try:
        reg = device_service.set_device_note(db, device_id, data.get("note") or "")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    from app.services.audit_service import log_audit
    log_audit(db, current_user, "device_note", entity_type="device", entity_id=reg.id,
              detail=f"nota del equipo {device_id}: {reg.note}", ip_address=client_ip(request))
    return {"message": "Nota guardada"}