import { useState, useEffect, useCallback, useMemo } from 'react'
import { devicesApi } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import {
  Monitor, ShieldCheck, ShieldAlert, Clock, RefreshCw, Save, Users as UsersIcon,
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
    const rank = { pending: 0, approved: 1, blocked: 2 } as Record<string, number>
    return [...list].sort((a, b) => {
      const ra = rank[a.status], rb = rank[b.status]
      if (ra !== rb) return ra - rb
      const ta = a.last_event_at || a.last_seen_at || ''
      const tb = b.last_event_at || b.last_seen_at || ''
      return tb.localeCompare(ta)
    })
  }, [items, filter, q])

  const FILTER_OPTIONS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'pending', label: 'Pendientes' },
    { key: 'approved', label: 'Aprobados' },
    { key: 'blocked', label: 'Bloqueados' },
  ]

  return (
    <div className="h-full flex flex-col gap-4">
      {!embedded && (
      <div className="flex items-center justify-between shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#3F4650]">Equipos</h1>
          <p className="text-sm text-[#6F7682] mt-0.5">
            Cada navegador genera un código permanente. Los equipos nuevos quedan <b>pendientes</b> hasta que usted los apruebe; si se usa un equipo no aprobado, sus acciones se resaltan en la auditoría.
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-2 text-sm text-[#5F6B80] bg-slate-50 border border-[#E3E6EB] rounded-xl hover:bg-slate-100 transition-all duration-200 flex items-center gap-2"
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
      </div>
      )}

      {pending.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-amber-800">
          <AlertTriangle size={15} className="shrink-0" />
          <p className="text-xs font-medium flex-1">
            {pending.length} equipo(s) nuevo(s) pendiente(s) de aprobación.
          </p>
          <button
            onClick={() => setFilter('pending')}
            className="text-xs font-semibold text-amber-700 hover:underline shrink-0"
          >
            Ver pendientes →
          </button>
        </div>
      )}

      <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([
          { key: 'pending' as Filter, label: 'Pendiente(s) de aprobación', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: <Clock size={18} className="text-amber-600 shrink-0" />, value: counts.pending },
          { key: 'approved' as Filter, label: 'Aprobado(s)', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: <ShieldCheck size={18} className="text-emerald-600 shrink-0" />, value: counts.approved },
          { key: 'blocked' as Filter, label: 'Bloqueado(s)', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700', icon: <ShieldAlert size={18} className="text-rose-600 shrink-0" />, value: counts.blocked },
        ]).map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`${c.bg} border rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-all duration-200 ${filter === c.key ? 'ring-2 ring-[#6E7B91]/40 scale-[1.01]' : 'hover:scale-[1.01] hover:shadow-sm'}`}
          >
            {c.icon}
            <div>
              <p className={`text-2xl font-bold ${c.text} leading-none`}>{c.value}</p>
              <p className="text-xs text-slate-500 mt-1">{c.label}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="shrink-0 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-44">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código, usuario o nota..."
            className="w-full pl-9 pr-3 py-2 border border-[#E3E6EB] rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-300/30 focus:border-slate-400 transition-all duration-200"
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {FILTER_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setFilter(o.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${filter === o.key ? 'bg-white text-[#3F4650] shadow-sm' : 'text-slate-500 hover:text-[#3F4650]'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E3E6EB] flex flex-col min-h-0 flex-1">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <table className="w-full table-fixed">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 border-b border-[#E3E6EB]">
                <th className="w-[20%] text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Equipo</th>
                <th className="w-[11%] text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
                <th className="w-[12%] text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Usuarios</th>
                <th className="w-[13%] text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actividad</th>
                <th className="w-[6%] text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Eventos</th>
                <th className="w-[12%] text-left px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nota</th>
                <th className="text-right px-4 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-400">
                    <Monitor size={28} className="mx-auto mb-2 text-slate-200" />
                    {q || filter !== 'all' ? 'Sin resultados para la búsqueda' : 'No hay equipos registrados aún. Al iniciar sesión desde un equipo nuevo aparecerá aquí.'}
                  </td>
                </tr>
              )}
              {visible.map((d) => {
                const meta = STATUS_META[d.status]
                const inConfirm = confirming === d.device_id
                const StatusIcon = meta.icon
                return (
                  <tr key={d.id} className={`border-b border-l-4 border-slate-100 ${meta.border} transition-all duration-150 hover:bg-slate-100/50`}>
                    <td className="px-4 py-4 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Monitor size={15} className="text-slate-400 shrink-0" />
                        <span className="text-sm font-mono text-slate-800 truncate" title={`Primer uso: ${fmt(d.first_seen_at)}`}>{d.device_id}</span>
                        {d.shared && (
                          <span
                            className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 shrink-0 cursor-help"
                            title={`Usado por: ${d.users.join(', ')}`}
                          >
                            Compartido
                          </span>
                        )}
                      </div>
                      {d.note && <p className="text-xs text-slate-500 mt-0.5 truncate" title={d.note}>{d.note}</p>}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1.5 ${meta.badge}`}>
                        <StatusIcon size={12} />
                        {meta.label}
                      </span>
                      {d.status === 'approved' && d.approved_by && (
                        <p className="text-[10px] text-slate-400 mt-1 truncate" title={`${fmt(d.approved_at)}`}>
                          por {d.approved_by} · {fmt(d.approved_at)}
                        </p>
                      )}
                      {d.status === 'blocked' && d.blocked_by && (
                        <p className="text-[10px] text-rose-500 mt-1 truncate" title={`${fmt(d.blocked_at)}`}>
                          por {d.blocked_by} · {fmt(d.blocked_at)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <UsersIcon size={13} className="text-slate-400 shrink-0" />
                        {d.users.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          d.users.map((u) => (
                            <span key={u} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-xs text-slate-700 truncate max-w-full">{u}</span>
                          ))
                        )}
                      </div>
                      {d.first_username && (
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate" title={`Primer uso: ${fmt(d.first_seen_at)}`}>inicial: {d.first_username}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600 min-w-0">
                      <p className="truncate" title={`Última actividad: ${fmt(d.last_event_at || d.last_seen_at)}`}>{timeAgo(d.last_event_at || d.last_seen_at)}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">{d.events}</td>
                    <td className="px-4 py-4 min-w-0">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={notes[d.device_id] ?? d.note ?? ''}
                          onChange={(e) => setNotes((p) => ({ ...p, [d.device_id]: e.target.value }))}
                          placeholder="Ej. Recepción PC1"
                          className="w-full min-w-0 px-2 py-1.5 border border-[#E3E6EB] rounded-lg text-xs focus:ring-2 focus:ring-slate-300/30 focus:border-slate-400"
                        />
                        <button
                          onClick={() => saveNote(d)}
                          disabled={noteSaving === d.device_id}
                          className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-40 shrink-0"
                          title="Guardar nota"
                        >
                          <Save size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right min-w-0">
                      {inConfirm ? (
                        <div className="flex items-center justify-end gap-1.5">
                          {d.status === 'approved' && (
                            <input
                              type="text"
                              value={blockReason}
                              onChange={(e) => setBlockReason(e.target.value)}
                              placeholder="Motivo (obligatorio)"
                              autoFocus
                              className="w-32 px-2 py-1.5 border border-rose-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-300/30"
                            />
                          )}
                          <button
                            onClick={() => d.status === 'approved' ? handleBlock(d) : handleApprove(d)}
                            disabled={saving === d.device_id}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg text-white transition-all duration-200 disabled:opacity-50 ${d.status === 'approved' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                          >
                            {saving === d.device_id ? '...' : 'Sí'}
                          </button>
                          <button
                            onClick={() => { setConfirming(null); setBlockReason('') }}
                            className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"
                            title="Cancelar"
                          >
                            <XIcon size={14} />
                          </button>
                        </div>
                      ) : (
                        d.status === 'approved' ? (
                          <button
                            onClick={() => { setConfirming(d.device_id); setBlockReason('') }}
                            className="px-3 py-1.5 text-xs font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-all duration-200"
                          >
                            Bloquear
                          </button>
                        ) : (
                          <button
                            onClick={() => { setConfirming(d.device_id); setBlockReason('') }}
                            className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all duration-200"
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
        <div className="shrink-0 border-t border-[#E3E6EB] px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-400">
            {counts.approved} aprobado(s) · {counts.pending} pendiente(s) · {counts.blocked} bloqueado(s) · {visible.length} mostrado(s)
          </p>
          <p className="text-xs text-slate-400">
            <Check size={12} className="inline mr-1 text-emerald-500" />
            El bloqueo cierra las sesiones activas del equipo y rechaza nuevos inicios de sesión.
          </p>
        </div>
      </div>
    </div>
  )
}