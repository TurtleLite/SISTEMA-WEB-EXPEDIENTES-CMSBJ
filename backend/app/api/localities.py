from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.catalog_item import CatalogItem
from app.models.user import User
from app.services.auth_service import require_role

TIPO_LOCALIDAD_OPTIONS = ["Aldea", "Barrio", "Colonia", "Caserío"]

router = APIRouter(prefix="/localities", tags=["Localidades"])


@router.get("/")
def list_localities(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    rows = db.execute(text(
        "SELECT data->>'localidad' AS loc, data->>'tipo_localidad' AS tipo, "
        "data->>'municipio' AS mun, data->>'departamento' AS dept, COUNT(*) AS n "
        "FROM list_records "
        "WHERE deleted_at IS NULL AND data->>'localidad' IS NOT NULL AND data->>'localidad' != '' "
        "GROUP BY loc, tipo, mun, dept"
    )).all()
    merged = {}
    for loc, tipo, mun, dept, n in rows:
        info = merged.setdefault(loc, {"tipo": tipo or "", "count": 0, "municipios": set(), "departamentos": set()})
        info["count"] += n
        if mun:
            info["municipios"].add(mun)
        if dept:
            info["departamentos"].add(dept)
    for item in db.query(CatalogItem).filter(CatalogItem.item_type == "localidad"):
        merged.setdefault(item.name, {"tipo": item.locality_type or "", "count": 0, "municipios": set(), "departamentos": set()})
    return [
        {
            "name": name,
            "tipo": info["tipo"],
            "count": info["count"],
            "municipio": ", ".join(sorted(info["municipios"])),
            "departamento": ", ".join(sorted(info["departamentos"])),
        }
        for name, info in sorted(merged.items())
    ]


@router.post("/")
def create_locality(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    name = (data.get("name") or "").strip()
    tipo = (data.get("tipo") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="El nombre de la localidad es obligatorio")
    if len(name) > 150:
        raise HTTPException(status_code=400, detail="El nombre no puede superar 150 caracteres")
    if tipo and tipo not in TIPO_LOCALIDAD_OPTIONS:
        raise HTTPException(status_code=400, detail=f"Tipo de localidad inválido. Válidos: {', '.join(TIPO_LOCALIDAD_OPTIONS)}")
    existing = db.query(CatalogItem).filter(
        CatalogItem.item_type == "localidad",
        CatalogItem.name == name,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="La localidad ya existe en el catálogo")
    item = CatalogItem(item_type="localidad", name=name, locality_type=tipo or None)
    db.add(item)
    db.commit()
    return {"message": f"Localidad '{name}' creada correctamente", "id": item.id}


def _norm(s: str) -> str:
    from app.services.record_service import _strip_accents
    return _strip_accents(str(s or "")).lower()


@router.put("/rename")
def rename_locality(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.models.list_definition import ListRecord
    from app.services.record_service import _compose_domicilio
    old = (data.get("old") or "").strip()
    new = (data.get("new") or "").strip()
    if not old or not new:
        raise HTTPException(status_code=400, detail="La localidad original y la nueva son obligatorias")
    if old == new:
        return {"message": "Sin cambios", "updated": 0}
    target = _norm(old)
    rows = db.query(ListRecord).filter(ListRecord.data.op("->>")("localidad").isnot(None)).all()
    matched = [r for r in rows if _norm(r.data.get("localidad", "")) == target]
    for record in matched:
        d = dict(record.data)
        d["localidad"] = new
        record.data = _compose_domicilio(d)
    catalog = db.query(CatalogItem).filter(
        CatalogItem.item_type == "localidad",
        CatalogItem.name == old,
    ).first()
    if catalog:
        catalog.name = new
    db.commit()
    return {"message": f"Localidad renombrada en {len(matched)} expediente(s)", "updated": len(matched)}


@router.delete("/")
def delete_locality(
    name: str,
    replacement: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.models.list_definition import ListRecord
    from app.services.record_service import _compose_domicilio
    name = name.strip()
    replacement = replacement.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nombre de localidad inválido")
    if replacement == name:
        raise HTTPException(status_code=400, detail="El reemplazo no puede ser la misma localidad")
    target = _norm(name)
    rows = db.query(ListRecord).filter(ListRecord.data.op("->>")("localidad").isnot(None)).all()
    matched = [r for r in rows if _norm(r.data.get("localidad", "")) == target]
    if replacement:
        rep = db.query(CatalogItem).filter(
            CatalogItem.item_type == "localidad",
            CatalogItem.name == replacement,
        ).first()
        tipo = rep.locality_type or "" if rep else ""
        for record in matched:
            d = dict(record.data)
            d["localidad"] = replacement
            if tipo:
                d["tipo_localidad"] = tipo
            elif "tipo_localidad" in d:
                del d["tipo_localidad"]
            record.data = _compose_domicilio(d)
        message = f"Localidad reasignada a '{replacement}' en {len(matched)} expediente(s)"
    else:
        for record in matched:
            d = dict(record.data)
            d.pop("localidad", None)
            d.pop("tipo_localidad", None)
            record.data = _compose_domicilio(d)
        message = f"Localidad eliminada de {len(matched)} expediente(s)"
    db.query(CatalogItem).filter(
        CatalogItem.item_type == "localidad",
        CatalogItem.name == name,
    ).delete()
    db.commit()
    return {"message": message, "updated": len(matched)}
