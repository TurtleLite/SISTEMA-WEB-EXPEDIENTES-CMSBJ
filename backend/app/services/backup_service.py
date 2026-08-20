import gzip
import io
import json
import re
from datetime import datetime

import psycopg2
from psycopg2 import sql
from psycopg2.extensions import AsIs

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.backup import Backup

BACKUP_RE = re.compile(r"^backup_\d{8}_\d{6}\.sql\.gz$")
KEEP_BACKUPS = 14


def _dsn() -> str:
    url = settings.DATABASE_URL
    if url.startswith("cockroachdb://"):
        url = url.replace("cockroachdb://", "postgresql://", 1)
    elif url.startswith("postgresql+psycopg2://"):
        url = url.replace("postgresql+psycopg2://", "postgresql://", 1)
    return url


def _table_names(cur) -> list:
    cur.execute(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
    )
    return [r[0] for r in cur.fetchall()]


def _ordered_tables(tables: list) -> list:
    tables.sort(key=lambda t: (t != "users", t))
    return tables


def _is_cockroach(cur) -> bool:
    cur.execute("SELECT version()")
    return "CockroachDB" in (cur.fetchone()[0] or "")


def _create_statements(cur, tables: list, cockroach: bool) -> dict:
    out = {}
    for t in tables:
        q = sql.Identifier(t)
        if cockroach:
            cur.execute(sql.SQL("SHOW CREATE TABLE {}").format(q))
            out[t] = cur.fetchone()[1]
        else:
            cur.execute(
                "SELECT column_name, data_type, is_nullable, column_default "
                "FROM information_schema.columns WHERE table_name = %s ORDER BY ordinal_position",
                (t,),
            )
            cols = cur.fetchall()
            cur.execute(
                "SELECT kcu.column_name FROM information_schema.table_constraints tc "
                "JOIN information_schema.key_column_usage kcu "
                "ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema "
                "WHERE tc.table_name = %s AND tc.constraint_type = 'PRIMARY KEY' "
                "ORDER BY kcu.ordinal_position",
                (t,),
            )
            pk = [r[0] for r in cur.fetchall()]
            type_map = {
                "character varying": "VARCHAR",
                "text": "TEXT",
                "integer": "INTEGER",
                "bigint": "BIGINT",
                "boolean": "BOOLEAN",
                "date": "DATE",
                "timestamp with time zone": "TIMESTAMPTZ",
                "timestamp without time zone": "TIMESTAMP",
                "jsonb": "JSONB",
                "json": "JSONB",
                "numeric": "NUMERIC",
                "double precision": "DOUBLE PRECISION",
            }
            parts = []
            for name, dtype, nullable, default in cols:
                piece = f"    {name} {type_map.get(dtype, dtype)}"
                if default is not None and "nextval" not in str(default):
                    piece += f" DEFAULT {default}"
                if nullable == "NO":
                    piece += " NOT NULL"
                parts.append(piece)
            if pk:
                parts.append("    PRIMARY KEY (" + ", ".join(pk) + ")")
            out[t] = "CREATE TABLE " + t + " (\n" + ",\n".join(parts) + "\n)"
    return out


def _adapt_value(v):
    if isinstance(v, (dict, list)):
        escaped = json.dumps(v, ensure_ascii=False).replace("'", "''")
        return AsIs("'%s'::jsonb" % escaped)
    return v


def _dump_table(cur, t: str, gz: gzip.GzipFile) -> int:
    cur.execute(sql.SQL("SELECT * FROM {}").format(sql.Identifier(t)))
    cols = [d[0] for d in cur.description]
    placeholders = sql.SQL(", ").join(sql.Placeholder() * len(cols))
    insert = sql.SQL("INSERT INTO {} ({}) VALUES ({});\n").format(
        sql.Identifier(t),
        sql.SQL(", ").join(sql.Identifier(c) for c in cols),
        placeholders,
    )
    count = 0
    while True:
        rows = cur.fetchmany(1000)
        if not rows:
            break
        for row in rows:
            gz.write(cur.mogrify(insert, [_adapt_value(v) for v in row]))
        count += len(rows)
    return count


