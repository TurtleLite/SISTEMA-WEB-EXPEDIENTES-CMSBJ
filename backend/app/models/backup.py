from sqlalchemy import Column, Integer, String, Float, LargeBinary, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Backup(Base):
    __tablename__ = "backups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False, index=True)
    size_kb = Column(Float, nullable=False, default=0)
    data = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)