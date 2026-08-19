import { useState, useEffect, useCallback } from 'react'
import { authApi, usersApi, notificationsApi } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import { useMessages } from '../contexts/MessagesContext'
import { LogOut, ShieldCheck, Smartphone, Monitor, Lock, Send, X } from 'lucide-react'
import { Devices } from './Devices'

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
  const [tab, setTab] = useState<'sesiones' | 'equipos'>('sesiones')
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [users, setUsers] = useState<{ id: string; username: string; full_name: string }[]>([])
  const [filterUser, setFilterUser] = useState('')
  const [showMessage, setShowMessage] = useState(false)
  const [msgTarget, setMsgTarget] = useState('all')
  const [msgRole, setMsgRole] = useState('medico')
  const [msgUser, setMsgUser] = useState('')
  const [msgTitle, setMsgTitle] = useState('')
  const [msgBody, setMsgBody] = useState('')
  const [sending, setSending] = useState(false)
  const { toast, confirm } = useNotification()
  const { refresh } = useMessages()

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
    if (!await confirm(`¿Cerrar la sesión de ${s.username}? Tendrá que volver a iniciar sesión.`)) return
    try {
      await authApi.revokeSession(s.id)
      toast('Sesión cerrada', 'success')
      loadSessions(filterUser || undefined)
    } catch {
      toast('No se pudo cerrar la sesión', 'error')
    }
  }

  const handleSendMessage = async () => {
    if (sending) return
    if (!msgTitle.trim() || !msgBody.trim()) {
      toast('El título y el mensaje son obligatorios', 'error')
      return
    }
    if (msgTarget === 'role' && !msgRole) {
      toast('Selecciona el tipo de usuario', 'error')
      return
    }
    if (msgTarget === 'user' && !msgUser) {
      toast('Selecciona el usuario destinatario', 'error')
      return
    }
    setSending(true)
    try {
      const payload: any = { title: msgTitle.trim(), message: msgBody.trim() }
      if (msgTarget === 'role') payload.target_role = msgRole
      if (msgTarget === 'user') payload.target_user_id = msgUser
      await notificationsApi.send(payload)
      toast('Mensaje enviado correctamente', 'success')
      refresh()
      setShowMessage(false)
      setMsgTitle('')
      setMsgBody('')
      setMsgTarget('all')
      setMsgRole('medico')
      setMsgUser('')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'No se pudo enviar el mensaje', 'error')
    } finally {
      setSending(false)
    }
  }

  const active = sessions.filter((s: SessionItem) => s.active)

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#1E2A32]">Sesiones</h1>
        </div>
        <button
          onClick={() => setShowMessage(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-white text-[#0F766E] border border-[#0F766E] rounded-xl hover:bg-[#F7F8FA] text-sm font-medium transition-all duration-200"
        >
          <Send size={15} /> Enviar mensaje
        </button>
      </div>

      <div className="shrink-0 flex items-center gap-1 bg-[#EEF1F5] p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('sesiones')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            tab === 'sesiones' ? 'bg-white text-[#1E2A32] shadow-sm' : 'text-[#5F6C79] hover:text-[#1E2A32]'
          }`}
        >
          <ShieldCheck size={15} />
          Sesiones activas
        </button>
        <button
          onClick={() => setTab('equipos')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            tab === 'equipos' ? 'bg-white text-[#1E2A32] shadow-sm' : 'text-[#5F6C79] hover:text-[#1E2A32]'
          }`}
        >
          <Monitor size={15} />
          Equipos
        </button>
      </div>

      {tab === 'equipos' && <Devices embedded />}

      {tab === 'sesiones' && (<>
      <div className="flex items-center justify-between shrink-0 flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#1E2A32]">Sesiones Activas</h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79]"
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

      <div className="bg-white rounded-xl shadow-sm border border-[#E4E8EE] flex flex-col min-h-0 flex-1">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#EEF1F5] border-b border-[#E4E8EE]">
                <th className="text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Usuario</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Dispositivo</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Equipo</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">IP</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Creada</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Última actividad</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Expira</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Estado</th>
                <th className="text-right px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-sm text-[#7A8694]">No hay sesiones activas en este momento.</td>
                </tr>
              )}
              {sessions.map((s) => {
                const deviceMeta = s.device_status ? DEVICE_META[s.device_status] : null
                return (
                <tr key={s.id} className={`border-b border-[#EEF1F5] transition-all duration-150 hover:bg-[#EEF1F5] ${s.is_current ? 'bg-emerald-50/60' : ''} ${s.device_status === 'pending' ? 'bg-amber-50/40' : s.device_status === 'blocked' ? 'bg-rose-50/40' : ''}`}>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${s.is_current ? 'bg-emerald-100 text-emerald-700' : 'bg-[#EEF1F5] text-[#5F6C79]'}`}>
                        {s.is_current ? 'Esta sesión' : 'Otra'}
                      </span>
                      <div>
                        <p className="font-medium text-[#1E2A32]">{s.full_name || s.username}</p>
                        <p className="text-xs text-[#7A8694]">@{s.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-[#3F4D58]">
                    <div className="flex items-center gap-2">
                      {(deviceFromAgent(s.user_agent) === 'Móvil/Tablet'
                        ? <Smartphone size={15} className="text-[#7A8694]" />
                        : <Monitor size={15} className="text-[#7A8694]" />)}
                      <div>
                        <p>{browserFromAgent(s.user_agent)}</p>
                        <p className="text-xs text-[#7A8694]">{deviceFromAgent(s.user_agent)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[#2B3A45]">{s.device_id || '—'}</span>
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
                  <td className="px-6 py-4 text-sm text-[#3F4D58]">{s.ip_address || '—'}</td>
                  <td className="px-6 py-4 text-sm text-[#3F4D58]">{fmt(s.created_at)}</td>
                  <td className="px-6 py-4 text-sm text-[#3F4D58]">{fmt(s.last_seen_at)}</td>
                  <td className="px-6 py-4 text-sm text-[#3F4D58]">{fmt(s.expires_at)}</td>
                  <td className="px-6 py-4">
                    {s.active ? (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Activa</span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-[#EEF1F5] text-[#5F6C79]">Inactiva</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleRevoke(s)}
                      disabled={!s.active}
                      className="p-1.5 hover:bg-red-100 rounded-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
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

      <div className="flex items-center gap-2 text-xs text-[#7A8694] shrink-0">
        <ShieldCheck size={14} className="text-emerald-500" />
        Las sesiones cierran automáticamente al revocarlas: el usuario tendrá que volver a iniciar sesión.
        <Lock size={14} className="ml-2 text-[#8E9AA6]" />
        La sesión actual no puede cerrarse a menos que sea deliberadamente.
      </div>
      </>)}

      {showMessage && (
        <div className="fixed inset-0 bg-[#0F172A]/30 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-[#E4E8EE]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-lg font-bold text-[#1E2A32]">Enviar mensaje</h2>
              <button
                onClick={() => setShowMessage(false)}
                className="p-1.5 hover:bg-[#F7F8FA] rounded-lg text-[#7A8694]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#5F6C79] mb-1.5">Destinatario</label>
                <div className="flex gap-2 mb-3">
                  {[
                    { value: 'all', label: 'Todos' },
                    { value: 'role', label: 'Por tipo' },
                    { value: 'user', label: 'Un usuario' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMsgTarget(opt.value)}
                      className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-colors duration-150 ${
                        msgTarget === opt.value
                          ? 'bg-[#0F766E] text-white border-[#0F766E]'
                          : 'bg-white text-[#5F6C79] border-[#E4E8EE] hover:text-[#0F766E]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {msgTarget === 'role' && (
                  <select
                    value={msgRole}
                    onChange={(e) => setMsgRole(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79]"
                  >
                    <option value="medico">Médicos</option>
                    <option value="direccion_medica">Dirección Médica</option>
                    <option value="direccion">Dirección</option>
                    <option value="admin">Administradores</option>
                  </select>
                )}
                {msgTarget === 'user' && (
                  <select
                    value={msgUser}
                    onChange={(e) => setMsgUser(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79]"
                  >
                    <option value="">Selecciona un usuario...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5F6C79] mb-1.5">Título</label>
                <input
                  value={msgTitle}
                  onChange={(e) => setMsgTitle(e.target.value)}
                  maxLength={200}
                  placeholder="Ej. Recordatorio de reunión"
                  className="w-full px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5F6C79] mb-1.5">Mensaje</label>
                <textarea
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  rows={4}
                  placeholder="Escribe el mensaje que verán los usuarios..."
                  className="w-full px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowMessage(false)}
                  className="px-4 py-2 text-sm text-[#3F4D58] hover:bg-[#F7F8FA] rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={sending}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] text-sm font-medium transition-all duration-200 disabled:opacity-50"
                >
                  <Send size={14} /> {sending ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}