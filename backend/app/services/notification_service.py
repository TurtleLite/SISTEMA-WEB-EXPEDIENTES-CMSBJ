from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationCreate


def create_notification(
    db: Session,
    data: NotificationCreate,
    sender: User,
    target: User = None,
) -> Notification:
    """Crea una notificación. target=None significa que es para todos los usuarios."""
    note = Notification(
        title=data.title.strip()[:200],
        message=data.message.strip(),
        sender_user_id=sender.id,
        sender_username=sender.username,
        target_user_id=target.id if target else None,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def list_notifications(
    db: Session,
    user: User,
    skip: int = 0,
    limit: int = 50,
    only_unread: bool = False,
) -> tuple[list[Notification], int]:
    """Mensajes dirigidos al usuario (target_user_id = su id) o para todos (NULL)."""
    query = db.query(Notification).filter(
        or_(Notification.target_user_id == user.id, Notification.target_user_id.is_(None))
    )
    if only_unread:
        query = query.filter(Notification.is_read.is_(False))
    total = query.count()
    items = query.order_by(Notification.created_at.desc(), Notification.id.desc()).offset(skip).limit(limit).all()
    return items, total


def unread_count(db: Session, user: User) -> int:
    return (
        db.query(Notification)
        .filter(
            or_(Notification.target_user_id == user.id, Notification.target_user_id.is_(None)),
            Notification.is_read.is_(False),
        )
        .count()
    )


def mark_as_read(db: Session, note_id: int, user: User) -> Notification:
    from datetime import datetime, timezone
    note = (
        db.query(Notification)
        .filter(
            Notification.id == note_id,
            or_(Notification.target_user_id == user.id, Notification.target_user_id.is_(None)),
        )
        .first()
    )
    if not note:
        return None
    if not note.is_read:
        note.is_read = True
        note.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(note)
    return note


def mark_all_as_read(db: Session, user: User) -> int:
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    result = (
        db.query(Notification)
        .filter(
            or_(Notification.target_user_id == user.id, Notification.target_user_id.is_(None)),
            Notification.is_read.is_(False),
        )
        .update({"is_read": True, "read_at": now}, synchronize_session=False)
    )
    db.commit()
    return result


def serialize_notification(note: Notification, target_username: str = None) -> dict:
    return {
        "id": str(note.id),
        "title": note.title,
        "message": note.message,
        "sender_user_id": str(note.sender_user_id) if note.sender_user_id else None,
        "sender_username": note.sender_username,
        "target_user_id": str(note.target_user_id) if note.target_user_id else None,
        "target_username": target_username,
        "is_read": note.is_read,
        "read_at": str(note.read_at) if note.read_at else None,
        "created_at": str(note.created_at),
    }