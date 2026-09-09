import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.catalog_item import CatalogItem
from app.models.user import User
from app.services.auth_service import require_role
from app.services.audit_service import log_audit, client_ip
from app.services.cache import cached, invalidate_especialidades
from fastapi import Request

router = APIRouter(prefix="/specialties", tags=["Especialidades"])


@router.get("/")
@cached("catalogo:especialidades", ttl=300)
def list_specialties(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    rows = db.execute(text(
        "SELECT data->>'especialidad' AS esp, COUNT(*) AS n "
        "FROM list_records "
        "WHERE deleted_at IS NULL AND data->>'especialidad' IS NOT NULL AND data->>'especialidad' != '' "
        "GROUP BY esp"
    )).all()
    counts = {r[0]: r[1] for r in rows}
    catalog_names = {i.name for i in db.query(CatalogItem).filter(CatalogItem.item_type == "especialidad")}
    merged = {name: counts.get(name, 0) for name in counts}
    for name in catalog_names:
        merged.setdefault(name, 0)
    return [{"name": name, "count": merged[name]} for name in sorted(merged)]


@router.post("/")
def create_specialty(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="El nombre de la especialidad es obligatorio")
    if len(name) > 150:
        raise HTTPException(status_code=400, detail="El nombre no puede superar 150 caracteres")
    existing = db.query(CatalogItem).filter(
        CatalogItem.item_type == "especialidad",
        CatalogItem.name == name,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="La especialidad ya existe en el catálogo")
    item = CatalogItem(item_type="especialidad", name=name)
    db.add(item)
    db.commit()
    invalidate_especialidades()
    log_audit(db, current_user, "specialty_create", entity_type="catalog", entity_id=item.id,
              detail=f"creó especialidad '{name}'", ip_address=client_ip(request))
    return {"message": f"Especialidad '{name}' creada correctamente", "id": item.id}


def _norm(s: str) -> str:
    from app.services.record_service import _strip_accents
    return _strip_accents(str(s or "")).lower()


@router.put("/rename")
def rename_specialty(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.models.list_definition import ListRecord
    old = (data.get("old") or "").strip()
    new = (data.get("new") or "").strip()
    if not old or not new:
        raise HTTPException(status_code=400, detail="La especialidad original y la nueva son obligatorias")
    if old == new:
        return {"message": "Sin cambios", "updated": 0}
    target = _norm(old)
    rows = db.query(ListRecord).filter(ListRecord.data.op("->>")("especialidad").isnot(None)).all()
    matched = [r for r in rows if _norm(r.data.get("especialidad", "")) == target]
    for r in matched:
        d = dict(r.data)
        d["especialidad"] = new
        r.data = d
    catalog = db.query(CatalogItem).filter(
        CatalogItem.item_type == "especialidad",
        CatalogItem.name == old,
    ).first()
    if catalog:
        catalog.name = new
    db.commit()
    invalidate_especialidades()
    log_audit(db, current_user, "specialty_rename", entity_type="catalog", detail=f"renombró especialidad '{old}' → '{new}' ({len(matched)} expediente(s) actualizados)", ip_address=client_ip(request))
    return {"message": f"Especialidad renombrada en {len(matched)} expediente(s)", "updated": len(matched)}


@router.delete("/")
def delete_specialty(
    request: Request,
    name: str,
    replacement: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.models.list_definition import ListRecord
    name = name.strip()
    replacement = replacement.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nombre de especialidad inválido")
    if replacement == name:
        raise HTTPException(status_code=400, detail="El reemplazo no puede ser la misma especialidad")
    target = _norm(name)
    rows = db.query(ListRecord).filter(ListRecord.data.op("->>")("especialidad").isnot(None)).all()
    matched = [r for r in rows if _norm(r.data.get("especialidad", "")) == target]
    if replacement:
        for r in matched:
            d = dict(r.data)
            d["especialidad"] = replacement
            r.data = d
        message = f"Especialidad reasignada a '{replacement}' en {len(matched)} expediente(s)"
    else:
        for r in matched:
            d = dict(r.data)
            d.pop("especialidad", None)
            r.data = d
        message = f"Especialidad eliminada de {len(matched)} expediente(s)"
    db.query(CatalogItem).filter(
        CatalogItem.item_type == "especialidad",
        CatalogItem.name == name,
    ).delete()
    db.commit()
    detail = f"eliminó especialidad '{name}'" + (f" → reasignó a '{replacement}'" if replacement else " (quitada de expedientes)") + f" ({len(matched)} expediente(s))"
    log_audit(db, current_user, "specialty_delete", entity_type="catalog", detail=detail, ip_address=client_ip(request))
    return {"message": message, "updated": len(matched)}
