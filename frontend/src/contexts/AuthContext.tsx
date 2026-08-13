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
    const res = await authApi.login(username, password)
    const data = res.data
    sessionStorage.setItem('token', data.access_token)
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
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch {
      // la sesión se cierra igualmente aunque el servidor no responda
    }
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    sessionStorage.removeItem('device')
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
