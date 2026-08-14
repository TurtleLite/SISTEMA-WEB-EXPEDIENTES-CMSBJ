import { useState, useEffect, useCallback } from 'react'
import { auditApi } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import { Search, ChevronLeft, ChevronRight, ScrollText, Monitor, Download, X as XIcon, ShieldQuestion, ShieldAlert, Users as UsersIcon, FileText } from 'lucide-react'
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
  audit_export: 'Auditoría exportada',
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

const GENERIC_DETAIL: Record<string, string> = {
  login: 'inició sesión',
  login_failed: 'intento de sesión fallido',
  login_locked: 'cuenta bloqueada',
  logout: 'finalizó sesión',
  session_revoked: 'cerró sesión',
  user_create: 'creó usuario',
  user_update: 'actualizó usuario',
  user_delete: 'eliminó usuario',
  user_unlock: 'desbloqueó usuario',
  device_registered: 'registró equipo',
  device_approved: 'aprobó equipo',
  device_blocked: 'bloqueó equipo',
  device_note: 'anotó equipo',
  login_blocked: 'equipo bloqueado rechazado',
  list_create: 'creó lista',
  list_update: 'actualizó lista',
  list_delete: 'eliminó lista',
  list_import: 'importó expedientes',
  list_export_excel: 'exportó lista',
  record_create: 'creó expediente',
  record_update: 'actualizó expediente',
  record_delete: 'eliminó expediente',
  record_delete_bulk: 'eliminó expedientes',
  record_export: 'exportó expedientes',
  report_create: 'creó reporte',
  report_generate: 'generó reporte',
  report_download: 'descargó reporte',
  report_delete: 'eliminó reporte',
  daylist_save: 'guardó listado del día',
  daylist_export: 'exportó listado del día',
  daylist_delete: 'eliminó listado del día',
  audit_export: 'exportó eventos técnicos',
}

const genericDetail = (action: string, detail: string | null): string =>
  GENERIC_DETAIL[action] || (detail ? 'detalle' : '—')

const ACTION_OPTIONS = Object.entries(ACTION_LABELS).sort((a, b) => a[1].localeCompare(b[1]))

