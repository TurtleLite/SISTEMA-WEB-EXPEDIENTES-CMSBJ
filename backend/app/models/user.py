from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.sql import func
from app.core.database import Base
import enum
from datetime import datetime


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    DIRECCION = "direccion"
    DIRECCION_MEDICA = "direccion_medica"
    MEDICO = "medico"
    CARGA_PX = "carga_px"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    telefono = Column(String(50), unique=True, nullable=False)
    full_name = Column(String(150), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default=UserRole.MEDICO.value)
    is_active = Column(Boolean, default=True)
    failed_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
