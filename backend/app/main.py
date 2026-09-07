from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from app.api import auth, users, lists, reports, day_lists, specialties, localities, surgery_status, audit, devices, notifications, backups
from app.core.database import engine, Base, SessionLocal
from sqlalchemy import inspect, text
import logging
import app.models  # noqa: F401  (registra los modelos en Base.metadata, incluidos audit_logs y user_sessions)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
_HAS_FRONTEND = _FRONTEND_DIST.is_dir()

import fnmatch
import os
from app.core.config import settings

if not settings.SECRET_KEY or len(settings.SECRET_KEY) < 32 or settings.SECRET_KEY == "tu_clave_secreta_super_segura_cambiar_en_produccion":
    raise RuntimeError(
        "SECRET_KEY inválida o demasiado corta. Configure una variable de entorno 'SECRET_KEY' "
        "de al menos 32 caracteres (ej. en Render: Settings > Environment)."
    )

ALLOWED_ORIGINS = [
    "https://sistema-web-expedientes-cmsbj.onrender.com",
    "http://localhost:5173",
    "http://localhost:8000",
]

_EXTRA_ORIGINS = os.getenv("ALLOWED_ORIGINS", "")
for _origin in _EXTRA_ORIGINS.split(","):
    _origin = _origin.strip()
    if _origin and _origin not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(_origin)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            conn.execute(text("CREATE SEQUENCE IF NOT EXISTS expediente_seq START 1"))
            conn.commit()
        logger.info("Tablas creadas")
    except Exception as e:
        logger.warning(f"Error creando tablas: {e}")

    try:
        from app.services.backup_service import migrate_legacy_backups, ensure_todays_auto_backup
        migrate_legacy_backups()
        ensure_todays_auto_backup()
        logger.info("Respaldo automático del día asegurado")
    except Exception as e:
        logger.warning(f"No se pudo asegurar el respaldo automático: {e}")

    try:
        inspector = inspect(engine)
        if "list_definitions" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("list_definitions")]
            if "is_system" not in columns:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE list_definitions ADD COLUMN is_system BOOLEAN DEFAULT FALSE"))
                    conn.commit()
                logger.info("Added is_system column to list_definitions")
        if "list_records" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("list_records")]
            if "created_by" not in columns:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE list_records ADD COLUMN created_by INTEGER REFERENCES users(id)"))
                    conn.commit()
                logger.info("Added created_by column to list_records")
            # Migración única: json -> jsonb (si aún no lo es) para permitir índice GIN
            cols = inspector.get_columns("list_records")
            data_type = next((str(c["type"]).lower() for c in cols if c["name"] == "data"), "")
            if data_type and "jsonb" not in data_type:
                try:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE list_records ALTER COLUMN data TYPE jsonb USING data::jsonb"))
                        conn.commit()
                    logger.info("Migrated list_records.data de json a jsonb")
                except Exception as e:
                    logger.warning(f"No se pudo migrar data a jsonb: {e}")
            from app.services.db_indexes import ensure_performance_indexes
            ensure_performance_indexes(engine)
            logger.info("Índices de rendimiento asegurados")
        if "users" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("users")]
            if "email" in columns and "telefono" not in columns:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE users RENAME COLUMN email TO telefono"))
                    conn.execute(text("""
                        UPDATE users SET telefono = CASE username
                            WHEN 'admin' THEN '2201-1100'
                            WHEN 'direccion' THEN '2201-1101'
                            WHEN 'direccionmedica' THEN '2201-1102'
                            WHEN 'medico' THEN '2201-1103'
                            ELSE telefono END
                        WHERE telefono LIKE '%@%'
                    """))
                    conn.commit()
                logger.info("Renamed users.email to users.telefono")
            if "failed_attempts" not in columns:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0"))
                    conn.execute(text("ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ"))
                    conn.commit()
                logger.info("Added security columns (failed_attempts, locked_until) to users")
        if "reports" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("reports")]
            if "record_order" not in columns:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE reports ADD COLUMN record_order JSON"))
                    conn.commit()
                logger.info("Added record_order column to reports")
        if "user_sessions" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("user_sessions")]
            if "device_id" not in columns:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE user_sessions ADD COLUMN device_id VARCHAR(50)"))
                    conn.commit()
                logger.info("Added device_id column to user_sessions")
            if "refresh_hash" not in columns:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE user_sessions ADD COLUMN refresh_hash VARCHAR(64)"))
                    conn.execute(text("ALTER TABLE user_sessions ADD COLUMN refresh_expires_at TIMESTAMPTZ"))
                    conn.commit()
                logger.info("Added refresh columns to user_sessions")
        if "list_records" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("list_records")]
            if "updated_by" not in columns:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE list_records ADD COLUMN updated_by INTEGER REFERENCES users(id)"))
                    conn.commit()
                logger.info("Added updated_by column to list_records")
            if "deleted_at" not in columns:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE list_records ADD COLUMN deleted_at TIMESTAMPTZ"))
                    conn.commit()
                logger.info("Added deleted_at column to list_records (papelera)")
        if "list_definitions" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("list_definitions")]
            if "deleted_at" not in columns:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE list_definitions ADD COLUMN deleted_at TIMESTAMPTZ"))
                    conn.commit()
                logger.info("Added deleted_at column to list_definitions (papelera)")
        if "notifications" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("notifications")]
            if "target_role" not in columns:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE notifications ADD COLUMN target_role VARCHAR(30)"))
                    conn.commit()
                logger.info("Added target_role column to notifications")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(30)"))
                conn.commit()
            logger.info("Ensured users.role column is VARCHAR(30)")
    except Exception as e:
        logger.warning(f"Could not add column: {e}")

    try:
        db = SessionLocal()
        from app.services.list_service import ensure_system_lists
        ensure_system_lists(db)
        from app.models.catalog_item import CatalogItem
        from app.api.surgery_status import DEFAULT_SURGERY_STATUSES
        existing_statuses = {
            row[0] for row in db.query(CatalogItem.name).filter(CatalogItem.item_type == "estatus_cirugia").all()
        }
        for status_name in DEFAULT_SURGERY_STATUSES:
            if status_name not in existing_statuses:
                db.add(CatalogItem(item_type="estatus_cirugia", name=status_name))
        db.commit()
        from app.services.record_service import purge_trash
        purged = purge_trash(db)
        if purged:
            logger.info(f"Papelera: purgados {purged} registro(s) vencidos (TRASH_RETENTION_DAYS={settings.TRASH_RETENTION_DAYS})")
        from app.services.user_service import reset_default_users
        reset_default_users(db, only_if_empty=True)
        if settings.AUDIT_RETENTION_DAYS > 0:
            from app.services.audit_service import purge_expired_audit_logs
            purged = purge_expired_audit_logs(db)
            if purged:
                logger.info(f"Auditoría: purgados {purged} registros anteriores a {settings.AUDIT_RETENTION_DAYS} días "
                            f"(AUDIT_RETENTION_DAYS={settings.AUDIT_RETENTION_DAYS})")
        db.close()
        logger.info("Usuarios por defecto asegurados (solo si la tabla está vacía)")
    except Exception as e:
        logger.warning(f"Startup error: {e}")

    try:
        from app.services.backup_service import ensure_todays_auto_backup
        ensure_todays_auto_backup()
        logger.info("Respaldo automático del día asegurado")
    except Exception as e:
        logger.warning(f"No se pudo asegurar el respaldo automático: {e}")

    task = None
    try:
        import asyncio
        from datetime import datetime, timedelta, timezone

        async def _backup_scheduler():
            while True:
                try:
                    now = datetime.now(timezone(timedelta(hours=-6)))
                    target = now.replace(hour=0, minute=0, second=0, microsecond=0)
                    if now >= target:
                        target += timedelta(days=1)
                    await asyncio.sleep((target - now).total_seconds())
                    ensure_todays_auto_backup()
                    # Purga periódica de la papelera (respeta TRASH_RETENTION_DAYS)
                    try:
                        from app.core.database import SessionLocal
                        from app.services.record_service import purge_trash
                        db = SessionLocal()
                        try:
                            n = purge_trash(db)
                            if n:
                                logger.info(f"Papelera: purgados {n} registro(s)/lista(s) vencidos")
                        finally:
                            db.close()
                    except Exception as e:
                        logger.warning(f"No se pudo purgar la papelera: {e}")
                    # Purga periódica de auditoría (respeta AUDIT_RETENTION_DAYS)
                    try:
                        from app.core.database import SessionLocal
                        from app.services.audit_service import purge_expired_audit_logs
                        db = SessionLocal()
                        try:
                            n = purge_expired_audit_logs(db)
                            if n:
                                logger.info(f"Auditoría: purga diaria — {n} registro(s) >{settings.AUDIT_RETENTION_DAYS} días eliminados")
                        finally:
                            db.close()
                    except Exception as e:
                        logger.warning(f"No se pudo purgar la auditoría: {e}")
                except asyncio.CancelledError:
                    break
                except Exception:
                    await asyncio.sleep(3600)

        task = asyncio.create_task(_backup_scheduler())
        logger.info("Programador de respaldo diario (12:00 a. m. Honduras) iniciado")
    except Exception as e:
        logger.warning(f"No se pudo iniciar el programador de respaldos: {e}")

    yield

    if task is not None:
        try:
            task.cancel()
        except Exception:
            pass

