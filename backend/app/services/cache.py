"""
Cache simple en memoria para CMSBJ.

Se usa para almacenar resultados de consultas que son frecuentes y poco cambiantes:
- Catálogos (especialidades, localidades, estatus de cirugía)
- Listas (metadatos)
- Conteos de registros por lista
- Valores distintos de campos (para los desplegables de filtro)

La cache se invalida explícitamente cuando se modifican los datos subyacentes
(operaciones POST/PUT/DELETE en los endpoints correspondientes).

Dado que uvicorn puede correr con múltiples workers (procesos separados),
cada worker tiene su propia instancia de cache. Esto significa que la primera
petición de cada worker tendrá un miss y cargará desde la BD, pero las subsiguientes
peticiones dentro de ese worker estarán cacheadas.

Para un deployment con muchos workers, esto está bien para catálogos porque:
1. Los datos son los mismos en todos los workers
2. La invalidación ocurre en todos los workers simultáneamente
   (porque cada worker ejecuta la misma operación de escritura)
3. El "cold start" de cada worker es aceptable porque los catálogos son
   relativamente pequeños y se cargan una sola vez por worker.
"""

import functools
import logging
import time
from threading import Lock
from typing import Any, Callable, Dict, Optional, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# TTL por defecto en segundos
DEFAULT_TTL = 300  # 5 minutos para catálogos
COUNT_TTL = 60  # 1 minuto para conteos


class CacheEntry:
    __slots__ = ("value", "expires_at")

    def __init__(self, value: Any, ttl: float):
        self.value = value
        self.expires_at = time.monotonic() + ttl

    @property
    def is_expired(self) -> bool:
        return time.monotonic() >= self.expires_at


class SimpleCache:
    """
    Cache en memoria con TTL. Thread-safe para uso dentro de un solo proceso.

    Nota: con múltiples workers de uvicorn, cada worker tiene su propia instancia
    de esta clase (porque son procesos separados). No hay sincronización entre workers.
    """

    def __init__(self, default_ttl: float = DEFAULT_TTL):
        self._store: Dict[str, CacheEntry] = {}
        self._lock = Lock()
        self._default_ttl = default_ttl
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                self._misses += 1
                return None
            if entry.is_expired:
                del self._store[key]
                self._misses += 1
                return None
            self._hits += 1
            return entry.value

    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        with self._lock:
            if ttl is None:
                ttl = self._default_ttl
            self._store[key] = CacheEntry(value, ttl)

    def invalidate(self, key: str) -> bool:
        with self._lock:
            if key in self._store:
                del self._store[key]
                return True
            return False

    def invalidate_prefix(self, prefix: str) -> int:
        """Invalida todas las claves que empiezan con el prefijo dado."""
        with self._lock:
            keys_to_delete = [k for k in self._store if k.startswith(prefix)]
            for k in keys_to_delete:
                del self._store[k]
            return len(keys_to_delete)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    @property
    def stats(self) -> Dict[str, Any]:
        with self._lock:
            total = self._hits + self._misses
            return {
                "size": len(self._store),
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": (self._hits / total) if total > 0 else 0.0,
                "default_ttl": self._default_ttl,
            }


# Instancia global por worker
_cache: Optional[SimpleCache] = None
_cache_lock = Lock()


def get_cache() -> SimpleCache:
    global _cache
    if _cache is None:
        with _cache_lock:
            if _cache is None:
                _cache = SimpleCache(DEFAULT_TTL)
    return _cache


# ---------------------------------------------------------------------------
# Helpers de clave
# ---------------------------------------------------------------------------

def _cache_key(*parts: str) -> str:
    return ":".join(parts)


# ---------------------------------------------------------------------------
# Decorador de cache
# ---------------------------------------------------------------------------

def cached(key: str, ttl: Optional[float] = None):
    """
    Decorador para funciones puras que retornan datos cacheados.

    Ejemplo:
        @cached("especialidades")
        def listar_especialidades(db) -> list:
            ...

    La función será llamada solo si el cache está expirado o vacío.
    """

    def decorator(fn: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            cache = get_cache()
            value = cache.get(key)
            if value is not None:
                return value
            value = fn(*args, **kwargs)
            cache.set(key, value, ttl)
            return value

        return wrapper

    return decorator


# ---------------------------------------------------------------------------
# Invalidación por catálogo
# ---------------------------------------------------------------------------

def invalidate_catalogo(nombre: str) -> int:
    """
    Invalida todas las claves de un catálogo específico.
    Los catálogos se guardan con clave "catalogo:<nombre>".
    """
    cache = get_cache()
    return cache.invalidate_prefix(f"catalogo:{nombre}")


def invalidate_todo() -> None:
    """Borra toda la cache. Usado principalmente para testing o emergencias."""
    get_cache().clear()


# ---------------------------------------------------------------------------
# Endpoints específicos de cache
# ---------------------------------------------------------------------------

def cache_especialidades(result: Any) -> Any:
    """Guarda el resultado de listar especialidades en cache."""
    get_cache().set("catalogo:especialidades", result, DEFAULT_TTL)
    return result


def cache_localidades(result: Any) -> Any:
    """Guarda el resultado de listar localidades en cache."""
    get_cache().set("catalogo:localidades", result, DEFAULT_TTL)
    return result


def cache_surgery_status(result: Any) -> Any:
    """Guarda el resultado de listar estatus de cirugía en cache."""
    get_cache().set("catalogo:surgery_status", result, DEFAULT_TTL)
    return result


def cache_listas(result: Any) -> Any:
    """Guarda el resultado de listar listas en cache (más corto TTL porque puede cambiar)."""
    get_cache().set("catalogo:listas", result, 60)
    return result


# ---------------------------------------------------------------------------
# Alias y wrappers para mantener compatibilidad con los API endpoints
# ---------------------------------------------------------------------------

cachear_especialidades = cache_especialidades
cachear_localidades = cache_localidades
cachear_surgery_status = cache_surgery_status


def invalidate_especialidades() -> int:
    """Invalida cache de la lista de especialidades."""
    return invalidate_catalogo("especialidades")


def invalidate_localidades() -> int:
    """Invalida cache de la lista de localidades."""
    return invalidate_catalogo("localidades")


def invalidate_surgery_status() -> int:
    """Invalida cache de la lista de estatus de cirugía."""
    return invalidate_catalogo("surgery_status")
