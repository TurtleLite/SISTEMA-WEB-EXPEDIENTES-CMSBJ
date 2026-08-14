from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.user import LoginRequest, TokenResponse, RefreshRequest
from app.services.auth_service import (
    login, logout_current, get_current_user, require_role,
    get_user_sessions, revoke_user_session, refresh_session, security,
)
from app.services.audit_service import client_ip
from app.models.user import User
from fastapi.security import HTTPAuthorizationCredentials

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login", response_model=TokenResponse)
def login_endpoint(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    return login(db, data.username, data.password, request)


@router.post("/refresh", response_model=TokenResponse)
def refresh_endpoint(data: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    return refresh_session(db, data.refresh_token, request)


@router.post("/logout")
def logout_endpoint(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user = get_current_user(credentials, db)
    logout_current(db, credentials, user, ip=client_ip(request))
    return {"message": "Sesión cerrada correctamente"}


@router.get("/sessions")
def list_sessions(
    request: Request,
    all_users: bool = False,
    user_id: int = None,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    include_others = all_users or user_id is not None
    if include_others and current_user.role not in ("admin",):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="No tienes permisos para ver otras sesiones")
    current_jti = None
    try:
        from app.core.security import decode_access_token
        current_jti = decode_access_token(credentials.credentials).get("jti")
    except Exception:
        pass
    return get_user_sessions(db, current_user, include_others=include_others, target_user_id=user_id, current_jti=current_jti)


@router.delete("/sessions/{session_id}")
def revoke_session_endpoint(
    session_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return revoke_user_session(db, session_id, current_user, request)