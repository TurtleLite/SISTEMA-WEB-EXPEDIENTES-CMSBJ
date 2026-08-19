import gzip
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import psycopg2
from psycopg2 import sql

from app.core.config import settings

BACKUP_DIR = Path(__file__).resolve().parent.parent / "backups"
BACKUP_RE = re.compile(r"^backup_\d{8}_\d{6}\.sql\.gz$")


def _dsn() -> str:
    url = settings.DATABASE_URL
    if url.startswith("cockroachdb://"):
        url = url.replace("cockroachdb://", "postgresql://", 1)
    elif url.startswith("postgresql+psycopg2://"):
        url = url.replace("postgresql+psycopg2://", "postgresql://", 1)
    return url


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


def restore_backup(data: bytes) -> dict:
    """Restaura la base de datos a partir de un respaldo .sql.gz subido por el usuario.

    Vuelca todas las tablas existentes (CASCADE), ejecuta el script SQL del respaldo
    dentro de una transacción y ajusta las secuencias de las columnas 'id'.
    """
    if not data.startswith(b"\x1f\x8b"):
        return {"ok": False, "error": "El archivo no es un respaldo comprimido válido (.sql.gz)"}
    try:
        sql_text = gzip.decompress(data).decode("utf-8")
    except Exception:
        return {"ok": False, "error": "No se pudo descomprimir el archivo (¿está corrupto?)"}

    conn = None
    try:
        conn = psycopg2.connect(_dsn())
        conn.autocommit = False
        cur = conn.cursor()

        cur.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
        )
        old_tables = [r[0] for r in cur.fetchall()]
        for t in old_tables:
            cur.execute(sql.SQL("DROP TABLE IF EXISTS {} CASCADE").format(sql.Identifier(t)))

        cur.execute(sql_text)

        cur.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
        )
        restored = [r[0] for r in cur.fetchall()]
        for t in restored:
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = %s AND column_name = 'id'",
                (t,),
            )
            if not cur.fetchone():
                continue
            cur.execute("SELECT pg_get_serial_sequence(%s, 'id')", (t,))
            row = cur.fetchone()
            seq = row[0] if row and row[0] else None
            if not seq:
                seq = f"{t}_id_seq"
                cur.execute(
                    sql.SQL("CREATE SEQUENCE IF NOT EXISTS {} OWNED BY {}.id").format(
                        sql.Identifier(seq), sql.Identifier(t)
                    )
                )
            cur.execute(sql.SQL("SELECT COALESCE(MAX(id), 0) + 1 FROM {}").format(sql.Identifier(t)))
            nxt = cur.fetchone()[0]
            cur.execute("SELECT setval(%s, %s, false)", (seq, nxt))

        conn.commit()
        return {
            "ok": True,
            "message": "Base de datos restaurada correctamente (%d tabla(s))" % len(restored),
        }
    except Exception as e:
        if conn is not None:
            conn.rollback()
        return {"ok": False, "error": "Error al restaurar: %s" % e}
    finally:
        if conn is not None:
            conn.close()