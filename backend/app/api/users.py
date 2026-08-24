from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.services.user_service import get_users, get_user, create_user, update_user, delete_user
from app.services.auth_service import get_current_user, require_role
from app.services.audit_service import log_audit, client_ip
from app.models.user import User

router = APIRouter(prefix="/users", tags=["Usuarios"])


@router.get("/", response_model=list[UserResponse])
def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    return get_users(db, skip, limit)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserResponse)
def update_me(
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.user_service import update_own_profile
    return update_own_profile(db, current_user, data)


@router.get("/{user_id}", response_model=UserResponse)
def get_user_endpoint(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.services.user_service import get_user
    return get_user(db, user_id)


@router.post("/", response_model=UserResponse)
def create_user_endpoint(
    data: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.services.user_service import create_user
    user = create_user(db, data)
    log_audit(db, current_user, "user_create", entity_type="user", entity_id=user.id,
              detail=f"creó usuario {data.username}", ip_address=client_ip(request))
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user_endpoint(
    user_id: int,
    data: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.services.user_service import update_user
    user = update_user(db, user_id, data)
    log_audit(db, current_user, "user_update", entity_type="user", entity_id=user.id,
              detail=f"actualizó usuario {user.username}", ip_address=client_ip(request))
    return user


@router.delete("/{user_id}")
def delete_user_endpoint(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.services.user_service import delete_user
    target = get_user(db, user_id)
    delete_user(db, user_id)
    from app.models.user_session import UserSession
    db.query(UserSession).filter(UserSession.user_id == user_id).delete(synchronize_session=False)
    db.commit()
    log_audit(db, current_user, "user_delete", entity_type="user", entity_id=user_id,
              detail=f"eliminó usuario {target.username}", ip_address=client_ip(request))
    return {"message": "Usuario eliminado correctamente"}


@router.post("/reset")
def reset_users_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.services.user_service import reset_default_users
    reset_default_users(db)
    return {"message": "Usuarios reseteados correctamente"}


@router.post("/{user_id}/unlock")
def unlock_user_endpoint(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.services.user_service import unlock_user
    user = unlock_user(db, user_id)
    log_audit(db, current_user, "user_unlock", entity_type="user", entity_id=user.id,
              detail=f"desbloqueó usuario {user.username}", ip_address=client_ip(request))
    return {"message": f"Usuario {user.username} desbloqueado"}


@router.post("/{user_id}/deactivate")
def deactivate_user_endpoint(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.services.user_service import set_user_active
    if current_user.id == user_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta")
    user = set_user_active(db, user_id, False)
    log_audit(db, current_user, "user_deactivate", entity_type="user", entity_id=user.id,
              detail=f"desactivó usuario {user.username} (médico se fue del centro)", ip_address=client_ip(request))
    return {"message": f"Usuario {user.username} desactivado — no podrá iniciar sesión", "user": user}


@router.post("/{user_id}/activate")
def activate_user_endpoint(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.services.user_service import set_user_active
    user = set_user_active(db, user_id, True)
    log_audit(db, current_user, "user_activate", entity_type="user", entity_id=user.id,
              detail=f"reactivó usuario {user.username}", ip_address=client_ip(request))
    return {"message": f"Usuario {user.username} activado", "user": user}
