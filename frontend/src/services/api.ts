import axios, { AxiosError, AxiosResponse } from 'axios'
import { getDeviceId } from '../utils/deviceId'
import { requestCache, TTL_CATALOGO } from '../utils/requestCache'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

const TOKEN_KEY = 'token'
const REFRESH_KEY = 'refreshToken'

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = sessionStorage.getItem(REFRESH_KEY)
  if (!refreshToken) return null
  try {
    const res = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken }, { timeout: 30000 })
    const data = res.data
    sessionStorage.setItem(TOKEN_KEY, data.access_token)
    if (data.refresh_token) {
      sessionStorage.setItem(REFRESH_KEY, data.refresh_token)
    }
    return data.access_token
  } catch {
    return null
  }
}

function clearAuth() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(REFRESH_KEY)
  sessionStorage.removeItem('user')
  sessionStorage.removeItem('device')
}

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const deviceId = getDeviceId()
  if (deviceId) {
    config.headers['X-Device-ID'] = deviceId
  }
  return config
})

api.interceptors.response.use(
  (response) => {
    // Guardar en cache los GET de catálogos si vinieron bien
    const cfg: any = (response as any).config
    if (cfg?.method?.toLowerCase() === 'get') {
      const url: string = cfg.url || ''
      if (url.includes('/specialties') || url.includes('/localities') || url.includes('/surgery-status')) {
        const key = `get:${url}`
        requestCache.set(key, response, TTL_CATALOGO)
      }
    }
    return response
  },
  async (error: AxiosError) => {
    const url: string = error.config?.url || ''
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh')
    const status = error.response?.status
    const config: any = error.config

    if (status === 401 && !isAuthEndpoint && config && !config._retried) {
      config._retried = true
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null })
      }
      const newToken = await refreshPromise
      if (newToken) {
        config.headers.Authorization = `Bearer ${newToken}`
        return api.request(config)
      }
      clearAuth()
      window.location.hash = '#/login'
    }

    // Reintento con backoff para GETs que fallaron por timeout/red (no 4xx) - hasta 3 intentos
    const isNetworkError = !error.response && (error.code === 'ECONNABORTED' || error.message?.includes('timeout') || error.message?.includes('Network Error'))
    if (config && isNetworkError && config.method?.toLowerCase() === 'get') {
      const retries = (config as any)._retries || 0
      if (retries < 2) {
        ;(config as any)._retries = retries + 1
        const backoff = 800 * Math.pow(2, retries) // 800ms, 1600ms
        await new Promise((r) => setTimeout(r, backoff))
        return api.request(config)
      }
    }
    // Mensaje más útil cuando el navegador está offline
    if (!navigator.onLine && !error.response) {
      (error as any).isOffline = true
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  login: async (username: string, password: string) => {
    const attempt = (ms: number) => api.post('/auth/login', { username, password }, { timeout: ms })
    // 3 intentos: 30s, luego 45s, luego 90s - con backoff entre intentos
    let lastErr: any
    for (let i = 0; i < 3; i++) {
      try {
        const tm = i === 0 ? 30000 : i === 1 ? 45000 : 90000
        return await attempt(tm)
      } catch (err: any) {
        lastErr = err
        const isNet = !err.response || err.code === 'ECONNABORTED' || err.message?.includes('timeout') || err.message?.includes('Network Error')
        if (isNet && i < 2) {
          await new Promise((r) => setTimeout(r, 1500 * (i + 1))) // 1.5s, 3s
          continue
        }
        throw err
      }
    }
    throw lastErr
  },
  logout: () => api.post('/auth/logout'),
  sessions: (params?: any) => api.get('/auth/sessions', { params }),
  revokeSession: (id: string | number) => api.delete(`/auth/sessions/${id}`),
}

export const auditApi = {
  list: (params: any) => api.get('/audit/', { params }),
  exportExcel: (params: any) =>
    api.get('/audit/export-excel', { params, responseType: 'blob' }),
}

export const devicesApi = {
  list: () => api.get('/devices/'),
  approve: (deviceId: string, note?: string) => api.post(`/devices/${deviceId}/approve`, { note: note || '' }),
  block: (deviceId: string, note?: string) => api.post(`/devices/${deviceId}/block`, { note: note || '' }),
  setNote: (deviceId: string, note: string) => api.post(`/devices/${deviceId}/note`, { note }),
}

