from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.services.auth_service import require_role
from app.services.audit_service import log_audit, client_ip
from app.services.backup_service import list_backups, generate_backup, generate_excel_backup, get_backup_blob, delete_backup, restore_backup
from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/backups", tags=["Respaldos"])


@router.get("/")
def backups_list(current_user: User = Depends(require_role("admin"))):
    items = list_backups()
    # Añadir tipo para que el frontend distinga SQL vs Excel (tabla general)
    for it in items:
        name = it.get("name", "")
        if name.endswith(".xlsx"):
            it["type"] = "excel"
        else:
            it["type"] = "sql"
    return {"items": items}


@router.post("/generate")
def backups_generate(current_user: User = Depends(require_role("admin"))):
    result = generate_backup()
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("error", "No se pudo generar el respaldo"))
    return result


@router.post("/generate-excel")
def backups_generate_excel(current_user: User = Depends(require_role("admin"))):
    result = generate_excel_backup()
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("error", "No se pudo generar la tabla general"))
    return result


@router.post("/restore")
async def backups_restore(
    file: UploadFile = File(...),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    data = await file.read()
    filename = file.filename or ""
    is_excel = filename.lower().endswith(".xlsx") or data.startswith(b"PK")
    result = restore_backup(data)
    detail = result.get("message") or ("importó %d expediente(s) desde Excel tabla general" % result.get("count", 0) if is_excel else "importó un respaldo en la base de datos")
    log_audit(
        db, current_user, "backup_restore", entity_type="backup",
        entity_id=filename or ("restore.xlsx" if is_excel else "restore.sql.gz"),
        detail=detail,
        ip_address=client_ip(request),
    )
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("error", "No se pudo restaurar el respaldo"))
    return result


@router.get("/{name}/download")
def backups_download(name: str, current_user: User = Depends(require_role("admin"))):
    blob = get_backup_blob(name)
    if not blob:
        raise HTTPException(status_code=404, detail="Respaldo no encontrado")
    filename, data = blob
    if filename.endswith(".xlsx"):
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        media = "application/gzip"
    return Response(
        content=data,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{name}")
def backups_delete(name: str, current_user: User = Depends(require_role("admin"))):
    if not delete_backup(name):
        raise HTTPException(status_code=404, detail="Respaldo no encontrado")
    return {"message": f"Respaldo {name} eliminado"}