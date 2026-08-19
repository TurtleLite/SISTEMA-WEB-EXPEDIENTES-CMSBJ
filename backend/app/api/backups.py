from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from app.services.auth_service import require_role
from app.services.backup_service import list_backups, generate_backup, get_backup_path, delete_backup
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


@router.get("/{name}/download")
def backups_download(name: str, current_user: User = Depends(require_role("admin"))):
    path = get_backup_path(name)
    if not path:
        raise HTTPException(status_code=404, detail="Respaldo no encontrado")
    return FileResponse(str(path), media_type="application/gzip", filename=name)


@router.delete("/{name}")
def backups_delete(name: str, current_user: User = Depends(require_role("admin"))):
    if not delete_backup(name):
        raise HTTPException(status_code=404, detail="Respaldo no encontrado")
    return {"message": f"Respaldo {name} eliminado"}