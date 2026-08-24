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
EXCEL_BACKUP_RE = re.compile(r"^tabla_general_\d{8}_\d{6}\.xlsx$")
BACKUP_ANY_RE = re.compile(r"^(backup_\d{8}_\d{6}\.sql\.gz|tabla_general_\d{8}_\d{6}\.xlsx)$")
KEEP_BACKUPS = 14
KEEP_EXCEL_BACKUPS = 14


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
    old = db.query(Backup).filter(Backup.name.op("~")(r"^backup_")).order_by(Backup.created_at.desc(), Backup.id.desc()).offset(keep).all()
    # Fallback si el operador ~ no está disponible (CockroachDB lo soporta, pero por si acaso filtramos en Python)
    if not old:
        all_sql = [b for b in db.query(Backup).order_by(Backup.created_at.desc(), Backup.id.desc()).all() if BACKUP_RE.match(b.name)]
        old = all_sql[keep:]
    ids = [b.id for b in old]
    if ids:
        db.query(Backup).filter(Backup.id.in_(ids)).delete(synchronize_session=False)
        db.commit()
    return len(ids)


def _prune_excel(db, keep: int = KEEP_EXCEL_BACKUPS) -> int:
    all_excel = [b for b in db.query(Backup).order_by(Backup.created_at.desc(), Backup.id.desc()).all() if EXCEL_BACKUP_RE.match(b.name)]
    old = all_excel[keep:]
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


def _generate_excel_bytes() -> tuple:
    """Genera un Excel con la tabla general de expedientes (todos los registros).
    Devuelve (bytes, count, columns)."""
    import tempfile
    import os
    from app.models.list_definition import ListDefinition, ListRecord
    from app.services.excel_service import export_to_excel

    db = SessionLocal()
    try:
        ld = db.query(ListDefinition).filter(ListDefinition.name == "Expediente Médico", ListDefinition.deleted_at.is_(None)).first()
        if not ld:
            ld = db.query(ListDefinition).filter(ListDefinition.deleted_at.is_(None)).first()
        if not ld:
            raise ValueError("No hay listas para respaldar")
        columns = [c["label"] for c in (ld.columns_config or [])]
        # Mapeo label -> key para extraer datos en el orden correcto
        label_to_key = {c["label"]: c["key"] for c in (ld.columns_config or [])}
        # Campos extra que se guardan en data pero no están en columns_config — incluirlos para no perder datos
        extra_fields = {
            "compensado": "Compensado",
            "observacion_compensado": "Observación Compensado",
            "observacion_estatus": "Observación Estatus",
            "departamento": "Departamento",
            "municipio": "Municipio",
            "localidad": "Localidad",
            "tipo_localidad": "Tipo Localidad",
        }
        # Añadir al final si no están ya
        for key, label in extra_fields.items():
            if label not in columns:
                columns.append(label)
                label_to_key[label] = key
        records = db.query(ListRecord).filter(ListRecord.list_definition_id == ld.id, ListRecord.deleted_at.is_(None)).order_by(ListRecord.id.asc()).all()
        data = []
        for r in records:
            row = {}
            for label in columns:
                key = label_to_key.get(label, label)
                row[label] = r.data.get(key, "") if isinstance(r.data, dict) else ""
            data.append(row)
        # Usar archivo temporal porque export_to_excel espera filepath
        fd, tmp_path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        try:
            export_to_excel(data, columns, tmp_path, title=f"Tabla General — {ld.name}", count=len(data), auto_width=True, fit_to_page=False)
            with open(tmp_path, "rb") as f:
                blob = f.read()
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        return blob, len(data), columns
    finally:
        db.close()


def generate_excel_backup() -> dict:
    """Genera un respaldo en Excel (tabla general) y lo guarda en la tabla backups."""
    blob, count, columns = _generate_excel_bytes()
    name = "tabla_general_%s.xlsx" % datetime.now().strftime("%Y%m%d_%H%M%S")
    size_kb = round(len(blob) / 1024, 1)
    db = SessionLocal()
    try:
        existing = db.query(Backup).filter(Backup.name == name).first()
        if not existing:
            db.add(Backup(name=name, size_kb=size_kb, data=blob))
            db.commit()
        removed = _prune_excel(db)
        message = "Tabla general generada: %s (%d registros, %d columnas, %.1f KB)" % (name, count, len(columns), size_kb)
        if removed:
            message += " / se eliminaron %d tabla(s) antigua(s)" % removed
        return {"ok": True, "message": message, "name": name, "count": count}
    finally:
        db.close()


