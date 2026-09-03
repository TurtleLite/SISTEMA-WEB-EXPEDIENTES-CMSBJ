from sqlalchemy.orm import Session
from sqlalchemy import or_, func, text, literal_column
from app.models.list_definition import ListRecord, ListDefinition
from app.core.config import settings
from typing import Optional
import unicodedata
import re

_EXPEDIENTE_LIST_NAME = "Expediente Médico"
_EXPEDIENTE_SEQUENCE = "expediente_seq"


def _not_deleted(query):
    return query.filter(ListRecord.deleted_at.is_(None))


def _validate_dates(data: dict):
    """Rechaza fechas imposibles en el expediente: elaboración futura o demasiado antigua,
    y edades fuera de rango (0-120 años)."""
    from fastapi import HTTPException
    from datetime import date, datetime, timezone, timedelta

    hoy = datetime.now(timezone(timedelta(hours=-6))).date()

    fecha_raw = str(data.get("fecha_elaboracion", "") or "").strip()
    if fecha_raw:
        try:
            f = date.fromisoformat(fecha_raw[:10])
        except ValueError:
            raise HTTPException(status_code=400, detail="La fecha de elaboración no es válida (formato AAAA-MM-DD)")
        if f > hoy:
            raise HTTPException(status_code=400, detail="La fecha de elaboración no puede ser posterior a hoy")
        if f < date(1950, 1, 1):
            raise HTTPException(status_code=400, detail="La fecha de elaboración es demasiado antigua (antes de 1950)")

    edad_raw = str(data.get("edad", "") or "").strip()
    if edad_raw:
        m = re.match(r"^\s*(\d{1,3})\s*([am]?)\s*$", edad_raw)
        if m:
            n = int(m.group(1))
            unidad = m.group(2) or "a"
            if unidad == "m":
                if n < 0 or n > 12:
                    raise HTTPException(status_code=400, detail="Edad en meses inválida (debe ser 0-12)")
            else:
                if n > 120:
                    raise HTTPException(status_code=400, detail="La edad no puede ser mayor de 120 años")
                if n == 0:
                    raise HTTPException(status_code=400, detail="La edad no puede ser 0 años")


def _validate_compensado(data: dict):
    """Rechaza expedientes descompensados sin la observación obligatoria."""
    from fastapi import HTTPException
    if str(data.get("compensado", "") or "").strip() == "No":
        if not str(data.get("observacion_compensado", "") or "").strip():
            raise HTTPException(
                status_code=400,
                detail="Debe escribir la observación porque el paciente no está compensado",
            )


def _is_expediente_list(db: Session, list_id: int) -> bool:
    ld = db.query(ListDefinition).filter(ListDefinition.id == list_id).first()
    return bool(ld and ld.name == _EXPEDIENTE_LIST_NAME)


def copias_de_numero(db: Session, numero: str, exclude_record_id: int = None) -> int:
    """Cuenta expedientes con el mismo número base usando índices (igualdad + prefijo),
    sin cargar toda la lista en memoria. Si se indica exclude_record_id, no cuenta ese registro
    (útil al editar el propio expediente)."""
    numero = str(numero or "").strip()
    if not numero:
        return 0
    ld = db.query(ListDefinition).filter(ListDefinition.name == _EXPEDIENTE_LIST_NAME).first()
    if not ld:
        return 0
    escaped = numero.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    field = ListRecord.data.op("->>")("expediente")
    query = db.query(func.count(ListRecord.id)).filter(
        ListRecord.list_definition_id == ld.id,
        ListRecord.deleted_at.is_(None),
        or_(field == numero, field.like(f"{escaped} (%)", escape="\\")),
    )
    if exclude_record_id:
        query = query.filter(ListRecord.id != exclude_record_id)
    return query.scalar() or 0


def numero_expediente_final(db: Session, numero: str, exclude_record_id: int = None) -> str:
    """Devuelve el número tal como se guarda: base si es el primero, base (n) si ya existe.
    Al editar (exclude_record_id) el propio registro no cuenta para evitar auto-renumerarse."""
    numero = str(numero or "").strip()
    if not numero:
        return ""
    count = copias_de_numero(db, numero, exclude_record_id=exclude_record_id)
    return f"{numero} ({count})" if count else numero


