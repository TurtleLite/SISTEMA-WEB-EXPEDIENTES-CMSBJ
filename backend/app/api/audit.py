from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.audit_service import list_logs, serialize_log
from app.services.device_service import get_device_status_map
from app.services.auth_service import require_role
from app.models.user import User

router = APIRouter(prefix="/audit", tags=["Auditoría"])


@router.get("/")
def list_audit_logs(
    skip: int = 0,
    limit: int = 100,
    action: str = None,
    entity_type: str = None,
    user_id: int = None,
    username: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    items, total = list_logs(
        db,
        skip=min(max(skip, 0), 100000),
        limit=min(max(limit, 1), 500),
        action=action,
        entity_type=entity_type,
        user_id=user_id,
        username=username,
    )
    status_map = get_device_status_map(db)
    serialized = []
    for item in items:
        entry = serialize_log(item)
        info = status_map.get(entry.get("ip_address") or "")
        entry["device_status"] = info["status"] if info else None
        entry["device_shared"] = bool(info and info["shared"])
        serialized.append(entry)
    return {
        "items": serialized,
        "total": total,
        "skip": skip,
        "limit": limit,
    }