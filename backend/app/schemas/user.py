from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    username: str
    telefono: str
    full_name: str
    password: str
    role: str = "medico"


class UserUpdate(BaseModel):
    username: Optional[str] = None
    telefono: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    current_password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: str
    username: str
    telefono: str
    full_name: str
    role: str
    is_active: bool
    locked_until: Optional[datetime] = None
    created_at: datetime

    @field_validator('id', mode='before')
    @classmethod
    def coerce_id(cls, v):
        return str(v)

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class DeviceInfo(BaseModel):
    id: Optional[str] = None
    status: Optional[str] = None  # pending | approved | blocked
    shared: bool = False


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: UserResponse
    device: Optional[DeviceInfo] = None
