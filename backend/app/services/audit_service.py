from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog
import ipaddress


def _is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (
        addr.is_private or addr.is_loopback or addr.is_link_local
        or addr.is_multicast or addr.is_unspecified or addr.is_reserved
    )


def client_real_ip(request) -> str:
    if request is None:
        return ""
    peer = request.client.host if request.client else None
    if peer and _is_public_ip(peer):
        return peer[:45]
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    if peer:
        return peer[:45]
    return ""


def client_device_id(request) -> str:
    """Identificador permanente del equipo (generado por el navegador y enviado en X-Device-ID)."""
    if request is None:
        return ""
    return (request.headers.get("x-device-id") or "").strip()[:40]


def client_ip(request) -> str:
    """Identidad usada en la auditoría: identifica el equipo por su ID permanente
    cuando está disponible; si no, usa la dirección IP real."""
    device = client_device_id(request)
    if device:
        return device
    return client_real_ip(request)


def log_audit(
    db: Session,
    user=None,
    action: str = "",
    entity_type: str = None,
    entity_id=None,
    detail: str = None,
    ip_address: str = None,
    username: str = None,
):
    entry = AuditLog(
        user_id=getattr(user, "id", None) if user else None,
        username=(username or (getattr(user, "username", None) if user else None)),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        detail=(detail or "")[:5000],
        ip_address=ip_address,
    )
    db.add(entry)
    db.commit()


def list_logs(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    action: str = None,
    entity_type: str = None,
    user_id: int = None,
    username: str = None,
    ascending: bool = False,
) -> tuple[list[AuditLog], int]:
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if username:
        query = query.filter(AuditLog.username.ilike(f"%{username}%"))
    total = query.count()
    order = AuditLog.id.asc() if ascending else AuditLog.id.desc()
    items = query.order_by(order).offset(skip).limit(limit).all()
    return items, total


def serialize_log(entry: AuditLog) -> dict:
    return {
        "id": str(entry.id),
        "user_id": str(entry.user_id) if entry.user_id else None,
        "username": entry.username,
        "action": entry.action,
        "entity_type": entry.entity_type,
        "entity_id": str(entry.entity_id) if entry.entity_id else None,
        "detail": entry.detail,
        "ip_address": entry.ip_address,
        "created_at": str(entry.created_at),
    }