app = FastAPI(
    title="SISTEMA DE EXPEDIENTES SBJ",
    description="Sistema de gestión de expedientes para SBJ Cirugías",
    version="1.0.0",
    lifespan=lifespan,
)

def _origin_allowed(origin: str) -> bool:
    for allowed in ALLOWED_ORIGINS:
        if fnmatch.fnmatch(origin, allowed):
            return True
    return False

def _cors_headers(origin: str) -> dict:
    if not _origin_allowed(origin):
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
    }


@app.middleware("http")
async def cors_and_logging(request: Request, call_next):
    origin = request.headers.get("origin", "")
    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    method = request.method

    if forwarded_proto == "http":
        https_url = request.url.replace(
            scheme="https",
            netloc=request.headers.get("host") or request.url.netloc,
        )
        logger.info(f"Redirecting http -> https: {request.url.path}")
        return RedirectResponse(str(https_url), status_code=307)

    if method == "OPTIONS":
        headers = _cors_headers(origin)
        if headers:
            headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
            headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Requested-With, X-Device-ID"
            headers["Access-Control-Max-Age"] = "86400"
            logger.info(f"OPTIONS {request.url.path} -> CORS preflight OK ({origin})")
        else:
            logger.info(f"OPTIONS {request.url.path} -> origin blocked ({origin})")
        return Response(headers=headers)

    logger.info(f"{method} {request.url.path}")
    try:
        response = await call_next(request)
        headers = _cors_headers(origin)
        for k, v in headers.items():
            response.headers[k] = v
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "no-referrer"
        if forwarded_proto == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
    except Exception as e:
        logger.error(f"  -> ERROR: {e}", exc_info=True)
        headers = _cors_headers(origin)
        return JSONResponse({"detail": "Error interno del servidor"}, status_code=500, headers=headers)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(lists.router)
