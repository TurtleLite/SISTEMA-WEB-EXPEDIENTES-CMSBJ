import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react'
import { useAuth } from './AuthContext'
import { notificationsApi } from '../services/api'
import { Notification } from '../types'

interface MessagesContextType {
  active: Notification | null
  close: () => void
  refresh: () => void
}

const MessagesContext = createContext<MessagesContextType>({
  active: null,
  close: () => {},
  refresh: () => {},
})

export function MessagesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [active, setActive] = useState<Notification | null>(null)
  const polling = useRef(false)

  const refresh = useCallback(async () => {
    if (!user || polling.current) return
    polling.current = true
    try {
      const res = await notificationsApi.list({ limit: 1, only_unread: true })
      const latest = (res.data || [])[0]
      if (latest) {
        setActive((prev) => {
          if (prev && prev.id === latest.id) return prev
          return latest
        })
      }
    } catch {
      // silencioso: la notificación no debe bloquear la app
    } finally {
      polling.current = false
    }
  }, [user])

  const close = useCallback(async () => {
    const current = active
    setActive(null)
    if (current && !current.is_read) {
      try {
        await notificationsApi.markRead(current.id)
      } catch {
        // silencioso
      }
    }
  }, [active])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!user) return
    const id = setInterval(refresh, 20000)
    return () => clearInterval(id)
  }, [user, refresh])

  useEffect(() => {
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return (
    <MessagesContext.Provider value={{ active, close, refresh }}>
      {children}
    </MessagesContext.Provider>
  )
}

export const useMessages = () => useContext(MessagesContext)