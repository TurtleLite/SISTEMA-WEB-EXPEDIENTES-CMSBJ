import { useState, useEffect, useCallback, useMemo } from 'react'
import { devicesApi } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import {
  Monitor, ShieldCheck, ShieldAlert, Search, X as XIcon, ShieldQuestion,
} from 'lucide-react'

interface DeviceItem {
  id: string
  device_id: string
  status: 'pending' | 'approved' | 'blocked'
  note: string
  first_username: string | null
  first_seen_at: string | null
  last_seen_at: string | null
  users: string[]
  shared: boolean
  events: number
  last_event_at: string | null
  approved_by: string | null
  approved_at: string | null
  blocked_by: string | null
  blocked_at: string | null
}

const STATUS_META: Record<string, { label: string; badge: string; border: string; icon: any }> = {
  pending: { label: 'Pendiente', badge: 'bg-amber-100 text-amber-700', border: 'border-l-amber-400', icon: ShieldQuestion },
  approved: { label: 'Aprobado', badge: 'bg-emerald-100 text-emerald-700', border: 'border-l-emerald-500', icon: ShieldCheck },
  blocked: { label: 'Bloqueado', badge: 'bg-rose-100 text-rose-700', border: 'border-l-rose-500', icon: ShieldAlert },
}

const timeAgo = (value: string | null): string => {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const days = Math.floor(h / 24)
  if (days === 1) return 'ayer'
  return `hace ${days} días`
}

export function Devices({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<DeviceItem[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const { toast } = useNotification()

  const load = useCallback(async () => {
    try {
      const res = await devicesApi.list()
      setItems(res.data.items || [])
    } catch {
      toast('Error al cargar los equipos', 'error')
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const handleApprove = async (d: DeviceItem) => {
    setSaving(d.device_id)
    try {
      await devicesApi.approve(d.device_id, "")
      toast(`Equipo ${d.device_id} aprobado`, 'success')
      setConfirming(null)
      await load()
    } catch {
      toast('No se pudo aprobar el equipo', 'error')
    } finally {
      setSaving(null)
    }
  }

  const handleBlock = async (d: DeviceItem) => {
    const reason = blockReason.trim()
    if (!reason) {
      toast('El motivo del bloqueo es obligatorio', 'error')
      return
    }
    setSaving(d.device_id)
    try {
      await devicesApi.block(d.device_id, reason)
      toast(`Equipo ${d.device_id} bloqueado`, 'success')
      setConfirming(null)
      setBlockReason('')
      await load()
    } catch {
      toast('No se pudo bloquear el equipo', 'error')
    } finally {
      setSaving(null)
    }
  }

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase()
    let list = items
    if (query) {
      list = list.filter((d) =>
        d.device_id.toLowerCase().includes(query)
        || d.note.toLowerCase().includes(query)
        || d.users.some((u) => u.toLowerCase().includes(query))
        || (d.first_username || '').toLowerCase().includes(query))
    }
    return [...list].sort((a, b) => {
      const ta = a.last_event_at || a.last_seen_at || ''
      const tb = b.last_event_at || b.last_seen_at || ''
      return tb.localeCompare(ta)
    })
  }, [items, q])

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {!embedded && (
        <div className="flex items-center justify-between shrink-0">
          <h1 className="font-serif text-xl font-bold text-[#1E2A32]">Equipos</h1>
        </div>
      )}

      <div className="shrink-0 relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA4B2]" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar equipo, usuario o nota..."
          className="w-full pl-9 pr-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E4E8EE] flex flex-col min-h-0 flex-1">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#F8FAFC] border-b border-[#E4E8EE]">
                <th className="w-[40%] text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Equipo</th>
                <th className="w-[18%] text-left px-3 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Estado</th>
                <th className="w-[22%] text-left px-3 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Usuarios</th>
                <th className="w-[20%] text-right px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-[#7A8694]">
                    <Monitor size={24} className="mx-auto mb-2 text-[#D5DBE3]" />
                    {q ? 'Sin resultados' : 'No hay equipos registrados.'}
                  </td>
                </tr>
              )}
              {visible.map((d) => {
                const meta = STATUS_META[d.status]
                const inConfirm = confirming === d.device_id
                const StatusIcon = meta.icon
                const isOpen = expanded === d.device_id
                return (
                  <>
                    <tr key={d.id} onClick={() => setExpanded(isOpen ? null : d.device_id)} className={`border-b border-l-4 ${meta.border} hover:bg-[#F8FAFC] cursor-pointer transition-colors ${isOpen ? 'bg-[#F8FAFC]' : ''}`}>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <Monitor size={14} className="text-[#94A3B8] shrink-0" />
                          <span className="text-sm font-mono text-[#1E2A32] truncate">{d.device_id}</span>
                          {d.shared && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 text-violet-700">Compartido</span>}
                        </div>
                        {d.note && <p className="text-xs text-[#64748B] truncate mt-0.5">{d.note}</p>}
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${meta.badge}`}>
                          <StatusIcon size={12} />{meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          {d.users.length === 0 ? <span className="text-sm text-[#94A3B8]">—</span> : (
                            <>
                              <span className="text-sm text-[#334155] truncate max-w-[110px]">{d.users[0]}</span>
                              {d.users.length > 1 && <span className="text-xs text-[#64748B]">+{d.users.length - 1}</span>}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {inConfirm ? (
                          <div className="flex items-center justify-end gap-1">
                            {d.status === 'approved' && (
                              <input
                                type="text"
                                value={blockReason}
                                onChange={(e) => setBlockReason(e.target.value)}
                                placeholder="Motivo"
                                autoFocus
                                className="w-24 px-2 py-1.5 border border-rose-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-200"
                              />
                            )}
                            <button
                              onClick={() => d.status === 'approved' ? handleBlock(d) : handleApprove(d)}
                              disabled={saving === d.device_id}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg text-white ${d.status === 'approved' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                            >
                              {saving === d.device_id ? '...' : 'Sí'}
                            </button>
                            <button onClick={() => { setConfirming(null); setBlockReason('') }} className="p-1.5 hover:bg-[#F1F5F9] rounded-lg">
                              <XIcon size={14} />
                            </button>
                          </div>
                        ) : (
                          d.status === 'approved' ? (
                            <button onClick={() => { setConfirming(d.device_id); setBlockReason('') }} className="px-3 py-1.5 text-xs font-medium bg-white border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50">Bloquear</button>
                          ) : (
                            <button onClick={() => { setConfirming(d.device_id); setBlockReason('') }} className="px-3 py-1.5 text-xs font-medium bg-[#0F766E] text-white rounded-lg hover:bg-[#115E59]">Aprobar</button>
                          )
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-[#F8FAFC] border-b border-[#E4E8EE]">
                        <td colSpan={4} className="px-4 py-3">
                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#64748B]">
                            <span>Actividad: <b className="text-[#334155] font-medium">{timeAgo(d.last_event_at || d.last_seen_at)}</b></span>
                            <span>Eventos: <b className="text-[#334155]">{d.events}</b></span>
                            <span>Usuarios: <b className="text-[#334155]">{d.users.join(', ') || '—'}</b></span>
                            {d.note && <span>Nota: <b className="text-[#334155]">{d.note}</b></span>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="shrink-0 border-t border-[#E4E8EE] px-4 py-2 flex items-center justify-between">
          <p className="text-xs text-[#7A8694]">{visible.length} equipo(s)</p>
        </div>
      </div>
    </div>
  )
}
