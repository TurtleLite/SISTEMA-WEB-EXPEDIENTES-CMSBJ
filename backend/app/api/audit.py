from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.services.audit_service import list_logs, serialize_log, log_audit, client_ip
from app.services.device_service import get_device_status_map
from app.services.auth_service import require_role
from app.models.user import User
import os
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/audit", tags=["Auditoría"])

ACTION_LABELS = {
    "login": "Inicio de sesión",
    "login_failed": "Intento de sesión fallido",
    "login_locked": "Cuenta bloqueada",
    "logout": "Cierre de sesión",
    "session_revoked": "Sesión revocada",
    "user_create": "Usuario creado",
    "user_update": "Usuario actualizado",
    "user_delete": "Usuario eliminado",
    "user_unlock": "Usuario desbloqueado",
    "device_registered": "Equipo registrado",
    "device_approved": "Equipo aprobado",
    "device_blocked": "Equipo bloqueado",
    "device_note": "Nota de equipo",
    "login_blocked": "Equipo bloqueado rechazado",
    "list_create": "Lista creada",
    "list_update": "Lista actualizada",
    "list_delete": "Lista eliminada",
    "list_import": "Importación Excel",
    "list_export_excel": "Lista exportada a Excel",
    "record_create": "Expediente creado",
    "record_update": "Expediente actualizado",
    "record_delete": "Expediente eliminado",
    "record_delete_bulk": "Expedientes eliminados",
    "record_restore": "Expediente restaurado",
    "record_export": "Expedientes exportados",
    "report_create": "Reporte creado",
    "report_generate": "Reporte generado",
    "report_download": "Reporte descargado",
    "report_delete": "Reporte eliminado",
    "daylist_save": "Listado del día guardado",
    "daylist_export": "Listado del día exportado",
    "daylist_delete": "Listado del día eliminado",
    "audit_export": "Auditoría exportada",
}

ENTITY_LABELS = {
    "auth": "Autenticación",
    "user": "Usuario",
    "list": "Lista",
    "record": "Expediente",
    "report": "Reporte",
    "daylist": "Listado del día",
    "session": "Sesión",
    "device": "Equipo",
}


def _fmt_dt(value: str) -> str:
    try:
        dt = datetime.fromisoformat(value)
        dt = dt.astimezone(timezone(timedelta(hours=-6)))
        return dt.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return value


@router.get("/")
def list_audit_logs(
    skip: int = 0,
    limit: int = 100,
    action: str = None,
    entity_type: str = None,
    user_id: int = None,
    username: str = None,
    fecha_desde: str = None,
    fecha_hasta: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    items, total = list_logs(
        db,
        skip=min(max(skip, 0), 100000),
        limit=min(max(limit, 1), 500),
        action=action,
        entity_type=entity_type,
        user_id=user_id,
        username=username,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
    )
    status_map = get_device_status_map(db)
    serialized = []
    for item in items:
        entry = serialize_log(item)
        info = status_map.get(entry.get("ip_address") or "")
        entry["device_status"] = info["status"] if info else None
        entry["device_shared"] = bool(info and info["shared"])
        serialized.append(entry)
    return {
        "items": serialized,
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/export-excel")
def export_audit_excel(
    action: str = None,
    entity_type: str = None,
    username: str = None,
    fecha_desde: str = None,
    fecha_hasta: str = None,
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    items, total = list_logs(
        db,
        skip=0,
        limit=10000,
        action=action,
        entity_type=entity_type,
        username=username,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        ascending=True,
    )
    columns = ["No", "Fecha y hora", "Usuario", "Acción", "Tipo", "Detalle", "Equipo"]
    rows = []
    for idx, item in enumerate(items, 1):
        entry = serialize_log(item)
        rows.append({
            "No": idx,
            "Fecha y hora": _fmt_dt(entry["created_at"]),
            "Usuario": entry.get("username") or "—",
            "Acción": ACTION_LABELS.get(entry["action"], entry["action"]),
            "Tipo": ENTITY_LABELS.get(entry.get("entity_type") or "", entry.get("entity_type") or "—"),
            "Detalle": entry.get("detail") or "—",
            "Equipo": entry.get("ip_address") or "—",
        })
    os.makedirs(settings.REPORTS_DIR, exist_ok=True)
    now = datetime.now(timezone(timedelta(hours=-6)))
    filepath = os.path.join(settings.REPORTS_DIR, f"audit_{now.strftime('%Y%m%d_%H%M%S')}.xlsx")
    from app.services.excel_service import export_to_excel
    export_to_excel(
        rows, columns, filepath,
        title="Eventos Técnicos del Sistema",
        count=total,
        filters={"fecha_desde": fecha_desde, "fecha_hasta": fecha_hasta} if (fecha_desde or fecha_hasta) else None,
    )
    log_audit(db, current_user, "audit_export", entity_type="auth",
              detail=f"exportó los eventos técnicos del sistema ({total} eventos)", ip_address=client_ip(request))
    filename = f"EVENTOS_TECNICOS_{now.strftime('%Y-%m-%d')}.xlsx"
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return FileResponse(filepath, media_type=media_type, filename=filename)