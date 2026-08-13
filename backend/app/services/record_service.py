from sqlalchemy.orm import Session
from sqlalchemy import or_, func, text
from app.models.list_definition import ListRecord, ListDefinition
from typing import Optional
import unicodedata
import re

_EXPEDIENTE_LIST_NAME = "Expediente Médico"
_EXPEDIENTE_SEQUENCE = "expediente_seq"


def _is_expediente_list(db: Session, list_id: int) -> bool:
    ld = db.query(ListDefinition).filter(ListDefinition.id == list_id).first()
    return bool(ld and ld.name == _EXPEDIENTE_LIST_NAME)


def _expediente_base(value: str) -> str:
    """Devuelve el número base (sin el sufijo de copia entre paréntesis)."""
    v = str(value or "").strip()
    if "(" in v:
        v = v.split("(", 1)[0].strip()
    return v


def _numeros_expediente(db: Session) -> list[str]:
    ld = db.query(ListDefinition).filter(ListDefinition.name == _EXPEDIENTE_LIST_NAME).first()
    if not ld:
        return []
    rows = db.query(ListRecord.data.op("->>")("expediente")).filter(
        ListRecord.list_definition_id == ld.id,
    ).all()
    return [str(r[0] or "").strip() for r in rows]


def copias_de_numero(db: Session, numero: str) -> int:
    """Cuenta cuántos expedientes existen con el mismo número base."""
    numero = str(numero or "").strip()
    if not numero:
        return 0
    return sum(1 for v in _numeros_expediente(db) if _expediente_base(v) == numero)


def numero_expediente_final(db: Session, numero: str) -> str:
    """Devuelve el número tal como se guarda: base si es el primero, base (n) si ya existe."""
    numero = str(numero or "").strip()
    if not numero:
        return ""
    count = copias_de_numero(db, numero)
    return f"{numero} ({count})" if count else numero


def renumber_expedientes(db: Session):
    ld = db.query(ListDefinition).filter(ListDefinition.name == _EXPEDIENTE_LIST_NAME).first()
    if not ld:
        return 0
    db.execute(text(f"CREATE SEQUENCE IF NOT EXISTS {_EXPEDIENTE_SEQUENCE} START 1"))
    records = (
        db.query(ListRecord)
        .filter(ListRecord.list_definition_id == ld.id)
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
    clauses = [
        func.translate(ListRecord.data.op("->>")(field), _ACCENT_FROM, _ACCENT_TO).ilike(pattern)
        for field in fields
    ]
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
        data = _compose_domicilio(data)
        numero = re.sub(r"\D", "", str(data.get("expediente", "") or ""))
        if not numero:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="El número de expediente es obligatorio: regístrelo manualmente")
        data["expediente"] = numero_expediente_final(db, numero)
        data.setdefault("estatus_cirugia", "En espera")
    record = ListRecord(list_definition_id=list_id, data=data, created_by=user_id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def count_records(db: Session, list_id: int) -> int:
    return db.query(ListRecord).filter(ListRecord.list_definition_id == list_id).count()


def get_records(db: Session, list_id: int, skip: int = 0, limit: int = 1000,
                search: Optional[str] = None, search_field: Optional[str] = None) -> list[ListRecord]:
    query = db.query(ListRecord).filter(ListRecord.list_definition_id == list_id)
    query = _apply_search(query, search, search_field)
    return query.order_by(ListRecord.id.desc()).offset(skip).limit(limit).all()


def paginate_records(db: Session, list_id: int, search: Optional[str] = None,
                     search_field: Optional[str] = None, page: int = 1,
                     page_size: int = 50, exclude_statuses: Optional[list] = None,
                     waiting_only: bool = False,
                     estatus_cirugia: Optional[str] = None) -> tuple[list[ListRecord], int]:
    query = db.query(ListRecord).filter(ListRecord.list_definition_id == list_id)
    query = _apply_search(query, search, search_field)
    if estatus_cirugia:
        query = query.filter(ListRecord.data.op("->>")("estatus_cirugia") == estatus_cirugia)
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
    record = db.query(ListRecord).filter(ListRecord.id == record_id).first()
    if not record:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return record


def update_record(db: Session, record_id: int, data: dict, user_id: int = None, user_role: str = None) -> ListRecord:
    record = db.query(ListRecord).filter(ListRecord.id == record_id).first()
    if not record:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Registro no encontrado")
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
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Acción no permitida")
    if _is_expediente_list(db, record.list_definition_id):
        data = dict(data)
        data = _compose_domicilio(data)
        data["expediente"] = record.data.get("expediente")
    record.data = data
    db.commit()
    db.refresh(record)
    return record


def delete_record(db: Session, record_id: int, user_id: int = None, user_role: str = None):
    record = db.query(ListRecord).filter(ListRecord.id == record_id).first()
    if not record:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    if user_role in ("direccion", "direccion_medica"):
        pass
    else:
        from fastapi import HTTPException
        role_name = {"admin": "Administrador", "direccion": "Dirección", "direccion_medica": "Dirección Médica", "medico": "Médico"}
        raise HTTPException(status_code=403, detail=f"{role_name.get(user_role, 'Usuario')} no puede eliminar este registro")
    db.delete(record)
    db.commit()


def get_records_by_ids(db: Session, ids: list[int]) -> list[ListRecord]:
    return db.query(ListRecord).filter(ListRecord.id.in_(ids)).all()


def get_distinct_field_values(db: Session, list_id: int, field: str) -> list:
    import re
    if not re.match(r'^[a-zA-Z0-9_]+$', field):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Nombre de campo inválido")
    from sqlalchemy import text
    sql = text(f"SELECT DISTINCT data->>'{field}' AS val FROM list_records WHERE list_definition_id = :lid AND data->>'{field}' IS NOT NULL AND data->>'{field}' != '' ORDER BY val")
    result = db.execute(sql, {"lid": list_id})
    return [row[0] for row in result]
