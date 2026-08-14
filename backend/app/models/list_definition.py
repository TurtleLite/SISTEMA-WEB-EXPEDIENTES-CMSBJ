from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
from app.models.user import User


class ListDefinition(Base):
    __tablename__ = "list_definitions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    columns_config = Column(JSON, nullable=False)
    is_system = Column(Boolean, default=False, server_default="false")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)

    creator = relationship("User", backref="list_definitions")
    records = relationship("ListRecord", back_populates="list_definition", cascade="all, delete-orphan")


class ListRecord(Base):
    __tablename__ = "list_records"

    id = Column(Integer, primary_key=True, index=True)
    list_definition_id = Column(Integer, ForeignKey("list_definitions.id"), nullable=False)
    data = Column(JSON, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)

    list_definition = relationship("ListDefinition", back_populates="records")
    creator = relationship("User", backref="list_records", foreign_keys=[created_by])
