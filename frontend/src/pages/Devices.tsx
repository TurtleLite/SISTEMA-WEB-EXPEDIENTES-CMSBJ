import { useState, useEffect, useCallback, useMemo } from 'react'
import { devicesApi } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import {
  Monitor, ShieldCheck, ShieldAlert, RefreshCw, Save, Users as UsersIcon,
  Search, AlertTriangle, Check, X as XIcon, ShieldQuestion,
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

type Filter = 'all' | 'pending' | 'approved' | 'blocked'

const fmt = (value: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleString('es-HN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
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
  const [counts, setCounts] = useState<{ pending: number; approved: number; blocked: number }>({ pending: 0, approved: 0, blocked: 0 })
  const [saving, setSaving] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [noteSaving, setNoteSaving] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const { toast } = useNotification()

  const load = useCallback(async () => {
    try {
      const res = await devicesApi.list()
      setItems(res.data.items || [])
      setCounts(res.data.counts || { pending: 0, approved: 0, blocked: 0 })
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
      await devicesApi.approve(d.device_id, notes[d.device_id])
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

  const saveNote = async (d: DeviceItem) => {
    setNoteSaving(d.device_id)
    try {
      await devicesApi.setNote(d.device_id, notes[d.device_id] || '')
      toast('Nota guardada', 'success')
      await load()
    } catch {
      toast('No se pudo guardar la nota', 'error')
    } finally {
      setNoteSaving(null)
    }
  }

  const pending = items.filter((d) => d.status === 'pending')

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase()
    let list = items
    if (filter !== 'all') list = list.filter((d) => d.status === filter)
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
  }, [items, filter, q])

  const FILTER_OPTIONS: { key: Filter; label: string; value: number }[] = [
    { key: 'all', label: 'Todos', value: items.length },
    { key: 'pending', label: 'Pendientes', value: counts.pending },
    { key: 'approved', label: 'Aprobados', value: counts.approved },
    { key: 'blocked', label: 'Bloqueados', value: counts.blocked },
  ]

  return (
    <div className="h-full flex flex-col gap-2.5 min-h-0">
      {!embedded && (
        <div className="flex items-center justify-between shrink-0">
          <h1 className="font-serif text-xl font-bold text-[#1E2A32]">Equipos</h1>
          <button
            onClick={load}
            className="px-2.5 py-1.5 text-xs text-[#115E59] bg-[#F7F8FA] border border-[#E4E8EE] rounded-lg hover:bg-[#EEF1F5] transition-all duration-200 flex items-center gap-1.5"
          >
            <RefreshCw size={13} />
            Actualizar
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-amber-800">
          <AlertTriangle size={13} className="shrink-0" />
          <p className="text-[11px] font-medium flex-1">
            {pending.length} equipo(s) nuevo(s) pendiente(s) de aprobación.
          </p>
          <button onClick={() => setFilter('pending')} className="text-[11px] font-semibold text-amber-700 hover:underline shrink-0">
            Ver pendientes →
          </button>
        </div>
      )}

      <div className="shrink-0 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-[#EEF1F5] p-0.5 rounded-lg">
          {FILTER_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setFilter(o.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${filter === o.key ? 'bg-white text-[#1E2A32] shadow-sm' : 'text-[#5F6C79] hover:text-[#1E2A32]'}`}
            >
              {o.label} <span className="opacity-60">{o.value}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-40">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7A8694]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar equipo, usuario o nota..."
            className="w-full pl-8 pr-2.5 py-1.5 border border-[#E4E8EE] rounded-lg text-xs bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E4E8EE] flex flex-col min-h-0 flex-1">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <table className="w-full table-fixed">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#EEF1F5] border-b border-[#E4E8EE]">
                <th className="w-[21%] text-left px-3 py-2.5 text-[10px] font-semibold text-[#7A8694] uppercase tracking-wider">Equipo</th>
                <th className="w-[12%] text-left px-3 py-2.5 text-[10px] font-semibold text-[#7A8694] uppercase tracking-wider">Estado</th>
                <th className="w-[14%] text-left px-3 py-2.5 text-[10px] font-semibold text-[#7A8694] uppercase tracking-wider">Usuarios</th>
                <th className="w-[11%] text-left px-3 py-2.5 text-[10px] font-semibold text-[#7A8694] uppercase tracking-wider">Actividad</th>
                <th className="w-[7%] text-left px-3 py-2.5 text-[10px] font-semibold text-[#7A8694] uppercase tracking-wider">Eventos</th>
                <th className="w-[12%] text-left px-3 py-2.5 text-[10px] font-semibold text-[#7A8694] uppercase tracking-wider">Nota</th>
                <th className="w-[23%] text-right px-3 py-2.5 text-[10px] font-semibold text-[#7A8694] uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-[#7A8694]">
                    <Monitor size={26} className="mx-auto mb-2 text-[#D5DBE3]" />
                    {q || filter !== 'all' ? 'Sin resultados para la búsqueda' : 'No hay equipos registrados aún.'}
                  </td>
                </tr>
              )}
              {visible.map((d) => {
                const meta = STATUS_META[d.status]
                const inConfirm = confirming === d.device_id
                const StatusIcon = meta.icon
                const shownUsers = d.users.slice(0, 2)
                const extraUsers = d.users.length - shownUsers.length
                return (
                  <tr key={d.id} className={`border-b border-l-4 border-[#EEF1F5] ${meta.border} transition-all duration-150 hover:bg-[#EEF1F5]`}>
                    <td className="px-3 py-2.5 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Monitor size={13} className="text-[#7A8694] shrink-0" />
                        <span className="text-xs font-mono text-[#1E2A32] truncate" title={`Primer uso: ${fmt(d.first_seen_at)}`}>{d.device_id}</span>
                        {d.shared && (
                          <span
                            className="px-1 py-0.5 rounded-full text-[9px] font-semibold bg-violet-100 text-violet-700 shrink-0 cursor-help"
                            title={`Usado por: ${d.users.join(', ')}`}
                          >
                            Compartido
                          </span>
                        )}
                      </div>
                      {d.note && <p className="text-[10px] text-[#7A8694] mt-0.5 truncate" title={d.note}>{d.note}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1 ${meta.badge}`} title={
                        d.status === 'approved' && d.approved_by ? `Aprobado por ${d.approved_by} · ${fmt(d.approved_at)}`
                        : d.status === 'blocked' && d.blocked_by ? `Bloqueado por ${d.blocked_by} · ${fmt(d.blocked_at)}`
                        : meta.label
                      }>
                        <StatusIcon size={10} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <UsersIcon size={11} className="text-[#7A8694] shrink-0" />
                        {d.users.length === 0 ? (
                          <span className="text-xs text-[#7A8694]">—</span>
                        ) : (
                          shownUsers.map((u) => (
                            <span key={u} className="px-1 py-0.5 rounded bg-[#EEF1F5] text-[10px] text-[#2B3A45] truncate max-w-full" title={`Primer uso: ${fmt(d.first_seen_at)}`}>{u}</span>
                          ))
                        )}
                        {extraUsers > 0 && <span className="text-[10px] text-[#7A8694]" title={`${d.users.join(', ')}`}>+{extraUsers}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[#3F4D58] min-w-0">
                      <p className="truncate" title={`Última actividad: ${fmt(d.last_event_at || d.last_seen_at)}`}>{timeAgo(d.last_event_at || d.last_seen_at)}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[#3F4D58]">{d.events}</td>
                    <td className="px-3 py-2.5 min-w-0">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={notes[d.device_id] ?? d.note ?? ''}
                          onChange={(e) => setNotes((p) => ({ ...p, [d.device_id]: e.target.value }))}
                          placeholder="Ej. Recepción PC1"
                          className="w-full min-w-0 px-1.5 py-1 border border-[#E4E8EE] rounded text-[10px] focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79]"
                        />
                        <button
                          onClick={() => saveNote(d)}
                          disabled={noteSaving === d.device_id}
                          className="p-1 text-[#5F6C79] hover:text-[#2B3A45] hover:bg-[#EEF1F5] rounded disabled:opacity-40 shrink-0"
                          title="Guardar nota"
                        >
                          <Save size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right min-w-0">
                      {inConfirm ? (
                        <div className="flex items-center justify-end gap-1">
                          {d.status === 'approved' && (
                            <input
                              type="text"
                              value={blockReason}
                              onChange={(e) => setBlockReason(e.target.value)}
                              placeholder="Motivo (obligatorio)"
                              autoFocus
                              className="w-28 px-1.5 py-1 border border-rose-300 rounded text-[10px] focus:ring-2 focus:ring-rose-300/30"
                            />
                          )}
                          <button
                            onClick={() => d.status === 'approved' ? handleBlock(d) : handleApprove(d)}
                            disabled={saving === d.device_id}
                            className={`px-2 py-1 text-[11px] font-medium rounded text-white transition-all duration-200 disabled:opacity-50 ${d.status === 'approved' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                          >
                            {saving === d.device_id ? '...' : 'Sí'}
                          </button>
                          <button
                            onClick={() => { setConfirming(null); setBlockReason('') }}
                            className="p-1 text-[#5F6C79] hover:bg-[#EEF1F5] rounded"
                            title="Cancelar"
                          >
                            <XIcon size={12} />
                          </button>
                        </div>
                      ) : (
                        d.status === 'approved' ? (
                          <button
                            onClick={() => { setConfirming(d.device_id); setBlockReason('') }}
                            className="px-2 py-1 text-[11px] font-medium bg-rose-600 text-white rounded hover:bg-rose-700 transition-all duration-200"
                          >
                            Bloquear
                          </button>
                        ) : (
                          <button
                            onClick={() => { setConfirming(d.device_id); setBlockReason('') }}
                            className="px-2 py-1 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-all duration-200"
                          >
                            Aprobar
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="shrink-0 border-t border-[#E4E8EE] px-3 py-1.5 flex items-center justify-between">
          <p className="text-[10px] text-[#7A8694]">
            {counts.approved} aprobado(s) · {counts.pending} pendiente(s) · {counts.blocked} bloqueado(s) · {visible.length} mostrado(s)
          </p>
          <p className="text-[10px] text-[#7A8694] hidden sm:block">
            <Check size={10} className="inline mr-0.5 text-emerald-500" />
            Bloquear cierra sesiones activas del equipo
          </p>
        </div>
      </div>
    </div>
  )
}