def list_backups() -> list:
    db = SessionLocal()
    try:
        rows = db.query(Backup).order_by(Backup.created_at.desc(), Backup.id.desc()).all()
        # Solo Excel tabla_general
        rows = [b for b in rows if EXCEL_BACKUP_RE.match(b.name)]
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


def list_backups_all() -> list:
    """Lista todos los respaldos (SQL + Excel) — uso interno/legacy."""
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
    if not BACKUP_ANY_RE.match(name or ""):
        return None
    db = SessionLocal()
    try:
        b = db.query(Backup).filter(Backup.name == name).first()
        return (b.name, b.data) if b else None
    finally:
        db.close()


def delete_backup(name: str) -> bool:
    if not BACKUP_ANY_RE.match(name or ""):
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
        rows = db.query(Backup).filter(Backup.created_at >= start).all()
        return any(BACKUP_RE.match(b.name) for b in rows)
    finally:
        db.close()


def has_excel_backup_today() -> bool:
    db = SessionLocal()
    try:
        start = _today_honduras_aware().replace(hour=0, minute=0, second=0, microsecond=0)
        rows = db.query(Backup).filter(Backup.created_at >= start).all()
        return any(EXCEL_BACKUP_RE.match(b.name) for b in rows)
    finally:
        db.close()


def ensure_todays_auto_backup() -> None:
    """Genera respaldo diario solo en Excel tabla general (12am Honduras)."""
    if not has_excel_backup_today():
        try:
            generate_excel_backup()
        except Exception:
            pass


def ensure_todays_excel_backup() -> None:
    if not has_excel_backup_today():
        try:
            generate_excel_backup()
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