def renumber_expedientes(db: Session):
    ld = db.query(ListDefinition).filter(ListDefinition.name == _EXPEDIENTE_LIST_NAME).first()
    if not ld:
        return 0
    db.execute(text(f"CREATE SEQUENCE IF NOT EXISTS {_EXPEDIENTE_SEQUENCE} START 1"))
    records = (
        db.query(ListRecord)
        .filter(ListRecord.list_definition_id == ld.id, ListRecord.deleted_at.is_(None))
        .order_by(ListRecord.id.asc())
        .all()
    )
    for i, record in enumerate(records, start=1):
        data = dict(record.data)
        data["expediente"] = str(i)
        record.data = data
    db.commit()
    db.execute(
        text(f"SELECT setval('{_EXPEDIENTE_SEQUENCE}', :next_value, false)"),
        {"next_value": len(records) + 1},
    )
    db.commit()
    return len(records)

_SEARCH_FIELDS = ["nombre", "apellido", "identidad", "expediente", "diagnostico", "especialidad", "perfil"]

_ACCENT_MAP = {
    "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a",
    "è": "e", "é": "e", "ê": "e", "ë": "e",
    "ì": "i", "í": "i", "î": "i", "ï": "i",
    "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o",
    "ù": "u", "ú": "u", "û": "u", "ü": "u",
    "ñ": "n", "ç": "c", "ý": "y", "ÿ": "y",
    "À": "A", "Á": "A", "Â": "A", "Ã": "A", "Ä": "A", "Å": "A",
    "È": "E", "É": "E", "Ê": "E", "Ë": "E",
    "Ì": "I", "Í": "I", "Î": "I", "Ï": "I",
    "Ò": "O", "Ó": "O", "Ô": "O", "Õ": "O", "Ö": "O",
    "Ù": "U", "Ú": "U", "Û": "U", "Ü": "U",
    "Ñ": "N", "Ç": "C", "Ý": "Y", "Ÿ": "Y",
}
_ACCENT_FROM = "".join(_ACCENT_MAP.keys())
_ACCENT_TO = "".join(_ACCENT_MAP.values())
assert len(_ACCENT_FROM) == len(_ACCENT_TO)


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))


def _apply_search(query, search: Optional[str], search_field: Optional[str]):
    if not search:
        return query
    pattern = f"%{_strip_accents(search)}%"
    fields = [search_field] if search_field else _SEARCH_FIELDS
    from_chars = literal_column(f"'{_ACCENT_FROM}'")
    to_chars = literal_column(f"'{_ACCENT_TO}'")

    def _field_expr(field: str):
        return func.translate(
            ListRecord.data.op("->>")(field),
            from_chars,
            to_chars,
        )

    clauses = [_field_expr(field).ilike(pattern) for field in fields]
    # Búsqueda de nombre completo: al escribir "nombre apellidos" juntos debe
    # encontrar aunque estén en campos separados. Solo aplica a campos de nombre.
    if search_field is None or search_field in ("nombre", "apellido"):
        full_name = func.concat(
            func.coalesce(_field_expr("nombre"), literal_column("''")),
            literal_column("' '"),
            func.coalesce(_field_expr("apellido"), literal_column("''")),
        )
        clauses.append(full_name.ilike(pattern))
    return query.filter(or_(*clauses))


def _compose_domicilio(data: dict) -> dict:
    """Componer el campo 'domicilio' a partir de departamento/municipio/localidad."""
    dept = str(data.get("departamento", "") or "").strip()
    mun = str(data.get("municipio", "") or "").strip()
    loc = str(data.get("localidad", "") or "").strip()
    tipo = str(data.get("tipo_localidad", "") or "").strip()
    if not any([dept, mun, loc]):
        return data
    parts = []
    if loc:
        parts.append(f"{loc} ({tipo})" if tipo else loc)
    if mun:
        parts.append(mun)
    if dept:
        parts.append(dept)
    if parts:
        data["domicilio"] = ", ".join(parts)
    return data


