#!/usr/bin/env python3
"""Migra la base de datos de CockroachLabs Cloud a PostgreSQL local.

Uso (desde el directorio backend, con el venv activado):

    python migrate_cockroach_to_postgres.py \
        --source "cockroachdb://usuario:password@host:26257/defaultdb" \
        --dest   "postgresql://gestion_user:gestion_pass@localhost:5432/gestion_db"

La tabla destino se crea con los modelos del propio backend (create_all),
por lo que el esquema siempre coincide con lo que la aplicación espera.
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import create_engine, select, text

import app.models  # noqa: F401  (registra los modelos en Base.metadata)
from app.core.database import Base

# Orden de copia respetando las llaves foráneas.
TABLES_ORDER = [
    "users",
    "catalog_items",
    "list_definitions",
    "list_records",
    "reports",
    "surgery_day_lists",
    "device_registrations",
    "user_sessions",
    "notifications",
    "audit_logs",
]

BATCH_SIZE = 500


def connect(url: str, source: bool) -> "Engine":
    url = url.strip()
    if source:
        if "cockroachlabs" in url:
            from sqlalchemy.dialects import registry

            registry.register("cockroachdb", "app.core.cockroach_dialect", "CockroachDialect")
        url = url.replace("postgresql://", "cockroachdb://", 1)
    return create_engine(url, pool_pre_ping=True)


def ping(engine, label: str) -> None:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print(f"[OK] Conexión a {label}")


def copy_table(src, dst, table_name: str) -> int:
    table = Base.metadata.tables[table_name]
    total = 0
    batch = []
    with src.connect() as sconn:
        result = sconn.execute(select(table).order_by(text("id")))
        for row in result:
            batch.append(dict(row._mapping))
            if len(batch) >= BATCH_SIZE:
                with dst.begin() as dconn:
                    dconn.execute(table.insert(), batch)
                total += len(batch)
                batch = []
                print(f"  {table_name}: {total} filas...")
    if batch:
        with dst.begin() as dconn:
            dconn.execute(table.insert(), batch)
        total += len(batch)
    print(f"  {table_name}: {total} filas (completo)")
    return total


def reset_sequences(dst, table_name: str) -> None:
    """Ajusta las secuencias SERIAL al máximo id existente."""
    with dst.begin() as conn:
        conn.execute(
            text(
                f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {table_name}), 1))"
            )
        )


def main() -> int:
    ap = argparse.ArgumentParser(description="Migra datos de CockroachLabs a PostgreSQL local.")
    ap.add_argument("--source", required=True, help="URL de CockroachDB (cockroachdb:// o postgresql://)")
    ap.add_argument("--dest", required=True, help="URL de PostgreSQL destino (postgresql://...)")
    ap.add_argument(
        "--drop-dest",
        action="store_true",
        help="Elimina las tablas existentes en el destino antes de migrar (¡destructivo!)",
    )
    args = ap.parse_args()

    print("Conectando...")
    src = connect(args.source, source=True)
    dst = connect(args.dest, source=False)
    ping(src, "CockroachDB (origen)")
    ping(dst, "PostgreSQL (destino)")

    if args.drop_dest:
        print("Eliminando tablas existentes en el destino...")
        Base.metadata.drop_all(bind=dst)

    print("Creando tablas en el destino (create_all)...")
    Base.metadata.create_all(bind=dst)
    with dst.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    print("[OK] Esquema listo")

    total_general = 0
    for table_name in TABLES_ORDER:
        print(f"Copiando {table_name}...")
        try:
            total_general += copy_table(src, dst, table_name)
            reset_sequences(dst, table_name)
        except Exception as e:
            print(f"  [ERROR] falló {table_name}: {e}")
            return 1

    print(f"\nMigración completada: {total_general} filas en total.")
    return 0


if __name__ == "__main__":
    sys.exit(main())