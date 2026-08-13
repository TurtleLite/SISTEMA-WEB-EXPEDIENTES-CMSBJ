import { useState, useEffect, useCallback } from 'react'
import { auditApi } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import { Search, ChevronLeft, ChevronRight, ScrollText, Monitor } from 'lucide-react'
import { Devices } from './Devices'

interface AuditEntry {
  id: string
  user_id: string | null
  username: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  detail: string | null
  ip_address: string | null
  device_status: 'pending' | 'approved' | 'blocked' | null
  device_shared: boolean
  created_at: string
}

const DEVICE_META: Record<string, { label: string; badge: string }> = {
  pending: { label: 'Pendiente', badge: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Aprobado', badge: 'bg-emerald-100 text-emerald-700' },
  blocked: { label: 'Bloqueado', badge: 'bg-rose-100 text-rose-700' },
}

const ACTION_LABELS: Record<string, string> = {
  login: 'Inicio de sesión',
  login_failed: 'Intento de sesión fallido',
  login_locked: 'Cuenta bloqueada',
  logout: 'Cierre de sesión',
  session_revoked: 'Sesión revocada',
  user_create: 'Usuario creado',
  user_update: 'Usuario actualizado',
  user_delete: 'Usuario eliminado',
  user_unlock: 'Usuario desbloqueado',
  device_registered: 'Equipo registrado',
  device_approved: 'Equipo aprobado',
  device_blocked: 'Equipo bloqueado',
  device_note: 'Nota de equipo',
  login_blocked: 'Equipo bloqueado rechazado',
  list_create: 'Lista creada',
  list_update: 'Lista actualizada',
  list_delete: 'Lista eliminada',
  list_import: 'Importación Excel',
  list_export_excel: 'Lista exportada a Excel',
  record_create: 'Expediente creado',
  record_update: 'Expediente actualizado',
  record_delete: 'Expediente eliminado',
  record_delete_bulk: 'Expedientes eliminados',
  record_export: 'Expedientes exportados',
  report_create: 'Reporte creado',
  report_generate: 'Reporte generado',
  report_download: 'Reporte descargado',
  report_delete: 'Reporte eliminado',
  daylist_save: 'Listado del día guardado',
  daylist_export: 'Listado del día exportado',
  daylist_delete: 'Listado del día eliminado',
}

const ENTITY_LABELS: Record<string, string> = {
  auth: 'Autenticación',
  user: 'Usuario',
  list: 'Lista',
  record: 'Expediente',
  report: 'Reporte',
  daylist: 'Listado del día',
  session: 'Sesión',
  device: 'Equipo',
}

const ACTION_OPTIONS = Object.entries(ACTION_LABELS).sort((a, b) => a[1].localeCompare(b[1]))

const fmt = (value: string) => {
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleString('es-HN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

const PAGE_SIZE = 50

export function AuditLog() {
  const [tab, setTab] = useState<'eventos' | 'equipos'>('eventos')
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [username, setUsername] = useState('')
  const [applied, setApplied] = useState(false)
  const { toast } = useNotification()

  const load = useCallback(async (p: number) => {
    const params: any = { skip: (p - 1) * PAGE_SIZE, limit: PAGE_SIZE }
    if (applied && action) params.action = action
    if (applied && entityType) params.entity_type = entityType
    if (applied && username) params.username = username
    try {
      const res = await auditApi.list(params)
      setEntries(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {
      toast('Error al cargar el registro de auditoría', 'error')
    }
  }, [action, entityType, username, applied, toast])

  useEffect(() => {
    load(page)
  }, [load, page])

  const applyFilters = () => {
    setPage(1)
    setApplied(true)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="shrink-0">
        <h1 className="font-serif text-2xl font-bold text-[#3F4650]">Auditoría</h1>
        <p className="text-sm text-[#6F7682] mt-0.5">
          Historial de quién creó, modificó, exportó o descargó información ({total} evento(s)) y administración de los equipos autorizados.
        </p>
      </div>

      <div className="shrink-0 flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('eventos')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            tab === 'eventos' ? 'bg-white text-[#3F4650] shadow-sm' : 'text-slate-500 hover:text-[#3F4650]'
          }`}
        >
          <ScrollText size={15} />
          Eventos
        </button>
        <button
          onClick={() => setTab('equipos')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            tab === 'equipos' ? 'bg-white text-[#3F4650] shadow-sm' : 'text-slate-500 hover:text-[#3F4650]'
          }`}
        >
          <Monitor size={15} />
          Equipos
        </button>
      </div>

      {tab === 'equipos' && <Devices embedded />}

      {tab === 'eventos' && (<>

      <div className="shrink-0 bg-white rounded-xl border border-[#E3E6EB] p-3 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-40">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Acción</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-300/30 focus:border-slate-400"
          >
            <option value="">Todas</option>
            {ACTION_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-40">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tipo</label>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-300/30 focus:border-slate-400"
          >
            <option value="">Todos</option>
            {Object.entries(ENTITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-40">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Usuario</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="Nombre de usuario"
            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-300/30 focus:border-slate-400"
          />
        </div>
        <button
          onClick={applyFilters}
          className="px-4 py-2 bg-[#6E7B91] text-white rounded-xl hover:bg-[#5F6B80] text-sm font-medium transition-all duration-200 flex items-center gap-2"
        >
          <Search size={15} />
          Buscar
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E3E6EB] flex flex-col min-h-0 flex-1">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 border-b border-[#E3E6EB]">
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Fecha y hora</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Usuario</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Acción</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Detalle</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Equipo</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                    <ScrollText size={28} className="mx-auto mb-2 text-slate-200" />
                    No hay eventos que coincidan
                  </td>
                </tr>
              )}
              {entries.map((e) => {
                const deviceMeta = e.device_status ? DEVICE_META[e.device_status] : null
                return (
                <tr key={e.id} className={`border-b border-slate-100 transition-all duration-150 hover:bg-slate-100/50 ${e.device_status === 'pending' ? 'bg-amber-50/40' : e.device_status === 'blocked' ? 'bg-rose-50/40' : ''}`}>
                  <td className="px-6 py-3.5 text-sm text-slate-600 whitespace-nowrap">{fmt(e.created_at)}</td>
                  <td className="px-6 py-3.5 text-sm font-medium text-slate-900">
                    {e.username || '—'}
                    {e.action === 'login_failed' && !e.username && <span className="ml-1 text-xs text-amber-600">(intento anónimo)</span>}
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      e.action === 'login' || e.action === 'user_unlock'
                        ? 'bg-emerald-100 text-emerald-700'
                        : e.action.includes('failed') || e.action.includes('delete') || e.action.includes('revoked')
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}>
                      {ACTION_LABELS[e.action] || e.action}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-slate-600">{ENTITY_LABELS[e.entity_type || ''] || e.entity_type || '—'}</td>
                  <td className="px-6 py-3.5 text-sm text-slate-600">{e.detail || '—'}</td>
                  <td className="px-6 py-3.5 text-sm text-slate-500">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono">{e.ip_address || '—'}</span>
                      {deviceMeta && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${deviceMeta.badge}`}>
                          {deviceMeta.label}
                        </span>
                      )}
                      {e.device_shared && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700" title="Equipo usado por más de un usuario">
                          Compartido
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="shrink-0 border-t border-[#E3E6EB] px-6 py-3 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Página {page} de {totalPages} · {total} evento(s)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} className="text-slate-500" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} className="text-slate-500" />
            </button>
          </div>
        </div>
      </div>
      </>)}
    </div>
  )
}