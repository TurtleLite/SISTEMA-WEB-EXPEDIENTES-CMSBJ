from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.notification import NotificationCreate, NotificationResponse, NotificationUnreadCount
from app.services.notification_service import (
    create_notification,
    list_notifications,
    unread_count,
    mark_as_read,
    mark_all_as_read,
    serialize_notification,
)
from app.services.auth_service import get_current_user, require_role
from app.services.audit_service import log_audit, client_ip
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["Notificaciones"])

MANAGER_ROLES = ("admin", "direccion", "direccion_medica")


def _target_username(db: Session, target_user_id: int) -> str:
    if not target_user_id:
        return None
    target = db.query(User).filter(User.id == target_user_id).first()
    return target.full_name if target else None


@router.get("/", response_model=list[NotificationResponse])
def list_my_notifications(
    skip: int = 0,
    limit: int = 50,
    only_unread: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, _ = list_notifications(db, current_user, skip, limit, only_unread)
    return [serialize_notification(n, _target_username(db, n.target_user_id)) for n in items]


@router.get("/unread-count", response_model=NotificationUnreadCount)
def my_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"count": unread_count(db, current_user)}


@router.post("/", response_model=NotificationResponse)
def send_notification(
    data: NotificationCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGER_ROLES)),
):
    if not data.title.strip():
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="El título es obligatorio")
    if not data.message.strip():
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="El mensaje es obligatorio")

    target = None
    if data.target_user_id:
        from fastapi import HTTPException
        target = db.query(User).filter(User.id == int(data.target_user_id)).first()
        if not target:
            raise HTTPException(status_code=404, detail="El usuario destinatario no existe")

    note = create_notification(db, data, current_user, target)
    who = f"todos los usuarios" if target is None else f"el usuario {target.username}"
    log_audit(db, current_user, "notification_send", entity_type="notification",
              entity_id=note.id, detail=f"envió mensaje a {who}: {data.title}", ip_address=client_ip(request))
    return serialize_notification(note, _target_username(db, note.target_user_id))


@router.post("/{note_id}/read", response_model=NotificationResponse)
def mark_read(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = mark_as_read(db, note_id, current_user)
    if not note:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    return serialize_notification(note, _target_username(db, note.target_user_id))


@router.post("/read-all")
def read_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    marked = mark_all_as_read(db, current_user)
    return {"message": f"{marked} notificaciones marcadas como leídas"}