app.include_router(reports.router)
app.include_router(day_lists.router)
app.include_router(specialties.router)
app.include_router(localities.router)
app.include_router(surgery_status.router)
app.include_router(audit.router)
app.include_router(devices.router)
app.include_router(notifications.router)
app.include_router(backups.router)


@app.middleware("http")
async def api_prefix_shim(request: Request, call_next):
    # El frontend compilado (dist) llama a la API bajo /api; aquí se quita ese prefijo.
    if request.url.path.startswith("/api"):
        stripped = request.url.path[len("/api"):]
        if not stripped.startswith("/"):
            stripped = "/" + stripped
        request.scope["path"] = stripped
        request.scope["raw_path"] = stripped.encode("utf-8")
    return await call_next(request)


@app.get("/")
def root():
    if _HAS_FRONTEND:
        index = _FRONTEND_DIST / "index.html"
        if index.is_file():
            return FileResponse(str(index), media_type="text/html")
        return {"message": "Frontend no compilado (falta frontend/dist/index.html)"}
    return {"message": "Sistema de Gestión API", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/db")
def health_db():
    from app.core.database import SessionLocal
    from sqlalchemy import inspect, text
    info = {"status": "ok"}
    try:
        db = SessionLocal()
        result = db.execute(text("SELECT 1")).scalar()
        info["ping"] = result == 1
        insp = inspect(db.get_bind())
        info["tables"] = insp.get_table_names()
        db.close()
    except Exception as e:
        info["status"] = "error"
        info["error"] = str(e)
    return info


if _HAS_FRONTEND:
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")
