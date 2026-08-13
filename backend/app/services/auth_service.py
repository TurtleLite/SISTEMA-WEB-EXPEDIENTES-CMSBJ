from datetime import datetime, timedelta, timezone
from collections import deque

from sqlalchemy.orm import Session
from app.models.user import User
from app.models.user_session import UserSession
from app.core.security import hash_password, verify_password, create_access_token, decode_access_token
from app.services.audit_service import log_audit, client_ip, client_real_ip, client_device_id
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.database import get_db

security = HTTPBearer()

MAX_FAILED_ATTEMPTS = 5
LOCK_MINUTES = 15
IP_WINDOW_MINUTES = 15
MAX_ATTEMPTS_PER_IP = 20

_ip_attempts: dict[str, deque] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt) -> datetime:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _cleanup_ip(ip: str, now: datetime):
    dq = _ip_attempts.get(ip)
    if not dq:
        return None
    cutoff = now - timedelta(minutes=IP_WINDOW_MINUTES)
    while dq and dq[0] < cutoff:
        dq.popleft()
    if not dq:
        _ip_attempts.pop(ip, None)
        return None
    return dq


def _ip_limited(ip: str) -> bool:
    if not ip:
        return False
    dq = _cleanup_ip(ip, _now())
    return bool(dq and len(dq) >= MAX_ATTEMPTS_PER_IP)


def _register_ip_failure(ip: str):
    if not ip:
        return
    now = _now()
    dq = _ip_attempts.setdefault(ip, deque())
    dq.append(now)
    cutoff = now - timedelta(minutes=IP_WINDOW_MINUTES)
    while dq and dq[0] < cutoff:
        dq.popleft()


def _clear_ip_failures(ip: str):
    if ip:
        _ip_attempts.pop(ip, None)


def authenticate_user(db: Session, username: str, password: str, ip_address: str = None) -> User:
    user = db.query(User).filter(User.username == username).first()
    if not user:
        log_audit(db, None, "login_failed", entity_type="auth", username=username,
                  detail="usuario inexistente", ip_address=ip_address)
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    if _as_utc(user.locked_until) and _as_utc(user.locked_until) > _now():
        log_audit(db, user, "login_locked", entity_type="auth", ip_address=ip_address)
        raise HTTPException(status_code=423, detail="Cuenta temporalmente bloqueada por intentos fallidos. Intente más tarde.")
    if not verify_password(password, user.hashed_password):
        user.failed_attempts = (user.failed_attempts or 0) + 1
        if user.failed_attempts >= MAX_FAILED_ATTEMPTS:
            user.locked_until = _now() + timedelta(minutes=LOCK_MINUTES)
        db.commit()
        log_audit(db, user, "login_failed", entity_type="auth",
                  detail=f"fallo {user.failed_attempts}/{MAX_FAILED_ATTEMPTS}", ip_address=ip_address)
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    if not user.is_active:
        log_audit(db, user, "login_failed", entity_type="auth", detail="usuario inactivo", ip_address=ip_address)
        raise HTTPException(status_code=401, detail="Usuario inactivo")
    user.failed_attempts = 0
    user.locked_until = None
    db.commit()
    return user


def _purge_old_sessions(db: Session, user: User):
    now = _now()
    cutoff_long_ago = now - timedelta(days=30)
    db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.created_at < cutoff_long_ago,
    ).delete(synchronize_session=False)
    db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.revoked_at.isnot(None),
        UserSession.revoked_at < cutoff_long_ago,
    ).delete(synchronize_session=False)
    db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.expires_at.isnot(None),
        UserSession.expires_at < now,
    ).delete(synchronize_session=False)


def _create_session(db: Session, user: User, jti: str, expires_at: datetime, ip_address: str = None, request=None, device_id: str = None):
    _purge_old_sessions(db, user)
    session = UserSession(
        user_id=user.id,
        jti=jti,
        ip_address=ip_address,
        device_id=(device_id or "")[:50] or None,
        user_agent=((request.headers.get("user-agent", "") if request else "") or "")[:255],
        expires_at=expires_at,
        last_seen_at=_now(),
    )
    db.add(session)
    db.commit()
    return session


