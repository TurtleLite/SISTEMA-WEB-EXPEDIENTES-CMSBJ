import { useState, useEffect, useCallback } from 'react'
import { notificationsApi } from '../services/api'
import { Notification } from '../types'
import { useMessages } from '../contexts/MessagesContext'
import { useNotification } from '../contexts/NotificationContext'
import { Bell, CheckCheck, RefreshCw } from 'lucide-react'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es-HN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administradores',
  direccion: 'Dirección',
  direccion_medica: 'Dirección Médica',
  medico: 'Médicos',
}

const targetLabel = (n: Notification) => {
  if (n.target_username) return `Para: ${n.target_username}`
  if (n.target_role) return `Para: ${ROLE_LABELS[n.target_role] || n.target_role}`
  return 'Para todos'
}

export function Notifications() {
  const [notes, setNotes] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const { refresh } = useMessages()
  const { toast } = useNotification()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await notificationsApi.list({ limit: 100, only_unread: onlyUnread || undefined })
      setNotes(res.data || [])
    } catch {
      toast('Error al cargar las notificaciones', 'error')
    } finally {
      setLoading(false)
    }
  }, [onlyUnread, toast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const id = setInterval(load, 30000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  const markRead = async (n: Notification) => {
    if (n.is_read) return
    try {
      await notificationsApi.markRead(n.id)
      setNotes(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true, read_at: new Date().toISOString() } : x))
      refresh()
    } catch {
      toast('No se pudo marcar como leída', 'error')
    }
  }

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead()
      setNotes(prev => prev.map(x => ({ ...x, is_read: true, read_at: new Date().toISOString() })))
      refresh()
      toast('Notificaciones marcadas como leídas', 'success')
    } catch {
      toast('Error al marcar las notificaciones', 'error')
    }
  }

  const unreadCount = notes.filter(n => !n.is_read).length

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#1E2A32]">Notificaciones</h1>
          <p className="text-sm text-[#5F6C79] mt-1">
            Mensajes del centro médico. Los pendientes se resaltan y puedes marcarlos como leídos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOnlyUnread(v => !v)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 border ${
              onlyUnread
                ? 'bg-[#0F766E] text-white border-[#0F766E]'
                : 'bg-white text-[#5F6C79] border-[#E4E8EE] hover:text-[#0F766E]'
            }`}
          >
            Solo no leídas {unreadCount > 0 && `(${unreadCount})`}
          </button>
          {notes.some(n => !n.is_read) && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white text-[#0F766E] border border-[#E4E8EE] hover:bg-[#F7F8FA] transition-colors duration-150"
            >
              <CheckCheck size={15} /> Marcar todas leídas
            </button>
          )}
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white text-[#5F6C79] border border-[#E4E8EE] hover:text-[#0F766E] transition-colors duration-150"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E4E8EE] overflow-hidden">
        {notes.length === 0 ? (
          <div className="px-6 py-16 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-full bg-[#EEF1F5] flex items-center justify-center mb-4">
              <Bell size={24} className="text-[#8794A1]" />
            </div>
            <p className="text-[#5F6C79] font-semibold">
              {onlyUnread ? 'No tienes notificaciones pendientes.' : 'Todavía no tienes notificaciones.'}
            </p>
            <p className="text-sm text-[#8E9AA6] mt-1">
              Cuando la dirección envíe un mensaje aparecerá aquí.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F0F2F5]">
            {notes.map(n => (
              <li key={n.id}>
                <button
                  onClick={() => markRead(n)}
                  className={`w-full text-left px-6 py-4 hover:bg-[#F7F8FA] transition-colors duration-150 flex gap-4 ${
                    n.is_read ? '' : 'bg-teal-50/50'
                  }`}
                >
                  <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${n.is_read ? 'bg-[#E4E8EE]' : 'bg-[#0F766E]'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className={`${n.is_read ? 'text-[#3F4D58] font-medium' : 'text-[#1E2A32] font-bold'}`}>
                        {n.title}
                      </p>
                      <span className="text-[11px] text-[#8E9AA6] shrink-0">{fmtDate(n.created_at)}</span>
                    </div>
                    <p className="text-sm text-[#5F6C79] mt-1 whitespace-pre-wrap">{n.message}</p>
                    <p className="text-[11px] text-[#8794A1] mt-2">
                      De: {n.sender_username || 'Administración'}
                      {' · '}{targetLabel(n)}
                      {n.read_at && <span className="text-[#0F766E]"> · Leído</span>}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}