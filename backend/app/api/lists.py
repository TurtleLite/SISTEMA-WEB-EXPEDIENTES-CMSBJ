from fastapi import APIRouter, Depends, UploadFile, File, Response, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.list_definition import (
    ListDefinitionCreate, ListDefinitionUpdate, ListDefinitionResponse,
    ListRecordCreate, ListRecordResponse,
)
from app.services.list_service import (
    create_list_definition, get_list_definitions, get_list_definition,
    update_list_definition, delete_list_definition,
)
from app.services.record_service import add_record, get_records, get_record, update_record, delete_record
from app.services.excel_service import import_records_from_excel
from app.services.auth_service import get_current_user, require_role
from app.services.audit_service import log_audit, client_ip
from app.models.list_definition import ListRecord
from app.models.user import User
import os
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lists", tags=["Listas"])


@router.post("/", response_model=dict)
def create_list(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.schemas.list_definition import ListDefinitionCreate
    from app.services.list_service import create_list_definition
    cols = [{"key": c["key"], "label": c["label"], "type": c.get("type", "text")} for c in data["columns_config"]]
    schema = ListDefinitionCreate(name=data["name"], description=data.get("description"), columns_config=cols)
    ld = create_list_definition(db, schema, current_user.id)
    log_audit(db, current_user, "list_create", entity_type="list", entity_id=ld.id,
              detail=f"creó la lista {data['name']}", ip_address=client_ip(request))
    return {"id": str(ld.id), "name": ld.name, "message": "Lista creada correctamente"}


@router.get("/")
def list_lists(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.list_service import get_list_definitions
    lists = get_list_definitions(db)
    return [
        {
            "id": str(ld.id),
            "name": ld.name,
            "description": ld.description,
            "columns_config": ld.columns_config,
            "is_system": ld.is_system,
            "created_by": str(ld.created_by),
            "created_at": str(ld.created_at),
        }
        for ld in lists
    ]


@router.get("/trash")
def list_trash(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.services.list_service import get_trashed_lists
    return get_trashed_lists(db)


@router.post("/trash/{list_id}/restore")
def restore_list(
    list_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.services.list_service import restore_list_definition
    ld = restore_list_definition(db, list_id, current_user.role)
    log_audit(db, current_user, "list_update", entity_type="list", entity_id=list_id,
              detail=f"restauró la lista {ld.name} desde la papelera", ip_address=client_ip(request))
    return {"message": f"Lista {ld.name} restaurada correctamente"}


@router.get("/{list_id}", response_model=dict)
def get_list(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.list_service import get_list_definition
    ld = get_list_definition(db, list_id)
    return {
        "id": str(ld.id),
        "name": ld.name,
        "description": ld.description,
        "columns_config": ld.columns_config,
        "is_system": ld.is_system,
        "created_by": str(ld.created_by),
        "created_at": str(ld.created_at),
    }


@router.put("/{list_id}")
def update_list(
    list_id: int,
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.schemas.list_definition import ListDefinitionUpdate
    from app.services.list_service import update_list_definition
    update_data = ListDefinitionUpdate(**data)
    ld = update_list_definition(db, list_id, update_data, current_user.role)
    log_audit(db, current_user, "list_update", entity_type="list", entity_id=list_id,
              detail=f"actualizó la lista {ld.name}", ip_address=client_ip(request))
    return {"message": "Lista actualizada correctamente"}


@router.delete("/{list_id}")
def delete_list(
    list_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.services.list_service import delete_list_definition
    ld = get_list_definition(db, list_id)
    delete_list_definition(db, list_id, current_user.role)
    log_audit(db, current_user, "list_delete", entity_type="list", entity_id=list_id,
              detail=f"eliminó la lista {ld.name}", ip_address=client_ip(request))
    return {"message": "Lista eliminada correctamente"}


@router.get("/{list_id}/export-expediente")
def export_expediente_excel(
    list_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "direccion", "direccion_medica", "medico")),
):
    from app.services.list_service import get_list_definition
    from app.services.record_service import get_records, count_records
    from app.services.expediente_service import export_expediente_excel

    from fastapi.responses import FileResponse
    from fastapi import HTTPException
    import os
    ld = get_list_definition(db, list_id)
    total = count_records(db, list_id)
    if total > settings.EXPORT_MAX_RECORDS:
        raise HTTPException(
            status_code=400,
            detail=f"Hay {total} expedientes. Para evitar fallos de memoria, la exportación se limita a "
                   f"{settings.EXPORT_MAX_RECORDS} por archivo. Exporte por selección en lotes de "
                   f"{settings.EXPORT_MAX_RECORDS} o menos.",
        )
    records = get_records(db, list_id, limit=settings.EXPORT_MAX_RECORDS)
    os.makedirs(settings.EXPORTS_DIR, exist_ok=True)
    filepath = os.path.join(settings.EXPORTS_DIR, f"expediente_{list_id}.xlsx")
    logo_path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'logo_sbj.png')
    export_expediente_excel(records, filepath, logo_path)
    log_audit(db, current_user, "record_export", entity_type="list", entity_id=list_id,
              detail=f"exportó expedientes de {ld.name} ({len(records)} registros)", ip_address=client_ip(request))
    return FileResponse(filepath, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=f"Expediente_{ld.name}.xlsx")


@router.get("/{list_id}/especialidades")
def list_especialidades(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.record_service import get_distinct_field_values
    from app.models.catalog_item import CatalogItem
    values = get_distinct_field_values(db, list_id, "especialidad")
    catalog = {i.name for i in db.query(CatalogItem).filter(CatalogItem.item_type == "especialidad")}
    return sorted(set(values) | catalog)


@router.get("/{list_id}/localidades")
def list_localidades(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import text
    from app.models.catalog_item import CatalogItem
    rows = db.execute(text(
        "SELECT data->>'localidad' AS loc, data->>'tipo_localidad' AS tipo, "
        "data->>'departamento' AS dep, data->>'municipio' AS mun, COUNT(*) AS n "
        "FROM list_records "
        "WHERE list_definition_id = :lid AND deleted_at IS NULL "
        "AND data->>'localidad' IS NOT NULL AND data->>'localidad' != '' "
        "GROUP BY loc, tipo, dep, mun ORDER BY loc"
    ), {"lid": list_id}).all()
    items = [
        {"localidad": r[0], "tipo": r[1] or "", "departamento": r[2] or "", "municipio": r[3] or "", "count": r[4]}
        for r in rows
    ]
    for item in db.query(CatalogItem).filter(CatalogItem.item_type == "localidad"):
        items.append({"localidad": item.name, "tipo": item.locality_type or "", "departamento": "", "municipio": "", "count": 0})
    return sorted(items, key=lambda x: (x["localidad"], x["departamento"], x["municipio"]))


@router.get("/{list_id}/field-values")
def list_field_values(
    list_id: int,
    field: str = "perfil",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.record_service import get_distinct_field_values
    return get_distinct_field_values(db, list_id, field)


@router.post("/{list_id}/export-expediente-selected")
def export_expediente_selected(
    list_id: int,
    payload: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "direccion", "direccion_medica", "medico")),
):
    from app.services.list_service import get_list_definition
    from app.services.record_service import get_records_by_ids
    from app.services.expediente_service import export_expediente_excel
    from fastapi.responses import FileResponse
    from fastapi import HTTPException
    import re
    import os
    ids = payload.get("ids", [])
    if len(ids) > settings.EXPORT_MAX_RECORDS:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo {settings.EXPORT_MAX_RECORDS} expedientes por exportación (solicitó {len(ids)}). "
                   f"Seleccione menos expedientes o expórtelos por lotes.",
        )
    ld = get_list_definition(db, list_id)
    records = get_records_by_ids(db, ids) if ids else []
    os.makedirs(settings.EXPORTS_DIR, exist_ok=True)
    filepath = os.path.join(settings.EXPORTS_DIR, f"expediente_selected_{list_id}.xlsx")
    logo_path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'logo_sbj.png')
    export_expediente_excel(records, filepath, logo_path)

    if len(records) == 1:
        r = records[0].data
        nombre = re.sub(r'[\\/*?:"<>|]', '', str(r.get('nombre', '')).strip().replace(' ', '_'))
        apellido = re.sub(r'[\\/*?:"<>|]', '', str(r.get('apellido', '')).strip().replace(' ', '_'))
        especialidad = re.sub(r'[\\/*?:"<>|]', '', str(r.get('especialidad', '')).strip().replace(' ', '_'))
        base = f"{nombre}_{apellido}"
        if especialidad:
            base += f"_{especialidad}"
        filename = f"{base}.xlsx"
    else:
        filename = f"Expedientes_Seleccionados.xlsx"

    log_audit(db, current_user, "record_export", entity_type="list", entity_id=list_id,
              detail=f"exportó {len(records)} expediente(s) seleccionado(s)", ip_address=client_ip(request))
    return FileResponse(filepath, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=filename)


@router.post("/{list_id}/import-excel")
def import_excel(
    list_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    safe_filename = os.path.basename(file.filename or "import.xlsx")
    if not safe_filename:
        safe_filename = "import.xlsx"
    file_path = os.path.join(settings.UPLOAD_DIR, f"import_{list_id}_{safe_filename}")
    with open(file_path, "wb") as f:
        f.write(file.file.read())
    try:
        count = import_records_from_excel(db, list_id, file_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    log_audit(db, current_user, "list_import", entity_type="list", entity_id=list_id,
              detail=f"importó {count} registros desde {safe_filename}", ip_address=client_ip(request))
    return {"message": f"Se importaron {count} registros correctamente", "count": count}


@router.get("/{list_id}/export-excel")
def export_list_excel(
    list_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.list_service import get_list_definition
    from app.services.record_service import count_records, get_records
    from app.services.excel_service import export_to_excel, export_to_excel_stream
    from fastapi.responses import FileResponse
    import os
    ld = get_list_definition(db, list_id)
    columns = [c["label"] for c in ld.columns_config]
    # Los registros (r.data) están keyados por campo; export_to_excel busca por la
    # etiqueta de columna. Mapeamos a etiquetas para que las celdas se llenen y la
    # altura automática (wrap) funcione correctamente.
    key_to_label = {c["key"]: c["label"] for c in ld.columns_config}
    total = count_records(db, list_id)
    os.makedirs(settings.EXPORTS_DIR, exist_ok=True)
    filepath = os.path.join(settings.EXPORTS_DIR, f"export_lista_{list_id}.xlsx")
    STREAM_THRESHOLD = 20000
    BATCH_SIZE = 5000
    if total > STREAM_THRESHOLD:
        def gen_rows():
            for skip in range(0, total, BATCH_SIZE):
                batch = get_records(db, list_id, skip, BATCH_SIZE)
                for r in batch:
                    yield {key_to_label.get(k, k): v for k, v in (r.data or {}).items()}
        export_to_excel_stream(gen_rows(), columns, filepath, title=ld.name, count=total)
    else:
        records = get_records(db, list_id, 0, total)
        data = [{key_to_label.get(k, k): v for k, v in (r.data or {}).items()} for r in records]
        export_to_excel(data, columns, filepath, title=ld.name, count=total)
    log_audit(db, current_user, "list_export_excel", entity_type="list", entity_id=list_id,
              detail=f"exportó la lista {ld.name} a Excel", ip_address=client_ip(request))
    return FileResponse(filepath, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=f"lista_{ld.name}.xlsx")


@router.get("/{list_id}/records/count")
def count_records(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.record_service import count_records
    return {"count": count_records(db, list_id)}


@router.get("/{list_id}/records/compensado-stats")
def compensado_stats(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.record_service import _not_deleted
    from app.models.list_definition import ListRecord
    base = _not_deleted(db.query(ListRecord).filter(ListRecord.list_definition_id == list_id))
    comp = base.filter(ListRecord.data.op("->>")("compensado") == "Sí").count()
    descomp = base.filter(ListRecord.data.op("->>")("compensado") == "No").count()
    return {
        "compensados": comp,
        "descompensados": descomp,
        "sin_definir": base.count() - comp - descomp,
    }


@router.put("/{list_id}/records/{record_id}/compensado")
def update_record_compensado(
    list_id: int,
    record_id: int,
    payload: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi import HTTPException
    from sqlalchemy.orm.attributes import flag_modified
    from app.models.list_definition import ListRecord

    if current_user.role not in ("medico", "direccion", "direccion_medica", "carga_px"):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar el estado de compensación")

    valor = payload.get("compensado")
    if valor not in (None, "Sí", "No"):
        raise HTTPException(status_code=400, detail="El valor debe ser «Sí», «No» o vacío")
    obs = payload.get("observacion_compensado")
    if valor == "No" and not str(obs or "").strip():
        raise HTTPException(status_code=400, detail="Debe escribir la observación porque el paciente no está compensado")

    record = db.query(ListRecord).filter(
        ListRecord.id == record_id,
        ListRecord.list_definition_id == list_id,
        ListRecord.deleted_at.is_(None),
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    data = dict(record.data or {})
    exp = (data.get("expediente") or "").strip()
    nombre = " ".join(x for x in [data.get("nombre",""), data.get("apellido","")] if x).strip()
    ident = f"{exp} — {nombre}".strip(" —") if (exp or nombre) else f"#{record_id}"
    if valor is None:
        data.pop("compensado", None)
    else:
        data["compensado"] = valor
        if str(obs or "").strip():
            data["observacion_compensado"] = str(obs).strip()
    record.data = data
    flag_modified(record, "data")
    db.commit()
    log_audit(db, current_user, "record_compensado", entity_type="record", entity_id=record_id,
              detail=f"compensación de {ident} → {valor or 'sin definir'}" + (f" ({str(obs).strip()[:80]})" if obs and valor=="No" else ""), ip_address=client_ip(request))
    return {"message": "Estado de compensación actualizado", "compensado": valor}


@router.get("/{list_id}/records/copy-number")
def copy_number(
    list_id: int,
    numero: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.record_service import copias_de_numero, numero_expediente_final
    import re
    numero = re.sub(r"\D", "", numero)
    count = copias_de_numero(db, numero) if numero else 0
    return {"numero": numero, "count": count, "expediente": numero_expediente_final(db, numero)}


@router.get("/{list_id}/records/duplicates")
def list_duplicate_identidades(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import text
    rows = db.execute(text(
        "SELECT data->>'identidad' AS identidad, array_agg(id) AS ids "
        "FROM list_records "
        "WHERE list_definition_id = :lid AND deleted_at IS NULL "
        "AND data->>'identidad' IS NOT NULL AND data->>'identidad' != '' "
        "GROUP BY data->>'identidad' HAVING COUNT(*) > 1 "
        "ORDER BY COUNT(*) DESC"
    ), {"lid": list_id}).all()
    result = []
    for r in rows:
        ids = list(r[1])
        recs = db.query(ListRecord).filter(ListRecord.id.in_(ids)).all()
        result.append({
            "identidad": r[0],
            "count": len(ids),
            "record_ids": [str(x.id) for x in recs],
            "nombres": [
                f"{x.data.get('nombre', '')} {x.data.get('apellido', '')}".strip() or "Sin nombre"
                for x in recs
            ],
        })
    return result


@router.get("/{list_id}/records/trash")
def list_trash_records(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("direccion", "direccion_medica")),
):
    from app.services.record_service import get_trashed_records, _updated_at_iso
    records = get_trashed_records(db, list_id)
    return [
        {
            "id": str(r.id),
            "list_definition_id": str(r.list_definition_id),
            "data": r.data,
            "created_by": str(r.created_by) if r.created_by else None,
            "created_at": str(r.created_at),
            "deleted_at": str(r.deleted_at),
            "updated_at": _updated_at_iso(r),
        }
        for r in records
    ]


@router.post("/{list_id}/records/{record_id}/restore")
def restore_record_endpoint(
    list_id: int,
    record_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("direccion", "direccion_medica")),
):
    from app.services.record_service import restore_record
    rec = restore_record(db, record_id, user_id=current_user.id, user_role=current_user.role)
    d = rec.data if isinstance(rec.data, dict) else {} if hasattr(rec, 'data') else {}
    exp = (d.get("expediente") or "").strip() if isinstance(d, dict) else ""
    nombre = " ".join(x for x in [d.get("nombre",""), d.get("apellido","")] if x).strip() if isinstance(d, dict) else ""
    ident = f"{exp} — {nombre}".strip(" —") if (exp or nombre) else f"#{record_id}"
    log_audit(db, current_user, "record_restore", entity_type="record", entity_id=record_id,
              detail=f"restauró expediente {ident} desde la papelera", ip_address=client_ip(request))
    return {"message": "Expediente restaurado correctamente"}


@router.get("/{list_id}/records/by-ids")
def list_records_by_ids(
    list_id: int,
    ids: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.record_service import get_records_by_ids
    id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    records = get_records_by_ids(db, id_list)
    from app.services.record_service import _updated_at_iso
    return [
        {
            "id": str(r.id),
            "list_definition_id": str(r.list_definition_id),
            "data": r.data,
            "created_by": str(r.created_by) if r.created_by else None,
            "created_at": str(r.created_at),
            "updated_at": _updated_at_iso(r),
            "updated_by": str(r.updated_by) if r.updated_by else None,
        }
        for r in records
    ]


@router.get("/{list_id}/records")
def list_records(
    list_id: int,
    skip: int = 0,
    limit: int = 1000,
    search: str = None,
    search_field: str = None,
    page: int = None,
    page_size: int = None,
    exclude_statuses: str = None,
    waiting_only: bool = False,
    estatus_cirugia: str = None,
    compensado: str = None,
    diagnostico: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if page_size is not None:
        from app.services.record_service import paginate_records, _updated_at_iso
        page = page or 1
        excluded = [s.strip() for s in (exclude_statuses or "").split(",") if s.strip()]
        items, total = paginate_records(
            db, list_id, search, search_field, page, page_size,
            exclude_statuses=excluded or None, waiting_only=waiting_only,
            estatus_cirugia=estatus_cirugia or None,
            compensado=compensado or None,
            diagnostico=diagnostico or None,
        )

        def ser(r):
            return {
                "id": str(r.id),
                "list_definition_id": str(r.list_definition_id),
                "data": r.data,
                "created_by": str(r.created_by) if r.created_by else None,
                "created_at": str(r.created_at),
                "updated_at": _updated_at_iso(r),
                "updated_by": str(r.updated_by) if r.updated_by else None,
            }

        return {
            "items": [ser(r) for r in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    from app.services.record_service import get_records
    records = get_records(db, list_id, skip, limit, search, search_field)
    return [
        {
            "id": str(r.id),
            "list_definition_id": str(r.list_definition_id),
            "data": r.data,
            "created_by": str(r.created_by) if r.created_by else None,
            "created_at": str(r.created_at),
            "updated_at": _updated_at_iso(r),
            "updated_by": str(r.updated_by) if r.updated_by else None,
        }
        for r in records
    ]


@router.post("/{list_id}/records")
def create_record(
    list_id: int,
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi import HTTPException
    from app.services.record_service import add_record
    if current_user.role not in ("direccion", "direccion_medica", "medico", "carga_px"):
        raise HTTPException(status_code=403, detail="No tienes permisos para crear expedientes")
    record = add_record(db, list_id, data.get("data", data), user_id=current_user.id)
    det = (record.data or {}).get("expediente") if isinstance(record.data, dict) else None
    log_audit(db, current_user, "record_create", entity_type="record", entity_id=record.id,
              detail=f"creó expediente {det or ''}".strip(), ip_address=client_ip(request))
    return {"id": str(record.id), "message": "Registro creado correctamente"}


@router.put("/{list_id}/records/{record_id}")
def update_record_endpoint(
    list_id: int,
    record_id: int,
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.record_service import update_record
    if current_user.role not in ("direccion", "direccion_medica", "medico", "carga_px"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="No tienes permisos para esta acción")
    # detalle específico antes de actualizar
    rec = db.query(ListRecord).filter(ListRecord.id == record_id).first()
    exp = (rec.data.get("expediente") or "").strip() if rec and isinstance(rec.data, dict) else ""
    nombre = " ".join(x for x in [rec.data.get("nombre",""), rec.data.get("apellido","")] if x).strip() if rec and isinstance(rec.data, dict) else ""
    ident = f"{exp} — {nombre}".strip(" —") if (exp or nombre) else f"#{record_id}"
    update_record(db, record_id, data.get("data", data), user_id=current_user.id, user_role=current_user.role,
                  expected_updated_at=data.get("expected_updated_at"))
    log_audit(db, current_user, "record_update", entity_type="record", entity_id=record_id,
              detail=f"actualizó expediente {ident}", ip_address=client_ip(request))
    return {"message": "Registro actualizado correctamente"}


@router.delete("/{list_id}/records/{record_id}")
def delete_record_endpoint(
    list_id: int,
    record_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.record_service import delete_record
    rec = db.query(ListRecord).filter(ListRecord.id == record_id).first()
    exp = (rec.data.get("expediente") or "").strip() if rec and isinstance(rec.data, dict) else ""
    nombre = " ".join(x for x in [rec.data.get("nombre",""), rec.data.get("apellido","")] if x).strip() if rec and isinstance(rec.data, dict) else ""
    ident = f"{exp} — {nombre}".strip(" —") if (exp or nombre) else f"#{record_id}"
    delete_record(db, record_id, user_id=current_user.id, user_role=current_user.role)
    log_audit(db, current_user, "record_delete", entity_type="record", entity_id=record_id,
              detail=f"eliminó expediente {ident} (papelera)", ip_address=client_ip(request))
    return {"message": "Registro eliminado correctamente"}


@router.post("/{list_id}/records/bulk-delete")
def bulk_delete_records_endpoint(
    list_id: int,
    payload: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi import HTTPException
    from sqlalchemy.exc import SQLAlchemyError, OperationalError
    from app.services.record_service import delete_record
    import time

    ids = []
    for x in payload.get("ids", []):
        try:
            ids.append(int(x))
        except (TypeError, ValueError):
            logger.warning(f"bulk-delete: id inválido ignorado -> {x!r}")

    deleted = 0
    errors = []
    for record_id in ids:
        for attempt in range(3):
            try:
                delete_record(db, record_id, user_id=current_user.id, user_role=current_user.role)
                deleted += 1
                break
            except HTTPException as e:
                db.rollback()
                errors.append({"id": record_id, "detail": e.detail})
                break
            except OperationalError as e:
                db.rollback()
                sqlstate = getattr(e.orig, "sqlstate", "") if e.orig else ""
                if sqlstate == "40001" and attempt < 2:
                    time.sleep(0.2 * (attempt + 1))
                    continue
                logger.error(f"bulk-delete: error de BD al eliminar id={record_id}: {e}")
                errors.append({"id": record_id, "detail": "Error de base de datos al eliminar"})
                break
            except SQLAlchemyError as e:
                db.rollback()
                logger.error(f"bulk-delete: error al eliminar id={record_id}: {e}")
                errors.append({"id": record_id, "detail": "Error de base de datos al eliminar"})
                break
    if deleted:
        # detalle con muestra de expedientes eliminados (máx 5)
        try:
            sample_recs = db.query(ListRecord).filter(ListRecord.id.in_(ids[:5])).all()
            sample = ", ".join((r.data.get("expediente") or f"#{r.id}") for r in sample_recs if isinstance(r.data, dict))[:120]
            extra = f" — {sample}" + ("…" if deleted>5 else "") if sample else ""
        except Exception:
            extra = ""
        log_audit(db, current_user, "record_delete_bulk", entity_type="record",
                  detail=f"eliminó {deleted} expediente(s){extra} (papelera)", ip_address=client_ip(request))
    message = f"{deleted} registro(s) eliminado(s)"
    if errors:
        message += f", {len(errors)} no eliminado(s)"
    return {"message": message, "deleted": deleted, "errors": errors}




