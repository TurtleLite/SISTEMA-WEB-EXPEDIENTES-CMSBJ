from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from collections import Counter
from app.core.database import get_db
from app.core.config import settings
from app.models.report import Report
from app.models.list_definition import ListDefinition, ListRecord
from app.services.auth_service import get_current_user, require_role
from app.services.audit_service import log_audit, client_ip
from app.models.user import User
from app.services.excel_service import export_to_excel
import os

router = APIRouter(prefix="/reports", tags=["Reportes"])


def _list_for_report(db: Session, report: Report):
    from app.models.list_definition import ListDefinition
    if report.list_definition_id:
        return db.query(ListDefinition).filter(ListDefinition.id == report.list_definition_id).first()
    return db.query(ListDefinition).filter(ListDefinition.is_system == True).first()


def _records_for_report(db: Session, report: Report):
    ld = _list_for_report(db, report)
    if not ld:
        return []
    filt = report.filters or {}
    conds = []
    params = {"lid": ld.id}

    from datetime import datetime, timedelta

    desde = filt.get("fecha_desde")
    hasta = filt.get("fecha_hasta")
    if desde:
        try:
            params["desde"] = datetime.strptime(str(desde), "%Y-%m-%d")
            conds.append("created_at >= :desde")
        except ValueError:
            pass
    if hasta:
        try:
            params["hasta"] = datetime.strptime(str(hasta), "%Y-%m-%d") + timedelta(days=1)
            conds.append("created_at < :hasta")
        except ValueError:
            pass

    especialidad = filt.get("especialidad")
    if especialidad:
        conds.append("data->>'especialidad' = :esp")
        params["esp"] = especialidad

    perfil = filt.get("perfil")
    if perfil:
        conds.append("data->>'perfil' = :perf")
        params["perf"] = perfil

    criticidad = filt.get("criticidad")
    if criticidad:
        conds.append("data->>'criticidad' = :crit")
        params["crit"] = criticidad

    compensado = filt.get("compensado")
    if compensado:
        conds.append("data->>'compensado' = :comp")
        params["comp"] = compensado

    estatus = filt.get("estatus_cirugia")
    if estatus:
        conds.append("data->>'estatus_cirugia' = :estat")
        params["estat"] = estatus

    if not conds:
        records = db.query(ListRecord).filter(
            ListRecord.list_definition_id == ld.id, ListRecord.deleted_at.is_(None)
        ).all()
    else:
        from sqlalchemy import text
        sql = text(f"SELECT id FROM list_records WHERE list_definition_id = :lid AND deleted_at IS NULL AND {' AND '.join(conds)}")
        ids = db.execute(sql, params).scalars().all()
        records = db.query(ListRecord).filter(ListRecord.id.in_(ids)).all()

    order = report.record_order or []
    if order:
        order_map = {str(rid): idx for idx, rid in enumerate(order)}
        records.sort(key=lambda r: order_map.get(str(r.id), len(order_map)))
    return records


REPORT_COLUMNS = [
    ("No", "no"),
    ("Nombre/Name", "nombre"),
    ("Age", "edad"),
    ("Diagnostic/Procedure", "diagnostico"),
    ("Pf", "perfil"),
    ("Origin", "domicilio"),
    ("Phone NO.", "telefono"),
    ("Housing", "albergue"),
    ("Chart", "expediente"),
    ("Referred by", "nombre_medico"),
    ("Observación", "observacion_estatus"),
]


def _report_columns() -> list[str]:
    return [label for label, _ in REPORT_COLUMNS]


def _report_sequence_filename(db: Session, report: Report) -> str:
    import re
    name = re.sub(r'[\\/*?:"<>|]', '', str(report.name or "Reporte")).strip().replace(" ", "_") or "Reporte"
    return f"REPORTE_{name}.xlsx"


def _user_counts(db: Session, records: list[ListRecord] = None, list_id: int = None) -> list[dict]:
    """Cuántos expedientes creó cada usuario (nombre completo con título)."""
    counter = Counter()
    if records is not None:
        for rec in records:
            counter[rec.created_by if rec.created_by is not None else 0] += 1
    elif list_id is not None:
        rows = (
            db.query(ListRecord.created_by, func.count(ListRecord.id))
            .filter(ListRecord.list_definition_id == list_id, ListRecord.deleted_at.is_(None))
            .group_by(ListRecord.created_by)
            .all()
        )
        counter = Counter({uid: c for uid, c in rows})
    uid_ints = [uid for uid in counter if uid]
    users = {}
    if uid_ints:
        users = {u.id: u.full_name for u in db.query(User).filter(User.id.in_(uid_ints)).all()}
    result = []
    for uid, c in counter.most_common():
        result.append({
            "full_name": users.get(uid, "Importación") if uid else "Importación (sin usuario)",
            "count": c,
        })
    return result


