from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4
import hashlib
import secrets
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    data: dict, expires_delta: Optional[timedelta] = None
) -> tuple[str, str, datetime]:
    """Devuelve (token, jti, expires_at). Cada token lleva un jti único para control de sesiones."""
    jti = uuid4().hex
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "jti": jti})
    token = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token, jti, expire


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


def create_refresh_token() -> tuple[str, str, datetime]:
    """Devuelve (refresh_token, hash_sha256, expires_at). El token se guarda SOLO como hash."""
    token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return token, token_hash, expire


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
