from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models.list_definition import ListDefinition, ListRecord
from app.schemas.list_definition import ListDefinitionCreate, ListDefinitionUpdate, ListRecordCreate
from typing import Optional
from app.services.expediente_service import EXPEDIENTE_COLUMNS


def ensure_system_lists(db: Session):
    existing = db.query(ListDefinition).filter(ListDefinition.name == "Expediente Médico").first()
    if existing:
        if not existing.is_system:
            existing.is_system = True
            existing.columns_config = EXPEDIENTE_COLUMNS
            db.commit()
            db.refresh(existing)
        return existing
    from app.models.user import User
    admin = db.query(User).filter(User.role == "admin").first()
    admin_id = admin.id if admin else 1
    ld = ListDefinition(
        name="Expediente Médico",
        description="",
        columns_config=EXPEDIENTE_COLUMNS,
        is_system=True,
        created_by=admin_id,
    )
    db.add(ld)
    db.commit()
    db.refresh(ld)
    return ld


def create_list_definition(db: Session, data: ListDefinitionCreate, user_id: int) -> ListDefinition:
    ld = ListDefinition(
        name=data.name,
        description=data.description,
        columns_config=[c.model_dump() for c in data.columns_config],
        created_by=user_id,
    )
    db.add(ld)
    db.commit()
    db.refresh(ld)
    return ld


def get_list_definitions(db: Session, skip: int = 0, limit: int = 100) -> list[ListDefinition]:
    return db.query(ListDefinition).filter(ListDefinition.deleted_at.is_(None)).offset(skip).limit(limit).all()


def get_list_definition(db: Session, list_id: int) -> ListDefinition:
    ld = db.query(ListDefinition).filter(ListDefinition.id == list_id, ListDefinition.deleted_at.is_(None)).first()
    if not ld:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    return ld


def update_list_definition(db: Session, list_id: int, data, user_role: str) -> ListDefinition:
    ld = db.query(ListDefinition).filter(ListDefinition.id == list_id).first()
    if not ld:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    if ld.is_system and user_role != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Solo el administrador puede modificar la plantilla del sistema")
    update_data = data.model_dump(exclude_unset=True)
    if "columns_config" in update_data:
        update_data["columns_config"] = [c.model_dump() for c in data.columns_config]
    for key, value in update_data.items():
        setattr(ld, key, value)
    db.commit()
    db.refresh(ld)
    return ld


def delete_list_definition(db: Session, list_id: int, user_role: str):
    from datetime import datetime, timezone
    ld = db.query(ListDefinition).filter(ListDefinition.id == list_id).first()
    if not ld:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    if ld.is_system and user_role != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Solo el administrador puede eliminar la plantilla del sistema")
    if ld.deleted_at:
        return
    # Soft delete: la lista y sus expedientes van a la papelera (restaurables).
    now = datetime.now(timezone.utc)
    db.query(ListRecord).filter(ListRecord.list_definition_id == list_id, ListRecord.deleted_at.is_(None)) \
        .update({ListRecord.deleted_at: now}, synchronize_session=False)
    ld.deleted_at = now
    db.commit()


def get_trashed_lists(db: Session) -> list[dict]:
    lists = db.query(ListDefinition).filter(ListDefinition.deleted_at.isnot(None)).all()
    result = []
    for ld in lists:
        count = db.query(ListRecord).filter(
            ListRecord.list_definition_id == ld.id, ListRecord.deleted_at.isnot(None)
        ).count()
        result.append({
            "id": str(ld.id),
            "name": ld.name,
            "description": ld.description,
            "is_system": ld.is_system,
            "deleted_at": str(ld.deleted_at),
            "records_in_trash": count,
        })
    return result


def restore_list_definition(db: Session, list_id: int, user_role: str) -> ListDefinition:
    ld = db.query(ListDefinition).filter(ListDefinition.id == list_id).first()
    if not ld:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    if user_role != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Solo el administrador puede restaurar una lista")
    if ld.deleted_at:
        db.query(ListRecord).filter(ListRecord.list_definition_id == list_id) \
            .update({ListRecord.deleted_at: None}, synchronize_session=False)
        ld.deleted_at = None
        db.commit()
    return ld
