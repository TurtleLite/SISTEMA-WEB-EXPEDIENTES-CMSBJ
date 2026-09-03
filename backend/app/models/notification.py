from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    sender_user_id = Column(Integer, nullable=True, index=True)
    sender_username = Column(String(50), nullable=True)
    # target_user_id: mensaje para un usuario específico
    target_user_id = Column(Integer, nullable=True, index=True)
    target_role = Column(String(30), nullable=True, index=True)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)