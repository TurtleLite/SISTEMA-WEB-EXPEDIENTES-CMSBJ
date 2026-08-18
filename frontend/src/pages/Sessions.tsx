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
      setSessions((res.data || []).filter((s: SessionItem) => s.active))
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
          <h1 className="font-serif text-2xl font-bold text-[#134E4A]">Sesiones Activas</h1>
          <p className="text-sm text-[#547A72] mt-0.5">
            {active.length} sesión(es) activa(s). Puede cerrar cualquier sesión de forma remota.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="px-3 py-2 border border-[#D8F1EC] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8FAFA9] focus:border-[#547A72]"
          >
            <option value="">Todos los usuarios</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username} — {u.full_name}</option>
            ))}
          </select>
          <button
            onClick={applyFilter}
            className="px-4 py-2 bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] text-sm font-medium transition-all duration-200"
          >
            Filtrar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#D8F1EC] flex flex-col min-h-0 flex-1">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#CCFBF1] border-b border-[#D8F1EC]">
                <th className="text-left px-6 py-4 text-xs font-semibold text-[#6C948C] uppercase tracking-wider">Usuario</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-[#6C948C] uppercase tracking-wider">Dispositivo</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-[#6C948C] uppercase tracking-wider">Equipo</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-[#6C948C] uppercase tracking-wider">IP</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-[#6C948C] uppercase tracking-wider">Creada</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-[#6C948C] uppercase tracking-wider">Última actividad</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-[#6C948C] uppercase tracking-wider">Expira</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-[#6C948C] uppercase tracking-wider">Estado</th>
                <th className="text-right px-6 py-4 text-xs font-semibold text-[#6C948C] uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-sm text-[#6C948C]">No hay sesiones registradas</td>
                </tr>
              )}
              {sessions.map((s) => {
                const deviceMeta = s.device_status ? DEVICE_META[s.device_status] : null
                return (
                <tr key={s.id} className={`border-b border-[#CCFBF1] transition-all duration-150 hover:bg-[#CCFBF1] ${s.is_current ? 'bg-emerald-50/60' : ''} ${s.device_status === 'pending' ? 'bg-amber-50/40' : s.device_status === 'blocked' ? 'bg-rose-50/40' : ''}`}>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${s.is_current ? 'bg-emerald-100 text-emerald-700' : 'bg-[#CCFBF1] text-[#547A72]'}`}>
                        {s.is_current ? 'Esta sesión' : 'Otra'}
                      </span>
                      <div>
                        <p className="font-medium text-[#134E4A]">{s.full_name || s.username}</p>
                        <p className="text-xs text-[#6C948C]">@{s.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-[#3D6F66]">
                    <div className="flex items-center gap-2">
                      {(deviceFromAgent(s.user_agent) === 'Móvil/Tablet'
                        ? <Smartphone size={15} className="text-[#6C948C]" />
                        : <Monitor size={15} className="text-[#6C948C]" />)}
                      <div>
                        <p>{browserFromAgent(s.user_agent)}</p>
                        <p className="text-xs text-[#6C948C]">{deviceFromAgent(s.user_agent)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[#2C5F57]">{s.device_id || '—'}</span>
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
                  <td className="px-6 py-4 text-sm text-[#3D6F66]">{s.ip_address || '—'}</td>
                  <td className="px-6 py-4 text-sm text-[#3D6F66]">{fmt(s.created_at)}</td>
                  <td className="px-6 py-4 text-sm text-[#3D6F66]">{fmt(s.last_seen_at)}</td>
                  <td className="px-6 py-4 text-sm text-[#3D6F66]">{fmt(s.expires_at)}</td>
                  <td className="px-6 py-4">
                    {s.active ? (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Activa</span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-[#CCFBF1] text-[#547A72]">Inactiva</span>
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

      <div className="flex items-center gap-2 text-xs text-[#6C948C] shrink-0">
        <ShieldCheck size={14} className="text-emerald-500" />
        Las sesiones cierran automáticamente al revocarlas: el usuario tendrá que volver a iniciar sesión.
        <Lock size={14} className="ml-2 text-[#8FAFA9]" />
        La sesión actual no puede cerrarse a menos que sea deliberadamente.
      </div>
    </div>
  )
}