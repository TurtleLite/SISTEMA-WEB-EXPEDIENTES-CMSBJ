from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base


class DeviceRegistration(Base):
    __tablename__ = "device_registrations"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(50), unique=True, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="pending", index=True)  # pending | approved | blocked
    note = Column(String(255), nullable=True)
    first_user_id = Column(Integer, nullable=True)
    first_username = Column(String(100), nullable=True)
    users_json = Column(Text, nullable=True)  # lista JSON de usuarios que lo han usado
    first_seen_at = Column(DateTime(timezone=True), server_default=func.now())
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(String(100), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    blocked_by = Column(String(100), nullable=True)
    blocked_at = Column(DateTime(timezone=True), nullable=True)