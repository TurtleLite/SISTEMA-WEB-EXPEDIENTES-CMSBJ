from datetime import date, datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.list_definition import ListRecord
from app.models.surgery_day_list import SurgeryDayList
from app.models.user import User
from app.services.auth_service import require_role
from app.services.audit_service import log_audit, client_ip

router = APIRouter(prefix="/day-lists", tags=["Listados del día"])


def _parse_date(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Fecha inválida. Use el formato YYYY-MM-DD")


def _serialize(day_list: SurgeryDayList) -> dict:
    return {
        "id": str(day_list.id),
        "date": day_list.date.isoformat(),
        "record_ids": day_list.record_ids or [],
        "count": len(day_list.record_ids or []),
        "created_at": str(day_list.created_at),
        "updated_at": str(day_list.updated_at),
    }


@router.get("/")
def list_day_lists(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "direccion", "direccion_medica")),
):
    lists = db.query(SurgeryDayList).order_by(SurgeryDayList.date.desc()).all()
    return [_serialize(l) for l in lists]


@router.get("/{list_date}")
def get_day_list(
    list_date: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "direccion", "direccion_medica")),
):
    d = _parse_date(list_date)
    day_list = db.query(SurgeryDayList).filter(SurgeryDayList.date == d).first()
    if not day_list:
        return {"id": None, "date": list_date, "record_ids": [], "count": 0}
    return _serialize(day_list)


@router.put("/{list_date}")
def save_day_list(
    list_date: str,
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "direccion", "direccion_medica")),
):
    d = _parse_date(list_date)
    ids = [str(i) for i in data.get("record_ids", [])]
    day_list = db.query(SurgeryDayList).filter(SurgeryDayList.date == d).first()
    if not day_list:
        day_list = SurgeryDayList(date=d, record_ids=ids)
        db.add(day_list)
    else:
        day_list.record_ids = ids
    db.commit()
    db.refresh(day_list)
    log_audit(db, current_user, "daylist_save", entity_type="daylist",
              detail=f"guardó listado del {d.isoformat()} ({len(ids)} registros)", ip_address=client_ip(request))
    return _serialize(day_list)


@router.get("/{list_date}/export-excel")
def export_day_list_excel(
    list_date: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "direccion", "direccion_medica")),
):
    import os
    from app.api.reports import _report_columns, _report_rows
    from app.services.excel_service import export_day_list_to_excel

    d = _parse_date(list_date)
    day_list = db.query(SurgeryDayList).filter(SurgeryDayList.date == d).first()
    if not day_list or not day_list.record_ids:
        raise HTTPException(status_code=404, detail="No hay listado guardado para esa fecha")

    ids = [int(i) for i in day_list.record_ids if str(i).isdigit()]
    records = db.query(ListRecord).filter(ListRecord.id.in_(ids)).all()
    by_id = {r.id: r for r in records}
    ordered = [by_id[i] for i in ids if i in by_id]

    grouped: dict[str, list] = {}
    for rec in ordered:
        esp = (rec.data or {}).get("especialidad") or "Sin especialidad"
        grouped.setdefault(esp, []).append(rec)
    sections = [{"esp": esp, "rows": _report_rows(recs)} for esp, recs in grouped.items()]

    columns = [c for c in _report_columns() if c != "Observación"]
    title = f"Listado de Cirugías - {d.strftime('%d/%m/%Y')}"
    os.makedirs(settings.REPORTS_DIR, exist_ok=True)
    filepath = os.path.join(settings.REPORTS_DIR, f"LISTADO_{d.isoformat()}.xlsx")
    export_day_list_to_excel(sections, columns, filepath, title=title, count=len(ordered))
    log_audit(db, current_user, "daylist_export", entity_type="daylist",
              detail=f"exportó listado del {d.isoformat()}", ip_address=client_ip(request))
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return FileResponse(filepath, media_type=media_type, filename=os.path.basename(filepath))


@router.delete("/{list_date}")
def delete_day_list(
    list_date: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "direccion", "direccion_medica")),
):
    d = _parse_date(list_date)
    day_list = db.query(SurgeryDayList).filter(SurgeryDayList.date == d).first()
    if not day_list:
        raise HTTPException(status_code=404, detail="No hay listado para esa fecha")
    db.delete(day_list)
    db.commit()
    log_audit(db, current_user, "daylist_delete", entity_type="daylist",
              detail=f"eliminó listado del {d.isoformat()}", ip_address=client_ip(request))
    return {"message": "Listado eliminado"}