def add_record(db: Session, list_id: int, data: dict, user_id: int = None) -> ListRecord:
    if _is_expediente_list(db, list_id):
        data = dict(data)
        _validate_dates(data)
        _validate_compensado(data)
        data = _compose_domicilio(data)
        numero = re.sub(r"\D", "", str(data.get("expediente", "") or ""))
        if not numero:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="El número de expediente es obligatorio: regístrelo manualmente")
        data["expediente"] = numero_expediente_final(db, numero)
        # Estatus por defecto "En espera" si está ausente o vacío (no solo si falta la clave)
        if not str(data.get("estatus_cirugia", "") or "").strip():
            data["estatus_cirugia"] = "En espera"
    record = ListRecord(list_definition_id=list_id, data=data, created_by=user_id, updated_by=user_id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def count_records(db: Session, list_id: int) -> int:
    return db.query(ListRecord).filter(ListRecord.list_definition_id == list_id, ListRecord.deleted_at.is_(None)).count()


def get_records(db: Session, list_id: int, skip: int = 0, limit: int = 1000,
                search: Optional[str] = None, search_field: Optional[str] = None) -> list[ListRecord]:
    query = _not_deleted(db.query(ListRecord).filter(ListRecord.list_definition_id == list_id))
    query = _apply_search(query, search, search_field)
    return query.order_by(ListRecord.id.desc()).offset(skip).limit(limit).all()


def paginate_records(db: Session, list_id: int, search: Optional[str] = None,
                     search_field: Optional[str] = None, page: int = 1,
                     page_size: int = 50, exclude_statuses: Optional[list] = None,
                     waiting_only: bool = False,
                     estatus_cirugia: Optional[str] = None,
                     compensado: Optional[str] = None,
                     diagnostico: Optional[str] = None) -> tuple[list[ListRecord], int]:
    query = _not_deleted(db.query(ListRecord).filter(ListRecord.list_definition_id == list_id))
    query = _apply_search(query, search, search_field)
    if estatus_cirugia:
        query = query.filter(ListRecord.data.op("->>")("estatus_cirugia") == estatus_cirugia)
    if compensado:
        query = query.filter(ListRecord.data.op("->>")("compensado") == compensado)
    if diagnostico:
        query = query.filter(ListRecord.data.op("->>")("diagnostico").ilike(f"%{diagnostico}%"))
    if exclude_statuses:
        statuses = [s for s in exclude_statuses if s]
        if statuses:
            st = ListRecord.data.op("->>")("estatus_cirugia")
            query = query.filter(~st.in_(statuses))
    if waiting_only:
        st = ListRecord.data.op("->>")("estatus_cirugia")
        query = query.filter(or_(st.is_(None), st == "En espera"))
    total = query.count()
    items = (
        query.order_by(ListRecord.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return items, total


def get_record(db: Session, record_id: int) -> ListRecord:
    record = db.query(ListRecord).filter(ListRecord.id == record_id, ListRecord.deleted_at.is_(None)).first()
    if not record:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return record


def _updated_at_iso(record: ListRecord) -> str:
    return record.updated_at.isoformat() if record.updated_at else None


def update_record(db: Session, record_id: int, data: dict, user_id: int = None, user_role: str = None,
                  expected_updated_at: str = None) -> ListRecord:
    from datetime import datetime, timezone
    record = db.query(ListRecord).filter(ListRecord.id == record_id, ListRecord.deleted_at.is_(None)).first()
    if not record:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    # Bloqueo optimista: si otro usuario editó mientras tanto, exigir decisión explícita.
    if expected_updated_at:
        try:
            expected = datetime.fromisoformat(expected_updated_at.replace("Z", "+00:00"))
            if expected.tzinfo is None:
                expected = expected.replace(tzinfo=timezone.utc)
            current = record.updated_at
            if current is not None:
                if current.tzinfo is None:
                    current = current.replace(tzinfo=timezone.utc)
                if abs((current - expected).total_seconds()) > 1.0:
                    from fastapi import HTTPException
                    owner = None
                    if record.updated_by:
                        from app.models.user import User
                        owner = db.query(User).filter(User.id == record.updated_by).first()
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "message": "Este expediente fue modificado por otra persona mientras lo editaba.",
                            "current_updated_at": _updated_at_iso(record),
                            "updated_by_name": (owner.full_name if owner else None),
                        },
                    )
        except ValueError:
            pass
    if user_role in ("direccion", "direccion_medica"):
        pass
    elif user_role == "medico":
        if record.created_by != user_id:
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="No puedes editar un expediente creado por otro médico")
        data = dict(data)
        old_status = record.data.get("estatus_cirugia", "En espera")
        old_obs = record.data.get("observacion_estatus", "")
        if data.get("estatus_cirugia") not in (None, old_status) or data.get("observacion_estatus") not in (None, old_obs):
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="No puedes cambiar el estatus de cirugía ni su observación")
        data["estatus_cirugia"] = old_status
    elif user_role == "carga_px":
        if record.created_by != user_id:
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="No puedes editar un expediente creado por otro usuario")
        data = dict(data)
        old_status = record.data.get("estatus_cirugia", "En espera")
        old_obs = record.data.get("observacion_estatus", "")
        if data.get("estatus_cirugia") not in (None, old_status) or data.get("observacion_estatus") not in (None, old_obs):
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="No puedes cambiar el estatus de cirugía ni su observación")
        data["estatus_cirugia"] = old_status
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Acción no permitida")
    if _is_expediente_list(db, record.list_definition_id):
        data = dict(data)
        _validate_dates(data)
        _validate_compensado(data)
        data = _compose_domicilio(data)
        # Permitir editar el número de expediente con la misma lógica de duplicados
        # que al crearlo, excluyendo el registro actual para no auto-renumerarse.
        actual = str(record.data.get("expediente", "") or "").strip()
        base_digits_actual = re.sub(r"\D", "", actual)
        nuevo_numero = str(data.get("expediente", "") or "").strip()
        numero = re.sub(r"\D", "", nuevo_numero)
        if not numero:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="El número de expediente es obligatorio: regístrelo manualmente")
        if numero == base_digits_actual:
            data["expediente"] = actual
        else:
            data["expediente"] = numero_expediente_final(db, numero, exclude_record_id=record.id)
    record.data = data
    record.updated_by = user_id
    db.commit()
    db.refresh(record)
    return record