def restore_excel_backup(data: bytes) -> dict:
    """Restaura/importa expedientes desde un Excel tabla_general (*.xlsx).
    Lee el Excel generado por generate_excel_backup (con cabecera en fila 7, datos desde fila 8)
    o un Excel simple con cabecera en fila 1, y crea registros en Expediente Médico.
    Devuelve {ok, message, count, errors}."""
    if not data.startswith(b"PK"):
        return {"ok": False, "error": "El archivo no es un Excel válido (.xlsx)"}
    import io
    import openpyxl
    from app.models.list_definition import ListDefinition, ListRecord
    from app.services.record_service import add_record

    # Cargar workbook desde bytes
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        ws = wb.active
    except Exception as e:
        return {"ok": False, "error": f"No se pudo abrir el Excel: {e}"}

    db = SessionLocal()
    try:
        ld = db.query(ListDefinition).filter(ListDefinition.name == "Expediente Médico", ListDefinition.deleted_at.is_(None)).first()
        if not ld:
            ld = db.query(ListDefinition).filter(ListDefinition.deleted_at.is_(None)).first()
        if not ld:
            return {"ok": False, "error": "No hay lista de expedientes para importar"}
        # Mapa label -> key (incluye campos extra de respaldo completo)
        label_to_key = {c["label"]: c["key"] for c in (ld.columns_config or [])}
        extra_fields = {
            "compensado": "Compensado",
            "observacion_compensado": "Observación Compensado",
            "observacion_estatus": "Observación Estatus",
            "departamento": "Departamento",
            "municipio": "Municipio",
            "localidad": "Localidad",
            "tipo_localidad": "Tipo Localidad",
        }
        for k, lbl in extra_fields.items():
            if lbl not in label_to_key:
                label_to_key[lbl] = k
        # Normalizar labels para búsqueda insensible a mayúsculas/espacios
        norm_label = {k.lower().strip(): k for k in label_to_key.keys()}
        # También mapear key -> label inverso para detectar header por key
        # Buscar fila de cabecera: debe contener al menos 3 labels conocidos
        header_idx = None
        header_map = {}  # col_idx -> key
        expected_labels = set(label_to_key.keys())
        # También aceptar keys como header (por compatibilidad)
        expected_keys = set(label_to_key.values())
        max_scan = min(10, ws.max_row)
        for r_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
            if r_idx > max_scan:
                break
            if not row:
                continue
            vals = [str(v).strip() if v is not None else "" for v in row]
            # ¿Cuántos valores coinciden con labels?
            matches = sum(1 for v in vals if v in expected_labels)
            matches_key = sum(1 for v in vals if v.lower().strip() in norm_label or v in expected_keys)
            if matches >= 3 or matches_key >= 3:
                header_idx = r_idx
                # Construir mapa col -> key
                for c_idx, val in enumerate(vals):
                    if not val:
                        continue
                    # Probar label exacto
                    if val in label_to_key:
                        header_map[c_idx] = label_to_key[val]
                    elif val.lower().strip() in norm_label:
                        key = norm_label[val.lower().strip()]
                        header_map[c_idx] = label_to_key[key]
                    elif val in expected_keys:
                        header_map[c_idx] = val
                    elif val.lower().strip() in expected_keys:
                        header_map[c_idx] = val.lower().strip()
                break
        if header_idx is None:
            return {"ok": False, "error": "No se encontró la fila de cabecera en el Excel (¿formato incorrecto?)"}
        if not header_map:
            return {"ok": False, "error": "Cabecera sin columnas reconocibles"}

        count = 0
        errors = []
        # Iterar filas de datos después de la cabecera
        for r_idx, row in enumerate(ws.iter_rows(values_only=True, min_row=header_idx + 1), start=header_idx + 1):
            if not row or all(v is None or str(v).strip() == "" for v in row):
                continue
            data_row = {}
            for c_idx, cell_val in enumerate(row):
                key = header_map.get(c_idx)
                if not key:
                    continue
                if cell_val is None:
                    continue
                # Limpiar valor: si es datetime, convertir a ISO
                import datetime as dt
                if isinstance(cell_val, dt.datetime):
                    cell_val = cell_val.date().isoformat()
                elif isinstance(cell_val, dt.date):
                    cell_val = cell_val.isoformat()
                else:
                    cell_val = str(cell_val).strip()
                    if cell_val == "":
                        continue
                data_row[key] = cell_val
            if not data_row:
                continue
            # Validar mínimo: debe tener al menos nombre o expediente
            if not data_row.get("expediente") and not data_row.get("nombre") and not data_row.get("identidad"):
                errors.append(f"Fila {r_idx}: sin datos identificables, omitida")
                continue
            try:
                # add_record maneja expediente duplicado, validaciones, domicilio, etc.
                # Si no hay expediente, add_record lo exigirá; intentar generar uno si falta
                # Para importación masiva, si falta expediente, omitir fila
                if not str(data_row.get("expediente", "")).strip():
                    # Intentar usar fila como expediente si no existe -> error controlado
                    raise ValueError("Falta número de expediente")
                add_record(db, ld.id, data_row, user_id=None)
                count += 1
            except Exception as e:
                # Extraer mensaje limpio
                msg = str(e)
                # Si es HTTPException, tomar detail
                try:
                    from fastapi import HTTPException
                    if isinstance(e, HTTPException):
                        msg = e.detail if isinstance(e.detail, str) else str(e.detail)
                except Exception:
                    pass
                errors.append(f"Fila {r_idx}: {msg}")
                # Continuar con siguientes filas
                continue
        wb.close()
        if count == 0 and errors:
            return {"ok": False, "error": f"No se importó ningún registro. Errores: {'; '.join(errors[:3])}", "count": 0, "errors": errors}
        msg = f"Importados {count} expediente(s) desde Excel"
        if errors:
            msg += f" ({len(errors)} fila(s) con errores)"
        return {"ok": True, "message": msg, "count": count, "errors": errors}
    finally:
        db.close()


def restore_backup(data: bytes) -> dict:
    """Restaura la base de datos a partir de un respaldo .sql.gz o importa desde .xlsx tabla general.
    Detecta por magic bytes: PK -> Excel, 1f8b -> gzip SQL."""
    if data.startswith(b"PK"):
        return restore_excel_backup(data)
    if not data.startswith(b"\x1f\x8b"):
        return {"ok": False, "error": "El archivo no es un respaldo válido (.sql.gz o .xlsx tabla general)"}
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
