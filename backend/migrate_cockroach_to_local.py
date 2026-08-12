#!/usr/bin/env python3
"""Migra los datos del Sistema de Expedientes desde CockroachLabs (u otro PostgreSQL)
a la base PostgreSQL local de la mini PC.

Uso (en la mini PC, despues de instalar el paquete server-lan):
    COCKROACH_URL='postgresql://<usuario>:<clave>@<host>.<region>.<cluster>.cockroachlabs.cloud:26257/<db>?sslmode=verify-full&options=--cluster=<cluster>' \
        python migrate_cockroach_to_local.py

La URL de CockroachLabs se obtiene de la maquina actual:
    cat backend/.env        # valor de DATABASE_URL (la parte delante de cockroachdb://)
o en el dashboard de Render > expedientes-api > Environment > DATABASE_URL.

Detalles:
- Crea las tablas en la base local usando los mismos modelos (SQLAlchemy).
- Copia las filas tabla por tabla conservando los IDs y arregla las secuencias.
- NO sobreescribe datos que ya existan en destino (usa --force para reemplazar).
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(Path(__file__).resolve().parent / ".env")

import psycopg2  # noqa: E402
from psycopg2.extras import execute_values  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from app.core.database import Base  # noqa: E402
import app.models  # noqa: E402,F401  (registra todos los modelos en Base.metadata)

DEFAULT_TARGET = "postgresql://gestion_user:gestion_pass@localhost:5432/gestion_db"


def normalize(url: str) -> str:
    return url.replace("cockroachdb://", "postgresql://", 1).replace(
        "postgresql+psycopg2://", "postgresql://", 1
    )


def get_tables(cur) -> list:
    cur.execute(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
        "ORDER BY table_name"
    )
    return [r[0] for r in cur.fetchall()]


def fix_sequences(conn, cur) -> None:
    cur.execute(
        "SELECT table_name, column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' "
        "AND column_name = 'id' AND data_type IN ('integer', 'bigint')"
    )
    for table, column in cur.fetchall():
        try:
            cur.execute(
                "SELECT setval(pg_get_serial_sequence(%s, %s), COALESCE(MAX(%s), 1)) FROM %s"
                % ("'%s'" % table, "'%s'" % column, column, table)
            )
        except Exception as e:
            print(f"  [aviso] secuencia de {table}: {e}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Migra datos de CockroachLabs a PostgreSQL local")
    ap.add_argument("--source", help="URL de origen (CockroachLabs); default: COCKROACH_URL")
    ap.add_argument("--target", default=os.getenv("TARGET_URL", DEFAULT_TARGET),
                    help="URL de destino (PostgreSQL local)")
    ap.add_argument("--force", action="store_true",
                    help="Vaciar tablas del destino antes de copiar")
    args = ap.parse_args()

    source = args.source or os.getenv("COCKROACH_URL")
    if not source:
        print("ERROR: falta la URL de origen. Usa --source o la variable COCKROACH_URL.", file=sys.stderr)
        sys.exit(1)
    if "cockroachlabs" not in normalize(source) and "cockroachdb" not in normalize(source).lower():
        print("AVISO: el origen no parece CockroachLabs; continuando de todos modos.", file=sys.stderr)

    target = normalize(args.target)
    print(f"Creando tablas en el destino: {target.split('@')[1] if '@' in target else target}")
    engine = create_engine(target)
    Base.metadata.create_all(bind=engine)
    engine.dispose()

    src = psycopg2.connect(normalize(source))
    dst = psycopg2.connect(target)
    dst.autocommit = False
    try:
        with src.cursor() as s_cur, dst.cursor() as d_cur:
            d_cur.execute("SET session_replication_role = replica")
            if args.force:
                for t in reversed(get_tables(s_cur)):
                    d_cur.execute("TRUNCATE TABLE %s RESTART IDENTITY CASCADE" % t)
                    print(f"  [force] tabla {t} vaciada")
            tables = get_tables(s_cur)
            total = 0
            for t in tables:
                d_cur.execute("SELECT COUNT(*) FROM %s" % t)
                existing = d_cur.fetchone()[0]
                if existing and not args.force:
                    print(f"  {t}: omitida (ya tiene {existing} fila(s); usa --force para reemplazar)")
                    continue
                s_cur.execute("SELECT * FROM %s" % t)
                cols = [d[0] for d in s_cur.description]
                rows = s_cur.fetchall()
                if rows:
                    placeholders = "(" + ",".join(["%s"] * len(cols)) + ")"
                    execute_values(
                        d_cur,
                        "INSERT INTO %s (%s) VALUES %%s"
                        % (t, ",".join(cols)),
                        rows,
                        template=None,
                    )
                dst.commit()
                total += len(rows)
                print(f"  {t}: {len(rows)} fila(s) copiada(s)")
            d_cur.execute("SET session_replication_role = DEFAULT")
            fix_sequences(dst, d_cur)
            dst.commit()
        print(f"\nMigracion completada: {total} fila(s) copiada(s).")
        return 0
    except Exception as e:
        dst.rollback()
        print(f"ERROR durante la migracion: {e}", file=sys.stderr)
        return 1
    finally:
        src.close()
        dst.close()


if __name__ == "__main__":
    raise SystemExit(main())