def _dump_db() -> tuple:
    """Vuelca la base de datos a un .sql.gz en memoria.
    Devuelve (bytes, numero de tablas, filas, nombre de la base, es_cockroach)."""
    conn = None
    try:
        conn = psycopg2.connect(_dsn())
        cur = conn.cursor()
        cockroach = _is_cockroach(cur)
        dbname = conn.info.dbname or "defaultdb"
        tables = _ordered_tables(_table_names(cur))
        schemas = _create_statements(cur, tables, cockroach)

        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
            gz.write(b"-- Respaldo generado por el sistema de expedientes\n")
            gz.write(("-- Fecha: %s\n" % datetime.now().isoformat(timespec="seconds")).encode())
            gz.write(("-- Base: %s (%s)\n" % (dbname, "CockroachDB" if cockroach else "PostgreSQL")).encode())
            gz.write(b"BEGIN;\n\n")
            for t in tables:
                gz.write(("-- Tabla: %s\n%s;\n\n" % (t, schemas[t].rstrip(";"))).encode())
            gz.write(b"-- Datos\n")
            total = 0
            for t in tables:
                total += _dump_table(cur, t, gz)
                gz.write(b"\n")
            gz.write(b"COMMIT;\n")
        return buf.getvalue(), len(tables), total, dbname, cockroach
    finally:
        if conn is not None:
            conn.close()


def _prune(db, keep: int = KEEP_BACKUPS) -> int:
    old = db.query(Backup).order_by(Backup.created_at.desc(), Backup.id.desc()).offset(keep).all()
    ids = [b.id for b in old]
    if ids:
        db.query(Backup).filter(Backup.id.in_(ids)).delete(synchronize_session=False)
        db.commit()
    return len(ids)


def generate_backup() -> dict:
    blob, n_tables, n_rows, dbname, cockroach = _dump_db()
    name = "backup_%s.sql.gz" % datetime.now().strftime("%Y%m%d_%H%M%S")
    size_kb = round(len(blob) / 1024, 1)
    db = SessionLocal()
    try:
        existing = db.query(Backup).filter(Backup.name == name).first()
        if not existing:
            db.add(Backup(name=name, size_kb=size_kb, data=blob))
            db.commit()
        removed = _prune(db)
        message = "Respaldo generado: %s (%d tablas, %d filas, %.1f KB)" % (name, n_tables, n_rows, size_kb)
        if removed:
            message += " / se eliminaron %d respaldo(s) antiguo(s)" % removed
        return {"ok": True, "message": message}
    finally:
        db.close()


def list_backups() -> list:
    db = SessionLocal()
    try:
        rows = db.query(Backup).order_by(Backup.created_at.desc(), Backup.id.desc()).all()
        return [
            {
                "name": b.name,
                "size_kb": b.size_kb,
                "created_at": b.created_at.isoformat(timespec="seconds") if b.created_at else None,
            }
            for b in rows
        ]
    finally:
        db.close()


def get_backup_blob(name: str):
    if not BACKUP_RE.match(name or ""):
        return None
    db = SessionLocal()
    try:
        b = db.query(Backup).filter(Backup.name == name).first()
        return (b.name, b.data) if b else None
    finally:
        db.close()


def delete_backup(name: str) -> bool:
    if not BACKUP_RE.match(name or ""):
        return False
    db = SessionLocal()
    try:
        n = db.query(Backup).filter(Backup.name == name).delete(synchronize_session=False)
        db.commit()
        return n > 0
    finally:
        db.close()


def _today_honduras_aware() -> datetime:
    from datetime import timezone, timedelta
    return datetime.now(timezone(timedelta(hours=-6)))


def has_backup_today() -> bool:
    from datetime import timezone, timedelta
    db = SessionLocal()
    try:
        start = _today_honduras_aware().replace(hour=0, minute=0, second=0, microsecond=0)
        return db.query(Backup).filter(Backup.created_at >= start).count() > 0
    finally:
        db.close()


def ensure_todays_auto_backup() -> None:
    """Genera un respaldo si hoy (hora de Honduras) aún no existe uno."""
    if not has_backup_today():
        try:
            generate_backup()
        except Exception:
            pass


def migrate_legacy_backups() -> None:
    """Importa los respaldos .sql.gz que hubiera en backend/backups si la tabla está vacía."""
    from pathlib import Path
    legacy = Path(__file__).resolve().parent.parent / "backups"
    if not legacy.is_dir():
        return
    files = sorted(f for f in legacy.glob("backup_*.sql.gz") if BACKUP_RE.match(f.name))
    if not files:
        return
    db = SessionLocal()
    try:
        if db.query(Backup).count() > 0:
            return
        for f in files:
            try:
                data = f.read_bytes()
            except OSError:
                continue
            db.add(Backup(name=f.name, size_kb=round(len(data) / 1024, 1), data=data))
        db.commit()
    finally:
        db.close()


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
                cur.execute(
                    sql.SQL("ALTER TABLE {} ALTER COLUMN id SET DEFAULT nextval({})").format(
                        sql.Identifier(t), sql.Literal(seq)
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
