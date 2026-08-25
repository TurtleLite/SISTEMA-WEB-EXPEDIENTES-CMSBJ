from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://gestion_user:gestion_pass@localhost:5432/gestion_db"
    # Sin valor por defecto: main.py falla si no hay SECRET_KEY de al menos 32 caracteres.
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    TRASH_RETENTION_DAYS: int = 15   # días que los expedientes/lista eliminados permanecen en la papelera
    UPLOAD_DIR: str = "uploads"
    REPORTS_DIR: str = "reports"
    EXPORTS_DIR: str = "exports"
    BACKUP_DIR: str = "backups"
    # Optimización a escala: límites configurables por variable de entorno
    EXPORT_MAX_RECORDS: int = 200          # máx. expedientes por archivo Excel (una hoja por expediente)
    REPORT_MAX_RECORDS: int = 50000        # máx. filas al generar/previsualizar un reporte
    AUDIT_RETENTION_DAYS: int = 30         # días que se conservan los registros de auditoría (0 = conservar todo) — 1 mes
    # Usuarios de confianza (separados por coma): sus equipos se aprueban automáticamente al iniciar sesión
    AUTO_APPROVE_DEVICE_USERS: str = "kmejia,paola suazo,krios,ng,caportillo01"

    class Config:
        env_file = ".env"


settings = Settings()
