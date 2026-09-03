"""
Ingestion directa de expedientes al sistema web (SISTEMA-WEB-EXPEDIENTES-CMSBJ).

Requisitos: el backend debe poder conectar a la BD (variable DATABASE_URL en backend/.env)
y las tablas deben existir (alembic/creacion). Ejecutar desde la carpeta backend:

    python ingresar_expedientes.py

Qué hace:
  - Crea la lista sistema "Expediente Médico" si no existe.
  - Lee expedientes_para_ingestar.json (generado por build_import.py).
  - Por cada registro: criticidad="Media", compensado="Sí", y OMITE cirujano/fecha_cirugia.
  - Usa add_record() (valida edad/fecha y resuelve copias de expediente).
"""
import os, sys, json

BACKEND = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND)

from app.core.database import SessionLocal
from app.services.record_service import add_record, _is_expediente_list
from app.services.list_service import create_list_definition
from app.schemas.list_definition import ListDefinitionCreate
from app.services.expediente_service import EXPEDIENTE_COLUMNS, create_expediente_template

JSON_PATH = os.path.join(os.path.dirname(BACKEND), "Documentos", "Banco de Pacientes",
                         "SIN OPERAR", "expedientes_para_ingestar.json")

def get_or_create_expediente_list(db):
    ld = db.query(__import__("app.models.list_definition", fromlist=["ListDefinition"]).ListDefinition)\
           .filter_by(name="Expediente Médico", deleted_at=None).first()
    if ld:
        return ld
    # crear con un usuario admin si existe, si no con created_by=1
    uid = db.query(__import__("app.models.user", fromlist=["User"]).User).first()
    user_id = uid.id if uid else 1
    return create_expediente_template(db, user_id)

def main():
    if not os.path.exists(JSON_PATH):
        print("No encontré", JSON_PATH); sys.exit(1)
    registros = json.load(open(JSON_PATH, encoding="utf-8"))
    db = SessionLocal()
    try:
        ld = get_or_create_expediente_list(db)
        list_id = ld.id
        print("Lista 'Expediente Médico' id =", list_id)
        ok = 0; fallos = []
        for r in registros:
            data = {k: v for k, v in r.items() if k != "_compensado"}
            data["criticidad"] = "Media"
            data["compensado"] = "Sí"          # no es columna del formulario; se guarda en data
            # No incluimos cirujano ni fecha_cirugia (se llenan a lápiz en físico)
            data.pop("cirujano", None)
            data.pop("fecha_cirugia", None)
            try:
                add_record(db, list_id, data, user_id=None)
                ok += 1
            except Exception as e:
                fallos.append((r.get("nombre"), r.get("apellido"), str(e)))
        print(f"Insertados: {ok}/{len(registros)}")
        for f in fallos[:20]:
            print("  FALLO", f)
    finally:
        db.close()

if __name__ == "__main__":
    main()
