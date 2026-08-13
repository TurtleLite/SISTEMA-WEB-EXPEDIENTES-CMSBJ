import { useState, useEffect, useCallback } from 'react'
import { authApi, usersApi } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import { LogOut, ShieldCheck, Smartphone, Monitor, Lock } from 'lucide-react'

interface SessionItem {
  id: string
  user_id: string
  username: string
  full_name: string
  ip_address: string
  device_id: string | null
  device_status: 'pending' | 'approved' | 'blocked' | null
  device_shared: boolean
  user_agent: string
  created_at: string
  expires_at: string | null
  last_seen_at: string | null
  revoked_at: string | null
  is_current: boolean
  active: boolean
}

const DEVICE_META: Record<string, { label: string; badge: string }> = {
  pending: { label: 'Pendiente', badge: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Aprobado', badge: 'bg-emerald-100 text-emerald-700' },
  blocked: { label: 'Bloqueado', badge: 'bg-rose-100 text-rose-700' },
}

const fmt = (value: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleString('es-HN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const browserFromAgent = (agent: string) => {
  if (!agent) return 'Desconocido'
  const a = agent.toLowerCase()
  if (a.includes('edg')) return 'Edge'
  if (a.includes('chrome')) return 'Chrome'
  if (a.includes('firefox')) return 'Firefox'
  if (a.includes('safari')) return 'Safari'
  if (a.includes('opera')) return 'Opera'
  return 'Navegador'
}

const deviceFromAgent = (agent: string) => {
  if (!agent) return ''
  const a = agent.toLowerCase()
  if (/mobile|android|iphone|ipad/.test(a)) return 'Móvil/Tablet'
  if (/windows|mac|linux/.test(a)) return 'Escritorio'
  return ''
}

export function Sessions() {
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [users, setUsers] = useState<{ id: string; username: string; full_name: string }[]>([])
  const [filterUser, setFilterUser] = useState('')
  const { toast, confirm } = useNotification()

  const loadSessions = useCallback(async (userId?: string) => {
    const params: any = { all_users: true }
    if (userId) params.user_id = userId
    try {
      const res = await authApi.sessions(params)
      setSessions(res.data || [])
    } catch {
      toast('Error al cargar las sesiones', 'error')
    }
  }, [toast])

  useEffect(() => {
    loadSessions()
    usersApi.list()
      .then((res) => setUsers(res.data || []))
      .catch(() => {})
  }, [loadSessions])

  const applyFilter = () => {
    loadSessions(filterUser || undefined)
  }

  const handleRevoke = async (s: SessionItem) => {
    if (!await confirm(`¿Cerrar la sesión de ${s.username}?`)) return
    try {
      await authApi.revokeSession(s.id)
      toast('Sesión cerrada', 'success')
      loadSessions(filterUser || undefined)
    } catch {
      toast('No se pudo cerrar la sesión', 'error')
    }
  }

  const active = sessions.filter((s: SessionItem) => s.active)

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#3F4650]">Sesiones Activas</h1>
          <p className="text-sm text-[#6F7682] mt-0.5">
            {active.length} sesión(es) activa(s). Puede cerrar cualquier sesión de forma remota.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="px-3 py-2 border border-[#E3E6EB] rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-300/30 focus:border-slate-400"
          >
            <option value="">Todos los usuarios</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username} — {u.full_name}</option>
            ))}
          </select>
          <button
            onClick={applyFilter}
            className="px-4 py-2 bg-[#6E7B91] text-white rounded-xl hover:bg-[#5F6B80] text-sm font-medium transition-all duration-200"
          >
            Filtrar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E3E6EB] flex flex-col min-h-0 flex-1">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 border-b border-[#E3E6EB]">
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Usuario</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dispositivo</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Equipo</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">IP</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Creada</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Última actividad</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Expira</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
                <th className="text-right px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-sm text-slate-400">No hay sesiones registradas</td>
                </tr>
              )}
              {sessions.map((s) => {
                const deviceMeta = s.device_status ? DEVICE_META[s.device_status] : null
                return (
                <tr key={s.id} className={`border-b border-slate-100 transition-all duration-150 hover:bg-slate-100/50 ${s.is_current ? 'bg-emerald-50/60' : ''} ${s.device_status === 'pending' ? 'bg-amber-50/40' : s.device_status === 'blocked' ? 'bg-rose-50/40' : ''}`}>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${s.is_current ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {s.is_current ? 'Esta sesión' : 'Otra'}
                      </span>
                      <div>
                        <p className="font-medium text-slate-900">{s.full_name || s.username}</p>
                        <p className="text-xs text-slate-400">@{s.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      {(deviceFromAgent(s.user_agent) === 'Móvil/Tablet'
                        ? <Smartphone size={15} className="text-slate-400" />
                        : <Monitor size={15} className="text-slate-400" />)}
                      <div>
                        <p>{browserFromAgent(s.user_agent)}</p>
                        <p className="text-xs text-slate-400">{deviceFromAgent(s.user_agent)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-slate-700">{s.device_id || '—'}</span>
                      {deviceMeta && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${deviceMeta.badge}`}>
                          {deviceMeta.label}
                        </span>
                      )}
                      {s.device_shared && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700" title="Equipo usado por más de un usuario">
                          Compartido
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{s.ip_address || '—'}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{fmt(s.created_at)}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{fmt(s.last_seen_at)}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{fmt(s.expires_at)}</td>
                  <td className="px-6 py-4">
                    {s.active ? (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Activa</span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">Cerrada</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleRevoke(s)}
                      disabled={!s.active}
                      className="p-1.5 hover:bg-red-100 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Cerrar sesión remotamente"
                    >
                      <LogOut size={15} className="text-red-400" />
                    </button>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
        <ShieldCheck size={14} className="text-emerald-500" />
        Las sesiones cierran automáticamente al revocarlas: el usuario tendrá que volver a iniciar sesión.
        <Lock size={14} className="ml-2 text-slate-300" />
        La sesión actual no puede cerrarse a menos que sea deliberadamente.
      </div>
    </div>
  )
}