import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User } from '../types'
import { authApi, usersApi } from '../services/api'

export interface DeviceInfo {
  id: string | null
  status: 'pending' | 'approved' | 'blocked' | null
  shared: boolean
}

interface AuthContextType {
  user: User | null
  token: string | null
  device: DeviceInfo | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (updated: User) => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

const loadDevice = (): DeviceInfo | null => {
  try {
    const raw = sessionStorage.getItem('device')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [device, setDevice] = useState<DeviceInfo | null>(loadDevice)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedToken = sessionStorage.getItem('token')
    const savedUser = sessionStorage.getItem('user')
    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser)
        if (parsed && typeof parsed === 'object') {
          setToken(savedToken)
          setUser(parsed)
        }
      } catch {
        sessionStorage.removeItem('token')
        sessionStorage.removeItem('refreshToken')
        sessionStorage.removeItem('user')
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const sync = async () => {
      if (!sessionStorage.getItem('token')) return
      try {
        const res = await usersApi.me()
        updateUser(res.data)
      } catch {
        // un 401 ya limpia la sesión en el interceptor; errores de red no desloguean
      }
    }
    sync()
    const onFocus = () => sync()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const login = async (username: string, password: string) => {
    try {
      const res = await authApi.login(username, password)
      const data = res.data
      sessionStorage.setItem('token', data.access_token)
      if (data.refresh_token) sessionStorage.setItem('refreshToken', data.refresh_token)
      sessionStorage.setItem('user', JSON.stringify(data.user))
      if (data.device) {
        sessionStorage.setItem('device', JSON.stringify(data.device))
        setDevice(data.device)
      } else {
        sessionStorage.removeItem('device')
        setDevice(null)
      }
      setToken(data.access_token)
      setUser(data.user)
      sessionStorage.removeItem('offline')
    } catch (err: any) {
      const isNetworkError = !err.response && (err.code === 'ECONNABORTED' || err.message?.includes('timeout') || err.message?.includes('Network Error') || (err as any).isOffline)
      if (isNetworkError || !err.response) {
        // Fallback offline: permite entrar sin backend para que el sistema no quede bloqueado
        // Usa el username escrito y asigna un rol según el nombre, o direccion por defecto
        const lower = username.trim().toLowerCase()
        const roleMap: Record<string, User['role']> = {
          admin: 'admin',
          direccion: 'direccion',
          direccionmedica: 'direccion_medica',
          'direccion_medica': 'direccion_medica',
          medico: 'medico',
          cargapx: 'carga_px',
          'carga_px': 'carga_px',
          oftalmologia: 'oftalmologia',
        }
        const role = roleMap[lower] || 'direccion'
        const offlineUser: User = {
          id: 'offline',
          username: username.trim() || 'offline',
          telefono: '',
          full_name: username.trim() || 'Usuario offline',
          role,
          is_active: true,
          created_at: new Date().toISOString(),
        }
        const offlineToken = `offline-${Date.now()}`
        sessionStorage.setItem('token', offlineToken)
        sessionStorage.setItem('user', JSON.stringify(offlineUser))
        sessionStorage.setItem('offline', '1')
        setToken(offlineToken)
        setUser(offlineUser)
        setDevice(null)
        return
      }
      throw err
    }
  }

  const logout = async () => {
    try {
      const isOffline = sessionStorage.getItem('offline') === '1'
      if (!isOffline) await authApi.logout()
    } catch {
      // la sesión se cierra igualmente aunque el servidor no responda
    }
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('refreshToken')
    sessionStorage.removeItem('user')
    sessionStorage.removeItem('device')
    sessionStorage.removeItem('offline')
    setToken(null)
    setUser(null)
    setDevice(null)
  }

  const updateUser = (updated: User) => {
    sessionStorage.setItem('user', JSON.stringify(updated))
    setUser(updated)
  }

  return (
    <AuthContext.Provider value={{ user, token, device, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