def login(db: Session, username: str, password: str, request=None) -> dict:
    # Las sesiones guardan la IP real; la auditoría usa el identificador del equipo.
    ip = client_real_ip(request)
    if _ip_limited(ip):
        raise HTTPException(status_code=429, detail="Demasiados intentos desde esta conexión. Espere unos minutos e intente de nuevo.")
    try:
        user = authenticate_user(db, username, password, ip)
    except HTTPException:
        _register_ip_failure(ip)
        raise
    _clear_ip_failures(ip)
    from app.services.device_service import register_device_use
    reg = register_device_use(db, request, user)
    if reg and reg.status == "blocked":
        log_audit(db, user, "login_blocked", entity_type="auth",
                  detail=f"equipo bloqueado {reg.device_id}", ip_address=ip)
        raise HTTPException(status_code=403, detail="Este equipo está bloqueado. Contacte al administrador del sistema.")
    device_id = client_device_id(request)
    token, jti, expires_at = create_access_token({"sub": str(user.id), "role": user.role})
    _create_session(db, user, jti, expires_at, ip, request, device_id=device_id)
    log_audit(db, user, "login", entity_type="auth", ip_address=ip)
    from app.schemas.user import UserResponse
    device_info = None
    if reg:
        from app.services.device_service import _users_of
        device_info = {
            "id": reg.device_id,
            "status": reg.status,
            "shared": len(_users_of(reg)) > 1,
        }
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(user),
        "device": device_info,
    }


def logout_current(db: Session, credentials: HTTPAuthorizationCredentials = None, user: User = None, ip: str = None):
    jti = None
    try:
        if credentials and credentials.credentials:
            payload = decode_access_token(credentials.credentials)
            jti = payload.get("jti")
    except Exception:
        jti = None
    if user:
        log_audit(db, user, "logout", entity_type="auth", ip_address=ip)
    if jti:
        session = db.query(UserSession).filter(UserSession.jti == jti).first()
        if session and not session.revoked_at:
            session.revoked_at = _now()
            db.commit()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub"))
        jti = payload.get("jti")
        if not jti:
            raise HTTPException(status_code=401, detail="Token inválido")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario no encontrado o inactivo")
    session = db.query(UserSession).filter(UserSession.jti == jti).first()
    if not session or session.revoked_at:
        raise HTTPException(status_code=401, detail="Sesión cerrada o revocada. Inicie sesión de nuevo.")
    now = _now()
    if _as_utc(session.expires_at) and _as_utc(session.expires_at) < now:
        raise HTTPException(status_code=401, detail="Sesión expirada. Inicie sesión de nuevo.")
    if not session.last_seen_at or (now - _as_utc(session.last_seen_at)) > timedelta(minutes=5):
        session.last_seen_at = now
        db.commit()
    return user


def require_role(*roles: str):
    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="No tienes permisos para esta acción")
        return current_user
    return role_checker


def get_user_sessions(db: Session, current_user: User, include_others: bool = False, target_user_id: int = None, current_jti: str = None) -> list[dict]:
    query = (
        db.query(UserSession, User.username, User.full_name)
        .join(User, User.id == UserSession.user_id)
    )
    if not include_others:
        query = query.filter(UserSession.user_id == current_user.id)
    elif target_user_id:
        query = query.filter(UserSession.user_id == target_user_id)
    rows = query.order_by(UserSession.last_seen_at.desc().nullslast()).all()
    from app.services.device_service import get_device_status_map
    status_map = get_device_status_map(db)
    now = _now()
    result = []
    for session, username, full_name in rows:
        active = bool(session.revoked_at is None and (_as_utc(session.expires_at) is None or _as_utc(session.expires_at) > now))
        device_status = None
        device_shared = False
        if session.device_id:
            info = status_map.get(session.device_id)
            if info:
                device_status = info["status"]
                device_shared = info["shared"]
        result.append({
            "id": str(session.id),
            "user_id": str(session.user_id),
            "username": username,
            "full_name": full_name,
            "ip_address": session.ip_address,
            "device_id": session.device_id,
            "device_status": device_status,
            "device_shared": device_shared,
            "user_agent": session.user_agent,
            "created_at": str(session.created_at),
            "expires_at": str(session.expires_at) if session.expires_at else None,
            "last_seen_at": str(session.last_seen_at) if session.last_seen_at else None,
            "revoked_at": str(session.revoked_at) if session.revoked_at else None,
            "is_current": bool(current_jti and session.jti == current_jti),
            "active": active,
        })
    return result


def revoke_user_session(db: Session, session_id: int, current_user: User, request=None) -> dict:
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if session.user_id != current_user.id and current_user.role not in ("admin",):
        raise HTTPException(status_code=403, detail="No tienes permisos para cerrar esta sesión")
    if not session.revoked_at:
        session.revoked_at = _now()
        db.commit()
    log_audit(db, current_user, "session_revoked", entity_type="session", entity_id=session.id,
              detail=f"sesión de usuario_id={session.user_id}", ip_address=client_ip(request))
    return {"message": "Sesión cerrada correctamente"}