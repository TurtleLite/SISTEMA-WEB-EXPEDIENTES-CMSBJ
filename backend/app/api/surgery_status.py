import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.catalog_item import CatalogItem
from app.models.user import User
from app.services.auth_service import require_role

router = APIRouter(prefix="/surgery-status", tags=["Estatus de Cirugía"])


@router.get("/")
def list_surgery_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    rows = db.execute(text(
        "SELECT data->>'estatus_cirugia' AS est, COUNT(*) AS n "
        "FROM list_records "
        "WHERE deleted_at IS NULL AND data->>'estatus_cirugia' IS NOT NULL AND data->>'estatus_cirugia' != '' "
        "GROUP BY est"
    )).all()
    counts = {r[0]: r[1] for r in rows}
    catalog_names = {i.name for i in db.query(CatalogItem).filter(CatalogItem.item_type == "estatus_cirugia")}
    merged = {name: counts.get(name, 0) for name in counts}
    for name in catalog_names:
        merged.setdefault(name, 0)
    return [{"name": name, "count": merged[name]} for name in sorted(merged)]


@router.post("/")
def create_surgery_status(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="El nombre del estatus es obligatorio")
    if len(name) > 150:
        raise HTTPException(status_code=400, detail="El nombre no puede superar 150 caracteres")
    existing = db.query(CatalogItem).filter(
        CatalogItem.item_type == "estatus_cirugia",
        CatalogItem.name == name,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="El estatus ya existe en el catálogo")
    item = CatalogItem(item_type="estatus_cirugia", name=name)
    db.add(item)
    db.commit()
    return {"message": f"Estatus '{name}' creado correctamente", "id": item.id}


def _norm(s: str) -> str:
    from app.services.record_service import _strip_accents
    return _strip_accents(str(s or "")).lower()


@router.put("/rename")
def rename_surgery_status(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.models.list_definition import ListRecord
    old = (data.get("old") or "").strip()
    new = (data.get("new") or "").strip()
    if not old or not new:
        raise HTTPException(status_code=400, detail="El estatus original y el nuevo son obligatorios")
    if old == new:
        return {"message": "Sin cambios", "updated": 0}
    target = _norm(old)
    rows = db.query(ListRecord).filter(ListRecord.data.op("->>")("estatus_cirugia").isnot(None)).all()
    matched = [r for r in rows if _norm(r.data.get("estatus_cirugia", "")) == target]
    for r in matched:
        d = dict(r.data)
        d["estatus_cirugia"] = new
        r.data = d
    catalog = db.query(CatalogItem).filter(
        CatalogItem.item_type == "estatus_cirugia",
        CatalogItem.name == old,
    ).first()
    if catalog:
        catalog.name = new
    db.commit()
    return {"message": f"Estatus renombrado en {len(matched)} expediente(s)", "updated": len(matched)}


@router.delete("/")
def delete_surgery_status(
    name: str,
    replacement: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.models.list_definition import ListRecord
    name = name.strip()
    replacement = replacement.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nombre de estatus inválido")
    if replacement == name:
        raise HTTPException(status_code=400, detail="El reemplazo no puede ser el mismo estatus")
    target = _norm(name)
    rows = db.query(ListRecord).filter(ListRecord.data.op("->>")("estatus_cirugia").isnot(None)).all()
    matched = [r for r in rows if _norm(r.data.get("estatus_cirugia", "")) == target]
    if replacement:
        for r in matched:
            d = dict(r.data)
            d["estatus_cirugia"] = replacement
            r.data = d
        message = f"Estatus reasignado a '{replacement}' en {len(matched)} expediente(s)"
    else:
        for r in matched:
            d = dict(r.data)
            d.pop("estatus_cirugia", None)
            r.data = d
        message = f"Estatus eliminado de {len(matched)} expediente(s)"
    db.query(CatalogItem).filter(
        CatalogItem.item_type == "estatus_cirugia",
        CatalogItem.name == name,
    ).delete()
    db.commit()
    return {"message": message, "updated": len(matched)}
