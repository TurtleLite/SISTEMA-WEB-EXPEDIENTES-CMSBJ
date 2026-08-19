import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react'
import { useAuth } from './AuthContext'
import { notificationsApi } from '../services/api'

interface MessagesContextType {
  unread: number
  refresh: () => void
}

const MessagesContext = createContext<MessagesContextType>({ unread: 0, refresh: () => {} })

export function MessagesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [unread, setUnread] = useState(0)
  const refreshing = useRef(false)

  const refresh = useCallback(async () => {
    if (!user) return
    if (refreshing.current) return
    refreshing.current = true
    try {
      const res = await notificationsApi.unreadCount()
      setUnread(res.data?.count ?? 0)
    } catch {
      // silencioso: la campana no debe bloquear la app
    } finally {
      refreshing.current = false
    }
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!user) return
    const id = setInterval(refresh, 30000)
    return () => clearInterval(id)
  }, [user, refresh])

  useEffect(() => {
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return (
    <MessagesContext.Provider value={{ unread, refresh }}>
      {children}
    </MessagesContext.Provider>
  )
}

export const useMessages = () => useContext(MessagesContext)