def _report_rows(records: list[ListRecord]) -> list[dict]:
    rows = []
    for idx, rec in enumerate(records, 1):
        d = rec.data or {}
        nombre = " ".join(x for x in [d.get("nombre", ""), d.get("apellido", "")] if x).strip()
        telefono = " / ".join(x for x in [d.get("telefono"), d.get("telefono2"), d.get("telefono3")] if x)
        rows.append({
            "_id": str(rec.id),
            "No": idx,
            "Nombre/Name": nombre,
            "Age": d.get("edad", ""),
            "Diagnostic/Procedure": d.get("diagnostico", ""),
            "Pf": d.get("perfil", ""),
            "Origin": d.get("domicilio", ""),
            "Phone NO.": telefono,
            "Housing": d.get("albergue", ""),
            "Chart": d.get("expediente", ""),
            "Referred by": d.get("nombre_medico", ""),
            "Observación": d.get("observacion_estatus", ""),
        })
    return rows


@router.post("/")
def create_report(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("direccion", "direccion_medica")),
):
    list_id = data.get("list_definition_id")
    if not list_id and (data.get("filters") or {}):
        from app.models.list_definition import ListDefinition
        system_list = db.query(ListDefinition).filter(ListDefinition.is_system == True).first()
        if system_list:
            list_id = system_list.id
    report = Report(
        name=data["name"],
        description=data.get("description"),
        list_definition_id=list_id,
        filters=data.get("filters"),
        columns_selected=data.get("columns_selected"),
        created_by=current_user.id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    log_audit(db, current_user, "report_create", entity_type="report", entity_id=report.id,
              detail=f"creó el reporte {report.name}", ip_address=client_ip(request))
    return {"id": str(report.id), "message": "Reporte creado correctamente"}


@router.get("/")
def list_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("direccion", "direccion_medica")),
):
    reports = db.query(Report).order_by(Report.created_at.desc()).all()
    counts = dict(
        db.query(ListRecord.list_definition_id, func.count(ListRecord.id))
        .filter(ListRecord.deleted_at.is_(None))
        .group_by(ListRecord.list_definition_id).all()
    )
    result = []
    for r in reports:
        filt = r.filters or {}
        has_filters = any(filt.get(k) for k in ("especialidad", "perfil", "criticidad", "estatus_cirugia", "fecha_desde", "fecha_hasta"))
        if has_filters:
            records = _records_for_report(db, r)
            record_count = len(records)
            breakdown = _user_counts(db, records=records)
        else:
            ld = _list_for_report(db, r)
            record_count = counts.get(ld.id, 0) if ld else 0
            breakdown = _user_counts(db, list_id=ld.id) if ld else []
        result.append({
            "id": str(r.id),
            "name": r.name,
            "description": r.description,
            "list_definition_id": str(r.list_definition_id) if r.list_definition_id else None,
            "filters": r.filters,
            "created_by": str(r.created_by),
            "file_path_excel": r.file_path_excel,
            "file_path_pdf": r.file_path_pdf,
            "created_at": str(r.created_at),
            "record_count": record_count,
            "created_by_breakdown": breakdown,
        })
    return result


@router.get("/{report_id}")
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("direccion", "direccion_medica")),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    return {
        "id": str(report.id),
        "name": report.name,
        "description": report.description,
        "list_definition_id": str(report.list_definition_id) if report.list_definition_id else None,
        "filters": report.filters,
        "columns_selected": report.columns_selected,
        "file_path_excel": report.file_path_excel,
        "file_path_pdf": report.file_path_pdf,
        "created_at": str(report.created_at),
    }


@router.put("/{report_id}/order")
def save_report_order(
    report_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("direccion", "direccion_medica")),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    record_ids = data.get("record_ids") or []
    if not isinstance(record_ids, list):
        raise HTTPException(status_code=400, detail="record_ids debe ser una lista")
    report.record_order = [str(x) for x in record_ids]
    db.commit()
    return {"message": "Orden del reporte guardado", "count": len(record_ids)}


