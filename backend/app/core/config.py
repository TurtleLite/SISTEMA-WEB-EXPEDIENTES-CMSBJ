from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://gestion_user:gestion_pass@localhost:5432/gestion_db"
    SECRET_KEY: str = "tu_clave_secreta_super_segura_cambiar_en_produccion"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    UPLOAD_DIR: str = "uploads"
    REPORTS_DIR: str = "reports"
    EXPORTS_DIR: str = "exports"
    # Optimización a escala: límites configurables por variable de entorno
    EXPORT_MAX_RECORDS: int = 200          # máx. expedientes por archivo Excel (una hoja por expediente)
    REPORT_MAX_RECORDS: int = 50000        # máx. filas al generar/previsualizar un reporte
    AUDIT_RETENTION_DAYS: int = 90         # días que se conservan los registros de auditoría (0 = conservar todo)

    class Config:
        env_file = ".env"


settings = Settings()
