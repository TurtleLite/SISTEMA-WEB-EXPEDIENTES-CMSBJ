/**
 * Cache en memoria para el frontend CMSBJ.
 * Guarda respuestas de catálogos y datos que cambian poco.
 * Evita pedir lo mismo a la BD en cada navegación / filtro.
 *
 * - TTL por defecto 5 minutos para catálogos
 * - Invalida al hacer POST/PUT/DELETE del mismo recurso
 * - Deduplica peticiones en vuelo: si 2 componentes piden lo mismo a la vez,
 *   solo sale 1 request a la red
 */

type CacheEntry<T> = { value: T; expiresAt: number }

class RequestCache {
  private store = new Map<string, CacheEntry<any>>()
  private inflight = new Map<string, Promise<any>>()

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs: number) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  invalidate(key: string) {
    this.store.delete(key)
  }

  invalidatePrefix(prefix: string) {
    for (const k of Array.from(this.store.keys())) {
      if (k.startsWith(prefix)) this.store.delete(k)
    }
  }

  clear() {
    this.store.clear()
    this.inflight.clear()
  }

  // Deduplicación: si ya hay una promesa para esta key, la reutiliza
  dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key)
    if (existing) return existing as Promise<T>
    const p = fn().finally(() => this.inflight.delete(key))
    this.inflight.set(key, p)
    return p
  }
}

export const requestCache = new RequestCache()

// TTLs
export const TTL_CATALOGO = 5 * 60 * 1000 // 5 min
export const TTL_LISTA = 60 * 1000 // 1 min
export const TTL_CONTEO = 30 * 1000 // 30s

// Claves
export const K = {
  specialties: 'get:/specialties/',
  localities: 'get:/localities/',
  surgeryStatus: 'get:/surgery-status/',
  lists: 'get:/lists/',
  listEspecialidades: (id: string | number) => `get:/lists/${id}/especialidades`,
  listLocalidades: (id: string | number) => `get:/lists/${id}/localidades`,
  fieldValues: (id: string | number, field: string) => `get:/lists/${id}/field-values?field=${field}`,
  recordsCount: (id: string | number) => `get:/lists/${id}/records/count`,
  compensadoStats: (id: string | number) => `get:/lists/${id}/records/compensado-stats`,
}

export function isCatalogoKey(key: string): boolean {
  return (
    key === K.specialties ||
    key === K.localities ||
    key === K.surgeryStatus ||
    key.startsWith('get:/lists/') && (key.includes('/especialidades') || key.includes('/localidades') || key.includes('/field-values'))
  )
}
