import { useState, useEffect, useCallback } from 'react'
import { devicesApi } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import {
  Monitor, ShieldCheck, ShieldAlert, Clock, RefreshCw, Save, Users as UsersIcon,
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

const STATUS_META: Record<string, { label: string; badge: string }> = {
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

export function Devices({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<DeviceItem[]>([])
  const [counts, setCounts] = useState<{ pending: number; approved: number; blocked: number }>({ pending: 0, approved: 0, blocked: 0 })
  const [saving, setSaving] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [noteSaving, setNoteSaving] = useState<string | null>(null)
  const { toast, confirm } = useNotification()

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
    if (!await confirm(`¿Aprobar el equipo ${d.device_id}?\n\nCon esto se autoriza su uso y dejará de resaltarse en la auditoría.`)) return
    setSaving(d.device_id)
    try {
      await devicesApi.approve(d.device_id, notes[d.device_id])
      toast(`Equipo ${d.device_id} aprobado`, 'success')
      await load()
    } catch {
      toast('No se pudo aprobar el equipo', 'error')
    } finally {
      setSaving(null)
    }
  }

  const handleBlock = async (d: DeviceItem) => {
    if (!await confirm(`¿Bloquear el equipo ${d.device_id}?\n\nSe cerrarán todas sus sesiones activas y no podrá iniciar sesión hasta que lo apruebe.`)) return
    setSaving(d.device_id)
    try {
      await devicesApi.block(d.device_id, notes[d.device_id])
      toast(`Equipo ${d.device_id} bloqueado`, 'success')
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

      <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <Clock size={18} className="text-amber-600 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-amber-700 leading-none">{counts.pending}</p>
            <p className="text-xs text-amber-600 mt-1">Pendiente(s) de aprobación</p>
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-emerald-700 leading-none">{counts.approved}</p>
            <p className="text-xs text-emerald-600 mt-1">Aprobado(s)</p>
          </div>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <ShieldAlert size={18} className="text-rose-600 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-rose-700 leading-none">{counts.blocked}</p>
            <p className="text-xs text-rose-600 mt-1">Bloqueado(s)</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E3E6EB] flex flex-col min-h-0 flex-1">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 border-b border-[#E3E6EB]">
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Equipo</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Usuarios</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Primera vez</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Última actividad</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Eventos</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nota</th>
                <th className="text-right px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-400">
                    <Monitor size={28} className="mx-auto mb-2 text-slate-200" />
                    No hay equipos registrados aún. Al iniciar sesión desde un equipo nuevo aparecerá aquí.
                  </td>
                </tr>
              )}
              {items.map((d) => {
                const meta = STATUS_META[d.status]
                return (
                  <tr key={d.id} className={`border-b border-slate-100 transition-all duration-150 hover:bg-slate-100/50 ${d.status === 'pending' ? 'bg-amber-50/40' : d.status === 'blocked' ? 'bg-rose-50/40' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Monitor size={15} className="text-slate-400 shrink-0" />
                        <span className="text-sm font-mono text-slate-800">{d.device_id}</span>
                        {d.shared && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700" title="Usado por más de un usuario">
                            Compartido
                          </span>
                        )}
                      </div>
                      {d.note && <p className="text-xs text-slate-500 mt-0.5">{d.note}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${meta.badge}`}>{meta.label}</span>
                      {d.status === 'blocked' && d.blocked_by && (
                        <p className="text-[10px] text-rose-500 mt-1">por {d.blocked_by} · {fmt(d.blocked_at)}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <UsersIcon size={13} className="text-slate-400" />
                        {d.users.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          d.users.map((u) => (
                            <span key={u} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-xs text-slate-700">{u}</span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                      {fmt(d.first_seen_at)}
                      {d.first_username && <p className="text-xs text-slate-400">inicial: {d.first_username}</p>}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">{fmt(d.last_event_at || d.last_seen_at)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{d.events}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={notes[d.device_id] ?? d.note ?? ''}
                          onChange={(e) => setNotes((p) => ({ ...p, [d.device_id]: e.target.value }))}
                          placeholder="Ej. Recepción PC1"
                          className="w-36 px-2 py-1.5 border border-[#E3E6EB] rounded-lg text-xs focus:ring-2 focus:ring-slate-300/30 focus:border-slate-400"
                        />
                        <button
                          onClick={() => saveNote(d)}
                          disabled={noteSaving === d.device_id}
                          className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-40"
                          title="Guardar nota"
                        >
                          <Save size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      {d.status !== 'approved' ? (
                        <button
                          onClick={() => handleApprove(d)}
                          disabled={saving === d.device_id}
                          className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all duration-200 disabled:opacity-50"
                        >
                          {saving === d.device_id ? '...' : 'Aprobar'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBlock(d)}
                          disabled={saving === d.device_id}
                          className="px-3 py-1.5 text-xs font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-all duration-200 disabled:opacity-50"
                        >
                          {saving === d.device_id ? '...' : 'Bloquear'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="shrink-0 border-t border-[#E3E6EB] px-6 py-3">
          <p className="text-xs text-slate-400">
            {pending.length > 0
              ? `${pending.length} equipo(s) pendiente(s): sus acciones se resaltan en la auditoría hasta que los apruebe.`
              : 'No hay equipos pendientes de aprobación.'}
          </p>
        </div>
      </div>
    </div>
  )
}