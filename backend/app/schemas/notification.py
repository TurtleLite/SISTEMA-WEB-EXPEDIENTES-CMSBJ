from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime


class NotificationCreate(BaseModel):
    title: str
    message: str
    target_user_id: Optional[str] = None  # usuario específico
    target_role: Optional[str] = None  # tipo de usuario: admin, direccion, direccion_medica, medico


class NotificationResponse(BaseModel):
    id: str
    title: str
    message: str
    sender_user_id: Optional[str] = None
    sender_username: Optional[str] = None
    target_user_id: Optional[str] = None
    target_username: Optional[str] = None
    target_role: Optional[str] = None
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime

    @field_validator("id", "sender_user_id", "target_user_id", mode="before")
    @classmethod
    def coerce_id(cls, v):
        return str(v) if v is not None else None

    class Config:
        from_attributes = True


class NotificationUnreadCount(BaseModel):
    count: int