def delete_record(db: Session, record_id: int, user_id: int = None, user_role: str = None):
    """Soft delete: mueve el expediente a la papelera (restaurable por TRASH_RETENTION_DAYS días)."""
    from datetime import datetime, timezone
    from fastapi import HTTPException
    try:
        record_id = int(record_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    record = db.query(ListRecord).filter(ListRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    if user_role in ("direccion", "direccion_medica"):
        pass
    elif user_role == "carga_px":
        if record.created_by != user_id:
            raise HTTPException(status_code=403, detail="Carga Px solo puede eliminar sus propios expedientes")
    else:
        role_name = {"admin": "Administrador", "direccion": "Dirección", "direccion_medica": "Dirección Médica", "medico": "Médico", "carga_px": "Carga Px", "oftalmologia": "Oftalmología"}
        raise HTTPException(status_code=403, detail=f"{role_name.get(user_role, 'Usuario')} no puede eliminar este registro")
    if not record.deleted_at:
        record.deleted_at = datetime.now(timezone.utc)
        db.commit()


def restore_record(db: Session, record_id: int, user_id: int = None, user_role: str = None) -> ListRecord:
    from fastapi import HTTPException
    try:
        record_id = int(record_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    record = db.query(ListRecord).filter(ListRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    if user_role not in ("direccion", "direccion_medica"):
        raise HTTPException(status_code=403, detail="No tienes permisos para restaurar registros")
    if record.deleted_at:
        record.deleted_at = None
        record.updated_by = user_id
        db.commit()
    return record


def get_trashed_records(db: Session, list_id: int) -> list[ListRecord]:
    return (
        db.query(ListRecord)
        .filter(ListRecord.list_definition_id == list_id, ListRecord.deleted_at.isnot(None))
        .order_by(ListRecord.deleted_at.desc())
        .all()
    )


def purge_trash(db: Session) -> int:
    """Elimina físicamente expedientes y listas con más de TRASH_RETENTION_DAYS días en la papelera."""
    from datetime import datetime, timedelta, timezone
    from app.models.list_definition import ListDefinition
    if settings.TRASH_RETENTION_DAYS <= 0:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.TRASH_RETENTION_DAYS)
    expired = (
        db.query(ListRecord)
        .filter(ListRecord.deleted_at.isnot(None), ListRecord.deleted_at < cutoff)
        .delete(synchronize_session=False)
    )
    expired_lists = (
        db.query(ListDefinition)
        .filter(ListDefinition.deleted_at.isnot(None), ListDefinition.deleted_at < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    return expired + expired_lists


def get_records_by_ids(db: Session, ids: list[int]) -> list[ListRecord]:
    parsed = []
    for x in ids:
        try:
            parsed.append(int(x))
        except (TypeError, ValueError):
            continue
    if not parsed:
        return []
    return _not_deleted(db.query(ListRecord).filter(ListRecord.id.in_(parsed))).all()


def get_distinct_field_values(db: Session, list_id: int, field: str) -> list:
    import re
    if not re.match(r'^[a-zA-Z0-9_]+$', field):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Nombre de campo inválido")
    from sqlalchemy import text
    sql = text(f"SELECT DISTINCT data->>'{field}' AS val FROM list_records WHERE list_definition_id = :lid AND data->>'{field}' IS NOT NULL AND data->>'{field}' != '' ORDER BY val")
    result = db.execute(sql, {"lid": list_id})
    return [row[0] for row in result]
