"""Índices para escala: aceleran búsquedas, filtros y valores distintos sobre JSON de list_records."""
import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)

# Tablas de acentos idénticas a las de record_service._apply_search (misma expresión SQL).
try:
    from app.services.record_service import _ACCENT_FROM, _ACCENT_TO
except Exception:
    _ACCENT_FROM = ""
    _ACCENT_TO = ""

# Índices compuestos (list_definition_id + campo JSON): sirven para filtros exactos
# (reportes, estatus), búsquedas con = y DISTINCT de campos (desplegables de especialidad).
EXPRESSION_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_list_records_esp ON list_records (list_definition_id, (data->>'especialidad'))",
    "CREATE INDEX IF NOT EXISTS idx_list_records_estatus ON list_records (list_definition_id, (data->>'estatus_cirugia'))",
    "CREATE INDEX IF NOT EXISTS idx_list_records_perfil ON list_records (list_definition_id, (data->>'perfil'))",
    "CREATE INDEX IF NOT EXISTS idx_list_records_criticidad ON list_records (list_definition_id, (data->>'criticidad'))",
    "CREATE INDEX IF NOT EXISTS idx_list_records_identidad ON list_records (list_definition_id, (data->>'identidad'))",
    "CREATE INDEX IF NOT EXISTS idx_list_records_expediente ON list_records (list_definition_id, (data->>'expediente'))",
    "CREATE INDEX IF NOT EXISTS idx_list_records_nombre ON list_records (list_definition_id, (data->>'nombre'))",
    "CREATE INDEX IF NOT EXISTS idx_list_records_apellido ON list_records (list_definition_id, (data->>'apellido'))",
]

# Índices antiguos (solo campo JSON, sin list_definition_id): se reemplazan por los compuestos.
LEGACY_EXPRESSION_INDEXES = [
    "idx_list_records_esp",
    "idx_list_records_estatus",
    "idx_list_records_nombre",
    "idx_list_records_apellido",
    "idx_list_records_identidad",
    "idx_list_records_expediente",
]

# Índices trigram para ILIKE '%texto%' sin acentos (misma expresión que _apply_search,
# incluyendo lower() porque .ilike() se compila como lower(col) LIKE lower(:pat)).
TRIGRAM_FIELDS = ["nombre", "apellido", "identidad", "expediente", "diagnostico"]
TRIGRAM_INDEXES = [
    f"CREATE INDEX IF NOT EXISTS idx_list_records_{f}_trgm ON list_records "
    f"USING GIN (lower(translate(data->>'{f}', '{_ACCENT_FROM}', '{_ACCENT_TO}')) gin_trgm_ops)"
    for f in TRIGRAM_FIELDS
] if _ACCENT_FROM else []

# Paginación por id descendente (scroll infinito).
LIST_ID_INDEX = "CREATE INDEX IF NOT EXISTS idx_list_records_list_id ON list_records (list_definition_id, id DESC)"

# Búsqueda general sobre el JSON completo (p. ej. operadores de contenido).
INVERTED_INDEX = "CREATE INVERTED INDEX IF NOT EXISTS idx_list_records_data ON list_records (data)"


def ensure_performance_indexes(engine) -> None:
    with engine.begin() as conn:
        for name in LEGACY_EXPRESSION_INDEXES:
            try:
                conn.execute(text(f"DROP INDEX IF EXISTS {name}"))
                logger.info(f"Índice anterior reemplazado: {name}")
            except Exception as e:
                logger.warning(f"No se pudo reemplazar índice {name}: {e}")
        for sql in EXPRESSION_INDEXES + TRIGRAM_INDEXES + [LIST_ID_INDEX, INVERTED_INDEX]:
            try:
                conn.execute(text(sql))
                logger.info(f"Índice listo: {sql.split(' ON ')[1][:80]}")
            except Exception as e:
                logger.warning(f"No se pudo crear índice ({sql[:60]}...): {e}")