export const usersApi = {
  list: () => api.get('/users/'),
  me: () => api.get('/users/me'),
  updateMe: (data: any) => api.put('/users/me', data),
  get: (id: string | number) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users/', data),
  update: (id: string | number, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string | number) => api.delete(`/users/${id}`),
  unlock: (id: string | number) => api.post(`/users/${id}/unlock`),
  deactivate: (id: string | number) => api.post(`/users/${id}/deactivate`),
  activate: (id: string | number) => api.post(`/users/${id}/activate`),
}

export const listsApi = {
  create: (data: any) => api.post('/lists/', data),
  list: () => api.get('/lists/'),
  get: (id: string | number) => api.get(`/lists/${id}`),
  update: (id: string | number, data: any) => api.put(`/lists/${id}`, data),
  delete: (id: string | number) => api.delete(`/lists/${id}`),
  getRecords: (id: string | number, params?: any) => api.get(`/lists/${id}/records`, { params }),
  compensadoStats: (id: string | number) => api.get(`/lists/${id}/records/compensado-stats`),
  setCompensado: (id: string | number, recordId: string | number, compensado: string | null) =>
    api.put(`/lists/${id}/records/${recordId}/compensado`, { compensado }),
  getRecordsByIds: (id: string | number, ids: string[]) =>
    api.get(`/lists/${id}/records/by-ids`, { params: { ids: ids.join(',') } }),
  getRecordsCount: (id: string | number) => api.get(`/lists/${id}/records/count`),
  copyNumber: (id: string | number, numero: string) =>
    api.get(`/lists/${id}/records/copy-number`, { params: { numero } }),
  createRecord: (id: string | number, data: any) => api.post(`/lists/${id}/records`, data),
  updateRecord: (listId: string | number, recordId: string | number, data: any) =>
    api.put(`/lists/${listId}/records/${recordId}`, data),
  deleteRecord: (listId: string | number, recordId: string | number) =>
    api.delete(`/lists/${listId}/records/${recordId}`),
  trashRecords: (listId: string | number) => api.get(`/lists/${listId}/records/trash`),
  restoreRecord: (listId: string | number, recordId: string | number) =>
    api.post(`/lists/${listId}/records/${recordId}/restore`),
  trashLists: () => api.get('/lists/trash'),
  restoreList: (listId: string | number) => api.post(`/lists/trash/${listId}/restore`),
  importExcel: (listId: string | number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/lists/${listId}/import-excel`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  exportExcel: (listId: string | number) =>
    api.get(`/lists/${listId}/export-excel`, { responseType: 'blob' }),
  exportExpediente: (listId: string | number) =>
    api.get(`/lists/${listId}/export-expediente`, { responseType: 'blob' }),
  getEspecialidades: (listId: string | number) =>
    api.get(`/lists/${listId}/especialidades`),
  getLocalidades: (listId: string | number) =>
    api.get(`/lists/${listId}/localidades`),
  getDuplicates: (listId: string | number) =>
    api.get(`/lists/${listId}/records/duplicates`),
  getFieldValues: (listId: string | number, field: string) =>
    api.get(`/lists/${listId}/field-values`, { params: { field } }),
  exportExpedienteSelected: async (listId: string | number, ids: string[]) => {
    const res = await api.post(`/lists/${listId}/export-expediente-selected`, { ids }, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    const cd = res.headers['content-disposition']
    const match = cd && cd.match(/filename="?(.+?)"?\s*$/i)
    a.download = match ? match[1] : 'expedientes_seleccionados.xlsx'
    a.click()
    window.URL.revokeObjectURL(url)
  },
}

export const specialtiesApi = {
  list: (): Promise<AxiosResponse> => {
    const key = 'get:/specialties/'
    const cached = requestCache.get<AxiosResponse>(key)
    if (cached) return Promise.resolve(cached)
    return requestCache.dedupe(key, () => api.get('/specialties/').then((r) => { requestCache.set(key, r, TTL_CATALOGO); return r }))
  },
  create: (name: string): Promise<AxiosResponse> => api.post('/specialties/', { name }).then((r) => { requestCache.invalidate('get:/specialties/'); return r }),
  rename: (oldName: string, newName: string): Promise<AxiosResponse> => api.put('/specialties/rename', { old: oldName, new: newName }).then((r) => { requestCache.invalidate('get:/specialties/'); return r }),
  remove: (name: string, replacement?: string): Promise<AxiosResponse> =>
    api.delete('/specialties/', { params: { name, replacement: replacement || '' } }).then((r) => { requestCache.invalidate('get:/specialties/'); return r }),
}

export const localitiesApi = {
  list: (): Promise<AxiosResponse> => {
    const key = 'get:/localities/'
    const cached = requestCache.get<AxiosResponse>(key)
    if (cached) return Promise.resolve(cached)
    return requestCache.dedupe(key, () => api.get('/localities/').then((r) => { requestCache.set(key, r, TTL_CATALOGO); return r }))
  },
  create: (name: string, tipo?: string): Promise<AxiosResponse> => api.post('/localities/', { name, tipo: tipo || '' }).then((r) => { requestCache.invalidate('get:/localities/'); return r }),
  rename: (oldName: string, newName: string): Promise<AxiosResponse> => api.put('/localities/rename', { old: oldName, new: newName }).then((r) => { requestCache.invalidate('get:/localities/'); return r }),
  remove: (name: string, replacement?: string): Promise<AxiosResponse> =>
    api.delete('/localities/', { params: { name, replacement: replacement || '' } }).then((r) => { requestCache.invalidate('get:/localities/'); return r }),
}

export const surgeryStatusApi = {
  list: (): Promise<AxiosResponse> => {
    const key = 'get:/surgery-status/'
    const cached = requestCache.get<AxiosResponse>(key)
    if (cached) return Promise.resolve(cached)
    return requestCache.dedupe(key, () => api.get('/surgery-status/').then((r) => { requestCache.set(key, r, TTL_CATALOGO); return r }))
  },
  create: (name: string): Promise<AxiosResponse> => api.post('/surgery-status/', { name }).then((r) => { requestCache.invalidate('get:/surgery-status/'); return r }),
  rename: (oldName: string, newName: string): Promise<AxiosResponse> => api.put('/surgery-status/rename', { old: oldName, new: newName }).then((r) => { requestCache.invalidate('get:/surgery-status/'); return r }),
  remove: (name: string, replacement?: string): Promise<AxiosResponse> =>
    api.delete('/surgery-status/', { params: { name, replacement: replacement || '' } }).then((r) => { requestCache.invalidate('get:/surgery-status/'); return r }),
}

export const reportsApi = {
  create: (data: any) => api.post('/reports/', data),
  list: () => api.get('/reports/'),
  get: (id: string | number) => api.get(`/reports/${id}`),
  preview: (id: string | number) => api.get(`/reports/${id}/preview`),
  saveOrder: (id: string | number, recordIds: (string | number)[]) =>
    api.put(`/reports/${id}/order`, { record_ids: recordIds }),
  generateExcel: (id: string | number) => api.post(`/reports/${id}/generate-excel`),
  download: (id: string | number) =>
    api.get(`/reports/${id}/download`, { responseType: 'blob' }),
  delete: (id: string | number) => api.delete(`/reports/${id}`),
}

export const dayListsApi = {
  list: () => api.get('/day-lists/'),
  get: (date: string) => api.get(`/day-lists/${date}`),
  save: (date: string, recordIds: (string | number)[]) =>
    api.put(`/day-lists/${date}`, { record_ids: recordIds }),
  delete: (date: string) => api.delete(`/day-lists/${date}`),
  exportExcel: (date: string) =>
    api.get(`/day-lists/${date}/export-excel`, { responseType: 'blob' }),
}

export const notificationsApi = {
  list: (params?: any) => api.get('/notifications/', { params }),
  unreadCount: () => api.get('/notifications/unread-count'),
  send: (data: { title: string; message: string; target_user_id?: string; target_role?: string }) =>
    api.post('/notifications/', data),
  markRead: (id: string | number) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
}

export const backupsApi = {
  list: () => api.get('/backups/'),
  generate: () => api.post('/backups/generate'),
  generateExcel: () => api.post('/backups/generate-excel'),
  restore: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/backups/restore', fd, {
      headers: { 'Content-Type': undefined },
      timeout: 300000,
    })
  },
  download: (name: string) => api.get(`/backups/${name}/download`, { responseType: 'blob' }),
  delete: (name: string) => api.delete(`/backups/${name}`),
}

export default api
