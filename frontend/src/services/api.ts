import axios, { AxiosError } from 'axios'
import { getDeviceId } from '../utils/deviceId'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
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
  (response) => response,
  async (error: AxiosError) => {
    const url: string = error.config?.url || ''
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh')
    const status = error.response?.status
    const config = error.config

    if (status === 401 && !isAuthEndpoint && config && !(config as any)._retried) {
      (config as any)._retried = true
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

    if (config && (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) &&
        config.method?.toLowerCase() === 'get' && !(config as any)._retried) {
      (config as any)._retried = true
      return api.request(config)
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }, { timeout: 90000 }),
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
}

export const listsApi = {
  create: (data: any) => api.post('/lists/', data),
  list: () => api.get('/lists/'),
  get: (id: string | number) => api.get(`/lists/${id}`),
  update: (id: string | number, data: any) => api.put(`/lists/${id}`, data),
  delete: (id: string | number) => api.delete(`/lists/${id}`),
  getRecords: (id: string | number, params?: any) => api.get(`/lists/${id}/records`, { params }),
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
  list: () => api.get('/specialties/'),
  create: (name: string) => api.post('/specialties/', { name }),
  rename: (oldName: string, newName: string) => api.put('/specialties/rename', { old: oldName, new: newName }),
  remove: (name: string, replacement?: string) =>
    api.delete('/specialties/', { params: { name, replacement: replacement || '' } }),
}

export const localitiesApi = {
  list: () => api.get('/localities/'),
  create: (name: string, tipo?: string) => api.post('/localities/', { name, tipo: tipo || '' }),
  rename: (oldName: string, newName: string) => api.put('/localities/rename', { old: oldName, new: newName }),
  remove: (name: string, replacement?: string) =>
    api.delete('/localities/', { params: { name, replacement: replacement || '' } }),
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

export default api
