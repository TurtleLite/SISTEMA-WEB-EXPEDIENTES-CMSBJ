import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.catalog_item import CatalogItem
from app.models.user import User
from app.services.auth_service import require_role

router = APIRouter(prefix="/specialties", tags=["Especialidades"])


@router.get("/")
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
    return {"message": f"Especialidad '{name}' creada correctamente", "id": item.id}


@router.put("/rename")
def rename_specialty(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    old = (data.get("old") or "").strip()
    new = (data.get("new") or "").strip()
    if not old or not new:
        raise HTTPException(status_code=400, detail="La especialidad original y la nueva son obligatorias")
    if old == new:
        return {"message": "Sin cambios", "updated": 0}
    res = db.execute(
        text(
            "UPDATE list_records "
            "SET data = jsonb_set(data, '{especialidad}', CAST(:new AS JSONB)), updated_at = now() "
            "WHERE data->>'especialidad' = :old"
        ),
        {"old": old, "new": json.dumps(new)},
    )
    catalog = db.query(CatalogItem).filter(
        CatalogItem.item_type == "especialidad",
        CatalogItem.name == old,
    ).first()
    if catalog:
        catalog.name = new
    db.commit()
    return {"message": f"Especialidad renombrada en {res.rowcount} expediente(s)", "updated": res.rowcount}


@router.delete("/")
def delete_specialty(
    name: str,
    replacement: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    name = name.strip()
    replacement = replacement.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nombre de especialidad inválido")
    if replacement == name:
        raise HTTPException(status_code=400, detail="El reemplazo no puede ser la misma especialidad")
    if replacement:
        res = db.execute(
            text(
                "UPDATE list_records "
                "SET data = jsonb_set(data, '{especialidad}', CAST(:new AS JSONB)), updated_at = now() "
                "WHERE data->>'especialidad' = :name"
            ),
            {"name": name, "new": json.dumps(replacement)},
        )
        message = f"Especialidad reasignada a '{replacement}' en {res.rowcount} expediente(s)"
    else:
        res = db.execute(
            text(
                "UPDATE list_records "
                "SET data = data - 'especialidad', updated_at = now() "
                "WHERE data->>'especialidad' = :name"
            ),
            {"name": name},
        )
        message = f"Especialidad eliminada de {res.rowcount} expediente(s)"
    db.query(CatalogItem).filter(
        CatalogItem.item_type == "especialidad",
        CatalogItem.name == name,
    ).delete()
    db.commit()
    return {"message": message, "updated": res.rowcount}
