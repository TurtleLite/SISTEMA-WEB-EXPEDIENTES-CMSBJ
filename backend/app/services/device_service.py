import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.device_registration import DeviceRegistration
from app.services.audit_service import client_device_id, log_audit

DEVICE_STATUSES = ("pending", "approved", "blocked")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _users_of(reg: DeviceRegistration) -> list[str]:
    try:
        users = json.loads(reg.users_json or "[]")
        return [u for u in users if isinstance(u, str)] if isinstance(users, list) else []
    except (ValueError, TypeError):
        return []


def register_device_use(db: Session, request, user) -> DeviceRegistration | None:
    """Registra el uso del equipo en el login. Crea el registro en estado 'pending'
    si es la primera vez que se ve. Devuelve None si no hay X-Device-ID."""
    device_id = client_device_id(request)
    if not device_id:
        return None
    now = _now()
    reg = db.query(DeviceRegistration).filter(DeviceRegistration.device_id == device_id).first()
    if reg is None:
        reg = DeviceRegistration(
            device_id=device_id,
            status="pending",
            first_user_id=user.id,
            first_username=user.username,
            users_json=json.dumps([user.username]),
            first_seen_at=now,
            last_seen_at=now,
        )
        db.add(reg)
        db.commit()
        log_audit(db, user, "device_registered", entity_type="device", entity_id=reg.id,
                  detail=f"equipo {device_id} visto por primera vez", ip_address=device_id)
    else:
        users = _users_of(reg)
        if user.username not in users:
            users.append(user.username)
            reg.users_json = json.dumps(users)
        reg.last_seen_at = now
        db.commit()
    return reg


def get_device_status_map(db: Session) -> dict:
    """device_id -> {"status": ..., "shared": bool} para enriquecer auditoría y sesiones."""
    result = {}
    for reg in db.query(DeviceRegistration).all():
        result[reg.device_id] = {"status": reg.status, "shared": len(_users_of(reg)) > 1}
    return result


def list_devices(db: Session) -> list[dict]:
    from app.models.audit_log import AuditLog
    rows = db.query(AuditLog.ip_address, AuditLog.id, AuditLog.created_at).filter(
        AuditLog.ip_address.like("EQ-%")
    ).all()
    counts: dict[str, int] = {}
    last_event: dict[str, datetime] = {}
    for ip, _id, created_at in rows:
        counts[ip] = counts.get(ip, 0) + 1
        if created_at and (ip not in last_event or created_at > last_event[ip]):
            last_event[ip] = created_at
    devices = []
    for reg in db.query(DeviceRegistration).order_by(DeviceRegistration.first_seen_at.asc()).all():
        users = _users_of(reg)
        devices.append({
            "id": str(reg.id),
            "device_id": reg.device_id,
            "status": reg.status,
            "note": reg.note or "",
            "first_username": reg.first_username,
            "first_seen_at": str(reg.first_seen_at) if reg.first_seen_at else None,
            "last_seen_at": str(reg.last_seen_at) if reg.last_seen_at else None,
            "users": users,
            "shared": len(users) > 1,
            "events": counts.get(reg.device_id, 0),
            "last_event_at": str(last_event[reg.device_id]) if reg.device_id in last_event else None,
            "approved_by": reg.approved_by,
            "approved_at": str(reg.approved_at) if reg.approved_at else None,
            "blocked_by": reg.blocked_by,
            "blocked_at": str(reg.blocked_at) if reg.blocked_at else None,
        })
    return devices


def set_device_note(db: Session, device_id: str, note: str) -> DeviceRegistration:
    reg = db.query(DeviceRegistration).filter(DeviceRegistration.device_id == device_id).first()
    if not reg:
        raise ValueError("Equipo no encontrado")
    reg.note = (note or "").strip()[:255]
    db.commit()
    return reg


def approve_device(db: Session, device_id: str, admin_username: str) -> DeviceRegistration:
    reg = db.query(DeviceRegistration).filter(DeviceRegistration.device_id == device_id).first()
    if not reg:
        raise ValueError("Equipo no encontrado")
    now = _now()
    reg.status = "approved"
    reg.approved_by = admin_username
    reg.approved_at = now
    reg.blocked_by = None
    reg.blocked_at = None
    db.commit()
    return reg


def block_device(db: Session, device_id: str, admin_username: str) -> DeviceRegistration:
    """Bloquea el equipo y revoca todas sus sesiones activas."""
    from app.models.user_session import UserSession
    reg = db.query(DeviceRegistration).filter(DeviceRegistration.device_id == device_id).first()
    if not reg:
        raise ValueError("Equipo no encontrado")
    now = _now()
    reg.status = "blocked"
    reg.blocked_by = admin_username
    reg.blocked_at = now
    db.query(UserSession).filter(
        UserSession.device_id == device_id,
        UserSession.revoked_at.is_(None),
    ).update({"revoked_at": now}, synchronize_session=False)
    db.commit()
    return reg
