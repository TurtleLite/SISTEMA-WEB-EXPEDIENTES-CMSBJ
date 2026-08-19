import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

BACKUP_DIR = Path(__file__).resolve().parent.parent / "backups"
BACKUP_RE = re.compile(r"^backup_\d{8}_\d{6}\.sql\.gz$")


def list_backups() -> list:
    if not BACKUP_DIR.is_dir():
        return []
    files = sorted(BACKUP_DIR.glob("backup_*.sql.gz"), reverse=True)
    out = []
    for f in files:
        try:
            created = datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec="seconds")
        except OSError:
            created = None
        out.append({
            "name": f.name,
            "size_kb": round(f.stat().st_size / 1024, 1),
            "created_at": created,
        })
    return out


def generate_backup() -> dict:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    script = Path(__file__).resolve().parent.parent / "backup_db.py"
    env = dict(os.environ)
    try:
        result = subprocess.run(
            [sys.executable, str(script), "--keep", "14"],
            capture_output=True,
            text=True,
            timeout=180,
            env=env,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "La generación del respaldo tardó demasiado"}
    if result.returncode != 0:
        return {"ok": False, "error": result.stderr.strip() or result.stdout.strip() or "Error desconocido"}
    backups = list_backups()
    return {"ok": True, "message": result.stdout.strip().splitlines()[0] if result.stdout.strip() else "Respaldo generado", "backups": backups}


def get_backup_path(name: str) -> Path:
    if not BACKUP_RE.match(name):
        return None
    path = BACKUP_DIR / name
    return path if path.is_file() else None


def delete_backup(name: str) -> bool:
    path = get_backup_path(name)
    if not path:
        return False
    path.unlink()
    return True