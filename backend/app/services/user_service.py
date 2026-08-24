from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from app.models.user import User
from app.core.security import hash_password, verify_password
from app.schemas.user import UserCreate, UserUpdate


def _title_case(text: str) -> str:
    return ' '.join(word.capitalize() for word in text.split())


def get_users(db: Session, skip: int = 0, limit: int = 100) -> list[User]:
    return db.query(User).offset(skip).limit(limit).all()


def get_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


def create_user(db: Session, data: UserCreate) -> User:
    existing = db.query(User).filter(
        (User.username == data.username) | (User.telefono == data.telefono)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Usuario o teléfono ya existe")
    user = User(
        username=data.username,
        telefono=data.telefono,
        full_name=_title_case(data.full_name),
        hashed_password=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Usuario o teléfono ya existe")
    db.refresh(user)
    return user


def update_user(db: Session, user_id: int, data) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    update_data = data.model_dump(exclude_unset=True)
    if "password" in update_data:
        password = update_data.pop("password")
        if password:
            update_data["hashed_password"] = hash_password(password)
    if "full_name" in update_data:
        update_data["full_name"] = _title_case(update_data["full_name"])
    for key, value in update_data.items():
        setattr(user, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="El usuario o teléfono ya está en uso por otro usuario")
    db.refresh(user)
    return user


def update_own_profile(db: Session, user: User, data) -> User:
    update_data = data.model_dump(exclude_unset=True)
    allowed = {"full_name", "telefono", "password", "current_password"}
    update_data = {k: v for k, v in update_data.items() if k in allowed}
    if "password" in update_data:
        password = update_data.pop("password")
        current_password = update_data.pop("current_password", None)
        if password:
            if not current_password or not verify_password(current_password, user.hashed_password):
                raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta")
            update_data["hashed_password"] = hash_password(password)
    if "full_name" in update_data:
        update_data["full_name"] = _title_case(update_data["full_name"])
    for key, value in update_data.items():
        setattr(user, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="El teléfono ya está en uso por otro usuario")
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: int):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    db.delete(user)
    db.commit()


def unlock_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.failed_attempts = 0
    user.locked_until = None
    db.commit()
    db.refresh(user)
    return user


def set_user_active(db: Session, user_id: int, active: bool) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    # No permitir desactivar al único admin activo
    if not active and user.role == "admin":
        admins = db.query(User).filter(User.role == "admin", User.is_active == True).count()
        if admins <= 1 and user.is_active:
            raise HTTPException(status_code=400, detail="No se puede desactivar al único administrador activo")
    user.is_active = active
    if not active:
        # Al desactivar, limpiar bloqueos y cerrar sesiones
        user.failed_attempts = 0
        user.locked_until = None
        from app.models.user_session import UserSession
        db.query(UserSession).filter(UserSession.user_id == user_id).delete(synchronize_session=False)
    db.commit()
    db.refresh(user)
    return user


def reset_default_users(db: Session, only_if_empty: bool = False):
    defaults = [
        User(username="admin", telefono="2201-1100", full_name="Administrador",
             hashed_password=hash_password("admin123"), role="admin", is_active=True),
        User(username="direccion", telefono="2201-1101", full_name="Director General",
             hashed_password=hash_password("direccion123"), role="direccion", is_active=True),
        User(username="direccionmedica", telefono="2201-1102", full_name="Dirección Médica",
             hashed_password=hash_password("direccionmedica123"), role="direccion_medica", is_active=True),
        User(username="medico", telefono="2201-1103", full_name="Dr. Médico",
             hashed_password=hash_password("medico123"), role="medico", is_active=True),
    ]
    if only_if_empty and db.query(User).count() > 0:
        return
    for u in defaults:
        existing = db.query(User).filter(User.username == u.username).first()
        if not existing:
            db.add(u)
    db.commit()