const fmt = (value: string) => {
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleString('es-HN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

const timeAgo = (value: string): string => {
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

const PAGE_SIZE = 50

export function AuditLog() {
  const [tab, setTab] = useState<'eventos' | 'equipos'>('eventos')
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [username, setUsername] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [applied, setApplied] = useState(false)
  const [selected, setSelected] = useState<AuditEntry | null>(null)
  const [quick, setQuick] = useState<{ pending: boolean; blocked: boolean; shared: boolean }>({ pending: false, blocked: false, shared: false })
  const { toast } = useNotification()

  const load = useCallback(async (p: number) => {
    const params: any = { skip: (p - 1) * PAGE_SIZE, limit: PAGE_SIZE }
    if (applied && action) params.action = action
    if (applied && entityType) params.entity_type = entityType
    if (applied && username) params.username = username
    if (applied && fechaDesde) params.fecha_desde = fechaDesde
    if (applied && fechaHasta) params.fecha_hasta = fechaHasta
    try {
      const res = await auditApi.list(params)
      setEntries(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {
      toast('Error al cargar el registro de auditoría', 'error')
    }
  }, [action, entityType, username, fechaDesde, fechaHasta, applied, toast])

  useEffect(() => {
    load(page)
  }, [load, page])

  const applyFilters = () => {
    setPage(1)
    setApplied(true)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const filtered = entries.filter((e) => {
    if (quick.pending && e.device_status !== 'pending') return false
    if (quick.blocked && e.device_status !== 'blocked') return false
    if (quick.shared && !e.device_shared) return false
    return true
  })

  const toggleQuick = (key: 'pending' | 'blocked' | 'shared') => {
    setQuick((p) => ({ ...p, [key]: !p[key] }))
    setSelected(null)
  }

  const handleExportExcel = async () => {
    try {
      const params: any = {}
      if (applied && action) params.action = action
      if (applied && entityType) params.entity_type = entityType
      if (applied && username) params.username = username
      if (applied && fechaDesde) params.fecha_desde = fechaDesde
      if (applied && fechaHasta) params.fecha_hasta = fechaHasta
      const res = await auditApi.exportExcel(params)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers['content-disposition']
      const match = cd && cd.match(/filename="?(.+?)"?\s*$/i)
      a.download = match ? match[1] : `EVENTOS_TECNICOS_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
      toast('Eventos exportados a Excel', 'success')
    } catch {
      toast('Error al exportar los eventos', 'error')
    }
  }

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
        <div className="flex items-center gap-2 self-center flex-wrap">
          <button
            onClick={() => toggleQuick('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 border ${quick.pending ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-[#E3E6EB] text-slate-500 hover:border-amber-300'}`}
            title="Solo eventos de equipos pendientes de aprobación"
          >
            <ShieldQuestion size={13} />
            Pendiente
          </button>
          <button
            onClick={() => toggleQuick('blocked')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 border ${quick.blocked ? 'bg-rose-50 border-rose-300 text-rose-700' : 'border-[#E3E6EB] text-slate-500 hover:border-rose-300'}`}
            title="Solo eventos de equipos bloqueados"
          >
            <ShieldAlert size={13} />
            Bloqueado
          </button>
          <button
            onClick={() => toggleQuick('shared')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 border ${quick.shared ? 'bg-violet-50 border-violet-300 text-violet-700' : 'border-[#E3E6EB] text-slate-500 hover:border-violet-300'}`}
            title="Solo eventos de equipos compartidos entre usuarios"
          >
            <UsersIcon size={13} />
            Compartido
          </button>
          <button
            onClick={handleExportExcel}
            disabled={total === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border border-[#E3E6EB] text-slate-500 hover:border-slate-400 flex items-center gap-1.5 disabled:opacity-40"
            title="Exportar todos los eventos (con los filtros aplicados) a Excel con encabezado institucional"
          >
            <Download size={13} />
            Exportar
          </button>
        </div>
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
        <div className="min-w-32">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            max={fechaHasta || undefined}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-300/30 focus:border-slate-400"
          />
        </div>
        <div className="min-w-32">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            min={fechaDesde || undefined}
            onChange={(e) => setFechaHasta(e.target.value)}
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
        {applied && (action || entityType || username || fechaDesde || fechaHasta) && (
          <button
            onClick={() => {
              setAction(''); setEntityType(''); setUsername(''); setFechaDesde(''); setFechaHasta(''); setApplied(false); setPage(1)
            }}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-all duration-200 border border-[#E3E6EB] flex items-center gap-1.5"
          >
            <XIcon size={14} />
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-[#E3E6EB] flex flex-col min-h-0 flex-1">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full table-fixed">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 border-b border-[#E3E6EB]">
                <th className="w-[15%] text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Fecha y hora</th>
                <th className="w-[12%] text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Usuario</th>
                <th className="w-[15%] text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Acción</th>
                <th className="w-[10%] text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo</th>
                <th className="w-[22%] text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Detalle</th>
                <th className="w-[26%] text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Equipo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                    <ScrollText size={28} className="mx-auto mb-2 text-slate-200" />
                    {quick.pending || quick.blocked || quick.shared ? 'No hay eventos que coincidan con el filtro rápido' : 'No hay eventos que coincidan'}
                  </td>
                </tr>
              )}
              {filtered.map((e) => {
                const deviceMeta = e.device_status ? DEVICE_META[e.device_status] : null
                return (
                <tr key={e.id} onClick={() => setSelected(e)} className={`border-b border-l-4 border-l-transparent border-slate-100 transition-all duration-150 hover:bg-slate-100/50 cursor-pointer ${e.device_status === 'pending' ? 'bg-amber-50/40 border-l-amber-400' : e.device_status === 'blocked' ? 'bg-rose-50/40 border-l-rose-500' : ''} ${selected?.id === e.id ? 'bg-[#6E7B91]/10 border-l-[#6E7B91]' : ''}`}>
                  <td className="px-6 py-3.5 text-sm text-slate-600 whitespace-nowrap overflow-hidden text-ellipsis" title={`Fecha exacta: ${fmt(e.created_at)}`}>{timeAgo(e.created_at)}</td>
                  <td className="px-6 py-3.5 text-sm font-medium text-slate-900 min-w-0">
                    <span className="block truncate" title={e.username || ''}>
                      {e.username || '—'}
                    </span>
                    {e.action === 'login_failed' && !e.username && <span className="ml-1 text-xs text-amber-600">(intento anónimo)</span>}
                  </td>
                  <td className="px-6 py-3.5 min-w-0">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium inline-block max-w-full truncate align-middle ${
                      e.action === 'login' || e.action === 'user_unlock'
                        ? 'bg-emerald-100 text-emerald-700'
                        : e.action.includes('failed') || e.action.includes('delete') || e.action.includes('revoked')
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-slate-100 text-slate-600'
                    }`} title={ACTION_LABELS[e.action] || e.action}>
                      {ACTION_LABELS[e.action] || e.action}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-slate-600 min-w-0">
                    <span className="block truncate" title={ENTITY_LABELS[e.entity_type || ''] || e.entity_type || ''}>
                      {ENTITY_LABELS[e.entity_type || ''] || e.entity_type || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-slate-600 min-w-0">
                    <span className="block truncate" title={e.detail || ''}>
                      {genericDetail(e.action, e.detail)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-slate-500 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono truncate min-w-0" title={e.ip_address || ''}>{e.ip_address || '—'}</span>
                      {deviceMeta && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${deviceMeta.badge}`}>
                          {deviceMeta.label}
                        </span>
                      )}
                      {e.device_shared && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 shrink-0" title="Equipo usado por más de un usuario">
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
            Página {page} de {totalPages} · {total} evento(s){filtered.length !== entries.length ? ` · ${filtered.length} visibles` : ''}
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

      {selected && (
        <aside className="shrink-0 w-80 bg-white rounded-xl shadow-sm border border-[#E3E6EB] flex flex-col min-h-0">
          <div className="shrink-0 px-4 py-3 border-b border-[#E3E6EB] flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#3F4650] flex items-center gap-2">
              <FileText size={14} className="text-slate-400" />
              Detalle del evento
            </h3>
            <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
              <XIcon size={14} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Fecha y hora</p>
              <p className="text-slate-800">{fmt(selected.created_at)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Acción</p>
              <p className="text-slate-800">{ACTION_LABELS[selected.action] || selected.action}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Usuario</p>
              <p className="text-slate-800">{selected.username || '—'}{selected.action === 'login_failed' && !selected.username ? ' (intento anónimo)' : ''}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tipo / Entidad</p>
              <p className="text-slate-800">
                {ENTITY_LABELS[selected.entity_type || ''] || selected.entity_type || '—'}
                {selected.entity_id ? <span className="font-mono text-xs text-slate-500"> · {selected.entity_id}</span> : null}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Equipo</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded-md">{selected.ip_address || '—'}</span>
                {selected.device_status && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${DEVICE_META[selected.device_status].badge}`}>
                    {DEVICE_META[selected.device_status].label}
                  </span>
                )}
                {selected.device_shared && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700">Compartido</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Detalle</p>
              <p className="text-slate-700 break-words whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2 text-xs">{selected.detail || '—'}</p>
            </div>
          </div>
        </aside>
      )}
      </div>
      </>)}
    </div>
  )
}