@router.post("/{report_id}/generate-excel")
def generate_excel_report(
    report_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("direccion", "direccion_medica")),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    ld = _list_for_report(db, report)
    if not ld:
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    columns = _report_columns()
    records = _records_for_report(db, report)
    if len(records) > settings.REPORT_MAX_RECORDS:
        raise HTTPException(
            status_code=400,
            detail=f"El reporte tiene {len(records)} registros; máximo {settings.REPORT_MAX_RECORDS} por archivo. "
                   f"Use filtros (especialidad, perfil, criticidad o estatus) para acotarlo.",
        )
    filt = report.filters or {}
    is_date_report = bool(filt.get("fecha_desde") or filt.get("fecha_hasta"))
    if is_date_report:
        breakdown = _user_counts(db, records=records)
        columns = ["Usuario", "Expedientes creados"]
        data = [{"Usuario": b["full_name"], "Expedientes creados": b["count"]} for b in breakdown]
        os.makedirs(settings.REPORTS_DIR, exist_ok=True)
        filepath = os.path.join(settings.REPORTS_DIR, f"reporte_{report.id}.xlsx")
        from app.services.excel_service import export_to_excel
        export_to_excel(data, columns, filepath, title=report.name, filters=report.filters, count=len(records))
        report.file_path_excel = filepath
        db.commit()
        log_audit(db, current_user, "report_generate", entity_type="report", entity_id=report_id,
                  detail=f"generó el reporte {report.name} ({len(records)} expedientes en el rango)", ip_address=client_ip(request))
        return {"message": "Reporte Excel generado", "file_path": filepath, "filename": _report_sequence_filename(db, report), "count": len(records)}
    data = _report_rows(records)
    os.makedirs(settings.REPORTS_DIR, exist_ok=True)
    filepath = os.path.join(settings.REPORTS_DIR, f"reporte_{report.id}.xlsx")
    from app.services.excel_service import export_to_excel
    export_to_excel(data, columns, filepath, title=report.name, filters=report.filters, count=len(data))
    report.file_path_excel = filepath
    db.commit()
    log_audit(db, current_user, "report_generate", entity_type="report", entity_id=report_id,
              detail=f"generó el reporte {report.name} ({len(data)} registros)", ip_address=client_ip(request))
    return {"message": "Reporte Excel generado", "file_path": filepath, "filename": _report_sequence_filename(db, report), "count": len(data)}


@router.get("/{report_id}/preview")
def preview_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("direccion", "direccion_medica")),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    ld = _list_for_report(db, report)
    if not ld:
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    columns = _report_columns()
    records = _records_for_report(db, report)
    if len(records) > settings.REPORT_MAX_RECORDS:
        raise HTTPException(
            status_code=400,
            detail=f"El reporte tiene {len(records)} registros; máximo {settings.REPORT_MAX_RECORDS} para previsualizar. "
                   f"Use filtros para acotarlo.",
        )
    filt = report.filters or {}
    is_date_report = bool(filt.get("fecha_desde") or filt.get("fecha_hasta"))
    if is_date_report:
        breakdown = _user_counts(db, records=records)
        return {
            "name": report.name,
            "description": report.description,
            "filters": report.filters,
            "columns": ["Usuario", "Expedientes creados"],
            "count": len(records),
            "records": [{"Usuario": b["full_name"], "Expedientes creados": b["count"]} for b in breakdown],
            "record_ids": [],
        }
    rows = _report_rows(records)
    return {
        "name": report.name,
        "description": report.description,
        "filters": report.filters,
        "columns": columns,
        "count": len(rows),
        "records": rows[:200],
        "record_ids": [str(r.id) for r in records],
        "created_by_breakdown": _user_counts(db, records=records),
    }


@router.get("/{report_id}/download")
def download_report(
    report_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("direccion", "direccion_medica")),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    file_path = report.file_path_excel
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado. Genere el reporte primero.")
    log_audit(db, current_user, "report_download", entity_type="report", entity_id=report_id,
              detail=f"descargó el reporte {report.name}", ip_address=client_ip(request))
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return FileResponse(file_path, media_type=media_type, filename=_report_sequence_filename(db, report))


@router.delete("/{report_id}")
def delete_report(
    report_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("direccion", "direccion_medica")),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    if report.file_path_excel and os.path.exists(report.file_path_excel):
        os.remove(report.file_path_excel)
    db.delete(report)
    db.commit()
    log_audit(db, current_user, "report_delete", entity_type="report", entity_id=report_id,
              detail=f"eliminó el reporte {report.name}", ip_address=client_ip(request))
    return {"message": "Reporte eliminado correctamente"}
