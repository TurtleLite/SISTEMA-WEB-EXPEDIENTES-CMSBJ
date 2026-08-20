from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.services.auth_service import require_role
from app.services.audit_service import log_audit, client_ip
from app.services.backup_service import list_backups, generate_backup, get_backup_blob, delete_backup, restore_backup
from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/backups", tags=["Respaldos"])


@router.get("/")
def backups_list(current_user: User = Depends(require_role("admin"))):
    return {"items": list_backups()}


@router.post("/generate")
def backups_generate(current_user: User = Depends(require_role("admin"))):
    result = generate_backup()
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("error", "No se pudo generar el respaldo"))
    return result


@router.post("/restore")
async def backups_restore(
    file: UploadFile = File(...),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    data = await file.read()
    result = restore_backup(data)
    log_audit(
        db, current_user, "backup_restore", entity_type="backup",
        entity_id=file.filename or "restore.sql.gz",
        detail="importó un respaldo en la base de datos",
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
    return Response(
        content=blob[1],
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{blob[0]}"'},
    )


@router.delete("/{name}")
def backups_delete(name: str, current_user: User = Depends(require_role("admin"))):
    if not delete_backup(name):
        raise HTTPException(status_code=404, detail="Respaldo no encontrado")
    return {"message": f"Respaldo {name} eliminado"}