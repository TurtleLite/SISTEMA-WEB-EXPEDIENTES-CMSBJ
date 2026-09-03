import { useState, useEffect, useRef } from 'react'
import { reportsApi, listsApi } from '../services/api'
import { Report, ListDefinition } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { Plus, FileSpreadsheet, Download, Trash2, Eye, X, RefreshCw, Check, ChevronDown } from 'lucide-react'
import { normalizeText } from '../utils/format'
import ScrollSelect from '../components/ScrollSelect'

const STATUS_OPTIONS = ['En lista', 'En espera', 'Reprogramar', 'Cancelado', 'Fuera de perfil San Benito', 'Operado', 'No apto para cirugía', 'No se presentó']

const CRITICIDAD_LABELS: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  Baja: 'Baja',
  Media: 'Media',
  Alta: 'Alta',
}

const criticidadLabel = (v: string) => CRITICIDAD_LABELS[v] || v

interface ReportForm {
  name: string
  description: string
  list_definition_id: string
  especialidad: string
  perfil: string
  criticidad: string
  compensado: string
  estatus_cirugia: string
  diagnostico: string
  fecha_desde: string
  fecha_hasta: string
  columns_selected: string[]
}

const EMPTY_FORM: ReportForm = {
  name: '', description: '', list_definition_id: '', especialidad: '', perfil: '',
  criticidad: '', compensado: '', estatus_cirugia: '', diagnostico: '', fecha_desde: '', fecha_hasta: '', columns_selected: [],
}

interface PreviewData {
  name: string
  filters?: Record<string, any>
  columns: string[]
  records: Record<string, any>[]
  count: number
  record_ids?: string[]
  created_by_breakdown?: { full_name: string; count: number }[]
}

const isDateReport = (p: PreviewData | null): boolean =>
  !!(p?.filters?.fecha_desde || p?.filters?.fecha_hasta)

export function Reports() {
  const { user } = useAuth()
  const { toast } = useNotification()

  const isReportesOftalmologia = (): boolean =>
    user?.role === 'reportes_oftalmologia'

  const hasReportsAccess = (): boolean =>
    user?.role === 'admin' || user?.role === 'direccion' || user?.role === 'direccion_medica' || user?.role === 'reportes_oftalmologia'

  const canReorder = (): boolean =>
    user?.role === 'admin' || user?.role === 'direccion' || user?.role === 'direccion_medica'

  const criticidadLabel = (v: string) => CRITICIDAD_LABELS[v] || v

  const fmtFecha = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString('es-HN')
  }

  const anyFilter = (f: ReportForm): boolean =>
    !!(f.perfil || f.criticidad || f.compensado || f.estatus_cirugia || f.diagnostico || f.fecha_desde || f.fecha_hasta)

  const buildAutoName = (f: ReportForm): string => {
    const parts: string[] = []
    const hasDates = !!(f.fecha_desde || f.fecha_hasta)
    parts.push(hasDates ? 'Expedientes creados' : 'Expedientes')
    if (hasDates) {
      const range = []
      if (f.fecha_desde) range.push(fmtFecha(f.fecha_desde))
      if (f.fecha_hasta) range.push(fmtFecha(f.fecha_hasta))
      if (range.length) parts.push(range.join(' – '))
    }
    // Para el rol reportes_oftalmologia, la especialidad siempre es oftalmologia y no es un filtro seleccionable
    if (f.especialidad && !isReportesOftalmologia()) parts.push(f.especialidad)
    if (f.perfil) parts.push(`Perfil ${f.perfil}`)
    if (f.criticidad) parts.push(`Crítica ${criticidadLabel(f.criticidad).toLowerCase()}`)
    if (f.compensado) parts.push(f.compensado === 'Sí' ? 'Compensados' : 'Descompensados')
    if (f.estatus_cirugia) parts.push(f.estatus_cirugia)
    if (f.diagnostico) parts.push(`Diagnóstico: ${f.diagnostico.trim()}`)
    if (parts.length === 1) return 'Expedientes completos'
    return parts.join(' · ')
  }

  const [reports, setReports] = useState<Report[]>([])
  const [systemListId, setSystemListId] = useState<string>('')
  const [especialidades, setEspecialidades] = useState<string[]>([])
  const [perfiles, setPerfiles] = useState<string[]>([])
  const [criticidades, setCriticidades] = useState<string[]>([])
  const [diagnosticos, setDiagnosticos] = useState<string[]>([])
  const [diagOpen, setDiagOpen] = useState(false)
  const diagRef = useRef<HTMLDivElement>(null)
  const [showModal, setShowModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewReportId, setPreviewReportId] = useState<string | number | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderSaved, setOrderSaved] = useState(false)
  const [form, setForm] = useState<ReportForm>(EMPTY_FORM)
  const nameTouched = useRef(false)

  const setFilter = (patch: Partial<ReportForm>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch }
      if (!nameTouched.current && anyFilter(next)) next.name = buildAutoName(next)
      return next
    })
  }

  const regenName = () => {
    nameTouched.current = false
    setForm((p) => ({ ...p, name: buildAutoName(p) }))
  }

  const clearFilters = () => {
    setForm((prev) => {
      const next = { ...prev, perfil: '', criticidad: '', compensado: '', estatus_cirugia: '', diagnostico: '', fecha_desde: '', fecha_hasta: '' }
      if (!isReportesOftalmologia()) {
        next.especialidad = ''
      }
      if (!nameTouched.current) next.name = buildAutoName(next)
      return next
    })
  }

  const applyDateShortcut = (kind: 'hoy' | 'mes') => {
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const now = new Date()
    if (kind === 'hoy') setFilter({ fecha_desde: iso(now), fecha_hasta: iso(now) })
    else {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      setFilter({ fecha_desde: iso(start), fecha_hasta: iso(now) })
    }
  }

  const loadEspecialidades = async (listId: string) => {
    try {
      const res = await listsApi.getEspecialidades(listId)
      setEspecialidades(res.data || [])
    } catch { setEspecialidades([]) }
  }

  const loadPerfiles = async (listId: string) => {
    try {
      const res = await listsApi.getFieldValues(listId, 'perfil')
      setPerfiles(res.data || [])
    } catch { setPerfiles([]) }
  }

  const loadCriticidades = async (listId: string) => {
    try {
      const res = await listsApi.getFieldValues(listId, 'criticidad')
      setCriticidades(res.data || [])
    } catch { setCriticidades([]) }
  }

  const loadDiagnosticos = async (listId: string) => {
    try {
      const res = await listsApi.getFieldValues(listId, 'diagnostico')
      setDiagnosticos(res.data || [])
    } catch { setDiagnosticos([]) }
  }

  const loadReports = async () => {
    try {
      const res = await reportsApi.list()
      setReports(res.data)
    } catch (err) { console.error(err) }
  }

  const loadLists = async () => {
    try {
      const res = await listsApi.list()
      const systemList = res.data.find((l: ListDefinition) => l.is_system)
      if (systemList) {
        setSystemListId(systemList.id)
        const initialForm = { ...EMPTY_FORM, list_definition_id: systemList.id }
        if (isReportesOftalmologia()) {
          initialForm.especialidad = 'oftalmologia'
        }
        setForm(initialForm)
        loadEspecialidades(systemList.id)
        loadPerfiles(systemList.id)
        loadCriticidades(systemList.id)
        loadDiagnosticos(systemList.id)
      }
    } catch (err) { console.error(err) }
  }

  useEffect(() => { loadReports(); loadLists() }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (diagRef.current && !diagRef.current.contains(e.target as Node)) setDiagOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast('El nombre del reporte es obligatorio', 'error')
      return
    }
    if (!systemListId) {
      toast('No se encontró la lista de expedientes', 'error')
      return
    }
    try {
      await reportsApi.create({
        ...form,
        list_definition_id: systemListId,
        filters: {
          especialidad: form.especialidad || undefined,
          perfil: form.perfil || undefined,
          criticidad: form.criticidad || undefined,
          compensado: form.compensado || undefined,
          estatus_cirugia: form.estatus_cirugia || undefined,
          diagnostico: form.diagnostico.trim() || undefined,
          fecha_desde: form.fecha_desde || undefined,
          fecha_hasta: form.fecha_hasta || undefined,
        },
      })
      setShowModal(false)
      nameTouched.current = false
      const resetForm = { ...EMPTY_FORM, list_definition_id: systemListId }
      if (isReportesOftalmologia()) {
        resetForm.especialidad = 'oftalmologia'
      }
      setForm(resetForm)
      setEspecialidades([])
      setPerfiles([])
      setCriticidades([])
      setDiagnosticos([])
      loadReports()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al crear reporte', 'error')
    }
  }

  const handlePreview = async (reportId: string | number) => {
    setLoadingPreview(true)
    setPreviewReportId(reportId)
    try {
      const res = await reportsApi.preview(reportId)
      setPreview(res.data)
      setOrderSaved(false)
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al cargar vista previa', 'error')
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    const tr = e.currentTarget as HTMLTableRowElement
    const clone = tr.cloneNode(true) as HTMLTableRowElement
    const noCell = clone.querySelector('td')
    if (noCell) noCell.style.visibility = 'hidden'
    clone.style.position = 'absolute'
    clone.style.left = '-9999px'
    clone.style.width = `${tr.offsetWidth}px`
    clone.style.background = '#fff'
    clone.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
    document.body.appendChild(clone)
    e.dataTransfer.setDragImage(clone, 16, 10)
    setTimeout(() => clone.remove(), 0)
  }

  const handleDrop = async (targetIdx: number) => {
    setDragOverIdx(null)
    if (!preview || previewReportId === null || dragIdx === null || dragIdx === targetIdx || !canReorder() || isDateReport(preview)) {
      setDragIdx(null)
      return
    }
    const from = dragIdx
    const to = targetIdx
    const nextRecords = [...preview.records]
    const [moved] = nextRecords.splice(from, 1)
    const adjustedTo = nextRecords.findIndex((r) => r._id === preview.records[to]._id)
    if (adjustedTo < 0) { setDragIdx(null); return }
    nextRecords.splice(adjustedTo, 0, moved)
    const nextIds = nextRecords.map((r) => r._id).filter(Boolean)
    setPreview({ ...preview, records: nextRecords, record_ids: nextIds })
    setOrderSaved(false)
    setDragIdx(null)
    setSavingOrder(true)
    try {
      await reportsApi.saveOrder(previewReportId, nextIds)
      setOrderSaved(true)
      toast('Orden del reporte guardado', 'success')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al guardar el orden', 'error')
    } finally {
      setSavingOrder(false)
    }
  }

  const handleGenerate = async (reportId: string | number) => {
    try {
      await reportsApi.generateExcel(reportId)
      loadReports()
      toast('Reporte Excel generado correctamente', 'success')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al generar reporte', 'error')
    }
  }

  const handleDownload = async (reportId: string | number) => {
    try {
      const res = await reportsApi.download(reportId)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers['content-disposition']
      const match = cd && cd.match(/filename="?(.+?)"?\s*$/i)
      a.download = match ? match[1] : `reporte_${reportId}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      toast('Error al descargar. Genere el reporte primero.', 'error')
    }
  }

  const handleDelete = async (reportId: string) => {
    try {
      await reportsApi.delete(reportId)
      loadReports()
      setDeleteConfirm(null)
      toast('Reporte eliminado', 'success')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al eliminar', 'error')
    }
  }

  const filterBadges = (filters?: Record<string, any>) => {
    const items: { label: string; value: string; cls: string }[] = []
    if (filters?.especialidad) items.push({ label: 'Especialidad', value: filters.especialidad, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' })
    if (filters?.perfil) items.push({ label: 'Perfil', value: filters.perfil, cls: 'bg-sky-50 text-sky-700 border-sky-200' })
    if (filters?.criticidad) items.push({ label: 'Criticidad', value: criticidadLabel(filters.criticidad), cls: 'bg-rose-50 text-rose-700 border-rose-200' })
    if (filters?.compensado) items.push({ label: 'Compensado', value: filters.compensado, cls: 'bg-teal-50 text-teal-700 border-teal-200' })
    if (filters?.estatus_cirugia) items.push({ label: 'Estatus', value: filters.estatus_cirugia, cls: 'bg-violet-50 text-violet-700 border-violet-200' })
    if (filters?.diagnostico) items.push({ label: 'Diagnóstico', value: filters.diagnostico, cls: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' })
    if (filters?.fecha_desde) items.push({ label: 'Desde', value: filters.fecha_desde, cls: 'bg-amber-50 text-amber-700 border-amber-200' })
    if (filters?.fecha_hasta) items.push({ label: 'Hasta', value: filters.fecha_hasta, cls: 'bg-amber-50 text-amber-700 border-amber-200' })
    return items
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#1E2A32]">Reportes</h1>
        </div>
        {(hasReportsAccess()) && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-[#0F766E] text-white px-4 py-2 rounded-xl hover:bg-[#115E59] shadow-sm hover:shadow-md transition-all duration-200  text-sm font-medium"
          >
            <Plus size={16} />
            Nuevo Reporte
          </button>
        )}
      </div>

      {reports.length === 0 && (
        <div className="text-center py-16 text-[#7A8694]">
          <p className="text-sm">No hay reportes creados todavía. Crea el primero con "Nuevo Reporte".</p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => {
          const badges = filterBadges(report.filters)
          return (
          <div key={report.id} className="bg-white rounded-xl shadow-sm border border-[#E4E8EE] p-6 hover:shadow-md hover:border-[#E4E8EE] transition-all duration-200">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-[#1E2A32]">{report.name}</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#F7F8FA] text-[#115E59] rounded-lg text-xs font-semibold border border-[#E4E8EE] whitespace-nowrap">
                {report.record_count ?? 0} registros
              </span>
            </div>
            {report.description && (
              <p className="text-sm text-[#5F6C79] mt-1 mb-3">{report.description}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {badges.length === 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#EEF1F5] text-[#5F6C79] rounded-lg text-xs font-medium border border-[#E4E8EE]">
                  General
                </span>
              )}
              {badges.map((b, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border">
                  {b.label}: {b.value}
                </span>
              ))}
            </div>
            {report.created_by_breakdown && report.created_by_breakdown.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#E4E8EE]">
                <p className="text-[0.6875rem] font-semibold text-[#7A8694] uppercase tracking-wider mb-1.5">Expedientes por usuario</p>
                <div className="space-y-1">
                  {report.created_by_breakdown.map((b) => (
                    <div key={b.full_name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#3F4D58] truncate">{b.full_name}</span>
                      <span className="font-semibold text-[#1E2A32] shrink-0">{b.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={() => handlePreview(report.id)}
                className="flex items-center gap-1 px-3 py-1.5 bg-sky-50 text-sky-700 rounded-xl text-xs font-medium hover:bg-sky-100 border border-sky-200 transition-all duration-200"
              >
                <Eye size={14} />
                Vista previa
              </button>
              <button
                onClick={() => handleGenerate(report.id)}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#EEF1F5] text-[#3F4D58] rounded-xl text-xs font-medium hover:bg-[#EEF1F5] border border-[#E4E8EE] transition-all duration-200"
              >
                <FileSpreadsheet size={14} />
                Generar Excel
              </button>
              {report.file_path_excel && (
                <button
                  onClick={() => handleDownload(report.id)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-medium hover:bg-emerald-100 border border-emerald-200 transition-all duration-200"
                >
                  <Download size={14} />
                  Descargar
                </button>
              )}
            </div>
            <div className="flex justify-between items-end mt-4 pt-2 border-t border-[#E4E8EE]">
              <span className="text-[0.6875rem] text-[#7A8694]">
                Creado el {new Date(report.created_at).toLocaleDateString('es-ES')}
              </span>
        {(hasReportsAccess()) && (
                deleteConfirm === report.id ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[#5F6C79]">¿Eliminar?</span>
                    <button
                      onClick={() => handleDelete(report.id)}
                      className="px-2 py-1 bg-red-400 text-white rounded-lg hover:bg-red-500 transition-all duration-200"
                    >
                      Sí
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1 bg-[#EEF1F5] text-[#3F4D58] rounded-lg hover:bg-[#D5DBE3] transition-all duration-200"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(report.id)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:bg-red-50 rounded-lg transition-all duration-200"
                  >
                    <Trash2 size={12} />
                    Eliminar
                  </button>
                )
              )}
            </div>
          </div>
          )
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-[#0F172A]/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl px-5 py-4 w-[95vw] max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-lg font-bold text-[#1E2A32]">Nuevo Reporte</h2>
              <button onClick={() => setShowModal(false)} className="text-[#7A8694] hover:text-[#3F4D58] transition-colors duration-200">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <input
                  placeholder="Nombre del reporte *"
                  value={form.name}
                  onChange={(e) => { nameTouched.current = true; setForm({ ...form, name: e.target.value }) }}
                  className="w-full px-3 py-2.5 pr-10 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                />
                <button
                  onClick={regenName}
                  title="Regenerar nombre automático según los filtros"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A8694] hover:text-[#0F766E] transition-colors duration-200"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
              <input
                placeholder="Descripción (opcional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
              />

              <div className="border border-[#E4E8EE] rounded-xl p-4 space-y-4 bg-[#F7F8FA]/50">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#115E59] uppercase tracking-wider">Filtros</p>
                  {anyFilter(form) && (
                    <button
                      onClick={clearFilters}
                      className="text-[0.6875rem] font-medium text-[#5F6C79] hover:text-red-600 transition-colors duration-200"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-[#3F4D58]">Periodo de creación</label>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => applyDateShortcut('hoy')}
                          className="text-[0.6875rem] font-medium text-[#0F766E] hover:bg-[#EEF1F5] rounded-lg px-2 py-0.5 transition-colors duration-200"
                        >
                          Hoy
                        </button>
                        <button
                          onClick={() => applyDateShortcut('mes')}
                          className="text-[0.6875rem] font-medium text-[#0F766E] hover:bg-[#EEF1F5] rounded-lg px-2 py-0.5 transition-colors duration-200"
                        >
                          Este mes
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="date"
                        value={form.fecha_desde}
                        max={form.fecha_hasta || undefined}
                        onChange={(e) => setFilter({ fecha_desde: e.target.value })}
                        className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                      />
                      <input
                        type="date"
                        value={form.fecha_hasta}
                        min={form.fecha_desde || undefined}
                        onChange={(e) => setFilter({ fecha_hasta: e.target.value })}
                        className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                      />
                    </div>
                    <p className="text-[0.6875rem] text-[#7A8694] mt-1">
                      Sin fechas = todos los expedientes, sin importar cuándo se crearon.
                    </p>
                  </div>

<div>
                      <label className="block text-xs font-medium text-[#3F4D58] mb-1">Especialidad</label>
                      <ScrollSelect
                        value={form.especialidad}
                        onChange={(v) => setFilter({ especialidad: v })}
                        allowEmpty
                        disabled={!form.list_definition_id || isReportesOftalmologia()}
                        options={especialidades.map((esp) => ({ value: esp, label: esp }))}
                        placeholder="Todas"
                        buttonClassName="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm"
                        panelClassName="rounded-xl"
                      />
                      {isReportesOftalmologia() && (
                        <p className="text-[0.6875rem] text-[#7A8694] mt-1">
                          Especialidad fijada a Oftalmología para este rol.
                        </p>
                      )}
                    </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3F4D58] mb-1">Estatus de cirugía</label>
                    <select
                      value={form.estatus_cirugia}
                      onChange={(e) => setFilter({ estatus_cirugia: e.target.value })}
                      className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                    >
                      <option value="">Todos</option>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3F4D58] mb-1">Diagnóstico (busca parte del texto)</label>
                    <div ref={diagRef} className="relative">
                      <div className={`flex items-center pl-3 pr-2.5 py-2.5 text-sm rounded-xl border transition-colors duration-150 ${
                        form.diagnostico
                          ? 'bg-[#0F766E] text-white border-[#0F766E]'
                          : 'bg-white text-[#7A8694] border-[#E4E8EE] focus-within:ring-2 focus-within:ring-[#8E9AA6] focus-within:border-[#5F6C79]'
                      }`}>
                        <input
                          type="text"
                          value={form.diagnostico}
                          onChange={(e) => setFilter({ diagnostico: e.target.value })}
                          onFocus={() => setDiagOpen(true)}
                          placeholder={form.diagnostico ? '' : 'Ej. hernia, cistocele, mioma...'}
                          className={`w-full text-sm bg-transparent outline-none ${form.diagnostico ? 'placeholder:text-white/60 text-white' : 'placeholder:text-[#8E9AA6] text-[#3F4D58]'}`}
                        />
                        {form.diagnostico ? (
                          <span
                            onClick={(e) => { e.stopPropagation(); setFilter({ diagnostico: '' }); setDiagOpen(false) }}
                            className="hover:bg-white/20 rounded p-0.5 leading-none shrink-0"
                            title="Quitar filtro"
                          >
                            <X size={14} />
                          </span>
                        ) : (
                          <ChevronDown size={16} className="text-[#8E9AA6] shrink-0" />
                        )}
                      </div>
                      {diagOpen && diagnosticos.length > 0 && (
                        <div className="absolute left-0 top-full mt-1.5 z-50 w-80 max-h-72 overflow-y-auto bg-white border border-[#E4E8EE] rounded-xl shadow-xl py-1.5">
                          <button
                            onClick={() => { setFilter({ diagnostico: '' }); setDiagOpen(false) }}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 transition-colors duration-150 ${
                              form.diagnostico === '' ? 'text-[#0F766E] font-medium bg-[#EEF1F5]' : 'text-[#3F4D58] hover:bg-[#F7F8FA]'
                            }`}
                          >
                            Todos los diagnósticos
                            {form.diagnostico === '' && <Check size={14} />}
                          </button>
                          <div className="mx-3 my-1 border-t border-[#E4E8EE]" />
                          {diagnosticos
                            .filter((d) => !form.diagnostico || normalizeText(d).includes(normalizeText(form.diagnostico)))
                            .slice(0, 200)
                            .map((d) => {
                              const active = form.diagnostico !== '' && normalizeText(d) === normalizeText(form.diagnostico)
                              return (
                                <button
                                  key={d}
                                  onClick={() => { setFilter({ diagnostico: d === form.diagnostico ? '' : d }); setDiagOpen(false) }}
                                  className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 transition-colors duration-150 ${
                                    active ? 'text-[#0F766E] font-medium bg-[#EEF1F5]' : 'text-[#3F4D58] hover:bg-[#F7F8FA]'
                                  }`}
                                  title={d}
                                >
                                  <span className="truncate">{d}</span>
                                  {active && <Check size={14} />}
                                </button>
                              )
                            })}
                          {diagnosticos.filter((d) => !form.diagnostico || normalizeText(d).includes(normalizeText(form.diagnostico))).length === 0 && (
                            <div className="px-4 py-3 text-xs text-[#8E9AA6] text-center">
                              Ningún diagnóstico coincide; se buscará por coincidencia parcial.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3F4D58] mb-1">Perfil</label>
                    <select
                      value={form.perfil}
                      onChange={(e) => setFilter({ perfil: e.target.value })}
                      disabled={!form.list_definition_id}
                      className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200 disabled:opacity-50"
                    >
                      <option value="">Todos</option>
                      {perfiles.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3F4D58] mb-1">Criticidad clínica</label>
                    <select
                      value={form.criticidad}
                      onChange={(e) => setFilter({ criticidad: e.target.value })}
                      disabled={!form.list_definition_id}
                      className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200 disabled:opacity-50"
                    >
                      <option value="">Todas</option>
                      {criticidades.map((c) => (
                        <option key={c} value={c}>{criticidadLabel(c)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#3F4D58] mb-1">Compensado (Sí, No)</label>
                    <select
                      value={form.compensado}
                      onChange={(e) => setFilter({ compensado: e.target.value })}
                      className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                    >
                      <option value="">Todos</option>
                      <option value="Sí">Sí</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200">
                Cancelar
              </button>
              <button onClick={handleCreate} className="px-4 py-2 text-sm bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] shadow-sm hover:shadow-md transition-all duration-200 font-medium">
                Crear Reporte
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 bg-[#F7F8FA] z-50 flex flex-col">
          <div className="flex items-center justify-between px-8 py-4 border-b border-[#E4E8EE] bg-white shrink-0">
              <div>
                <h2 className="font-serif text-lg font-bold text-[#1E2A32]">{preview.name}</h2>
                <p className="text-xs text-[#5F6C79] mt-0.5">
                  {preview.count} registros{preview.count > preview.records.length ? ` · mostrando ${preview.records.length}` : ''}
                </p>
              </div>
              <button onClick={() => setPreview(null)} className="text-[#7A8694] hover:text-[#3F4D58] transition-colors duration-200">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto min-h-0">
              {!isDateReport(preview) && preview.created_by_breakdown && preview.created_by_breakdown.length > 0 && (
                <div className="flex items-center gap-3 px-8 py-3 bg-amber-50/70 border-b border-amber-100 flex-wrap shrink-0">
                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Expedientes por usuario:</span>
                  {preview.created_by_breakdown.map((b) => (
                    <span key={b.full_name} className="text-xs bg-white border border-amber-200 rounded-lg px-2 py-1 text-[#2B3A45]">
                      <b>{b.full_name}</b>: {b.count}
                    </span>
                  ))}
                </div>
              )}
              {canReorder() && !isDateReport(preview) && preview.records.length > 1 && (
                <div className="flex items-center gap-2 px-8 py-2 bg-sky-50 border-b border-sky-100 text-xs text-sky-700 shrink-0">
                  <span>Arrastre las filas para acomodar la posición antes de generar el Excel.</span>
                  {savingOrder && <span className="text-sky-500">Guardando orden…</span>}
                  {orderSaved && !savingOrder && <span className="text-emerald-600 font-medium">✓ Orden guardado</span>}
                </div>
              )}
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#0F766E] text-white">
                    {preview.columns.map((col, ci) => (
                      <th key={col} className={`text-left px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${ci === 0 ? 'sticky left-0 z-20 bg-[#0F766E] border-r border-white/30' : ''}`}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.records.length === 0 ? (
                    <tr>
                      <td colSpan={preview.columns.length} className="px-4 py-12 text-center text-[#7A8694]">
                        {loadingPreview ? 'Cargando...' : 'Este reporte no tiene registros con los filtros seleccionados.'}
                      </td>
                    </tr>
                  ) : preview.records.map((record, idx) => (
                    <tr
                      key={record._id || idx}
                      draggable={canReorder() && !isDateReport(preview)}
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => { if (canReorder() && !isDateReport(preview)) { e.preventDefault(); setDragOverIdx(idx) } }}
                      onDrop={(e) => { e.preventDefault(); handleDrop(idx) }}
                      onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                      className={`border-b border-[#E4E8EE] transition-colors ${dragOverIdx === idx && dragIdx !== null && dragIdx !== idx ? 'bg-sky-50 ring-1 ring-inset ring-sky-200' : ''} ${dragIdx === idx ? 'opacity-50' : ''} ${idx % 2 === 0 ? 'bg-white' : 'bg-[#F7F8FA]'} ${canReorder() ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    >
                      {preview.columns.map((col, ci) => (
                        <td
                          key={col}
                          title={record[col] ? String(record[col]) : undefined}
                          className={`px-4 py-2.5 text-[#2B3A45] ${ci === 0 ? 'sticky left-0 z-10 bg-inherit border-r border-[#E4E8EE] font-medium' : ''} ${['Nombre/Name', 'Diagnostic/Procedure', 'Origin', 'Referred by', 'Observación'].includes(col) ? 'max-w-[220px] truncate' : 'whitespace-nowrap'}`}
                        >
                          {col === 'No' ? idx + 1 : (record[col] || <span className="text-[#8E9AA6]">-</span>)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end px-8 py-3 border-t border-[#E4E8EE] bg-white shrink-0">
              <button onClick={() => { setPreview(null); setPreviewReportId(null) }} className="px-4 py-2 text-sm bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] shadow-sm transition-all duration-200 font-medium">
                Cerrar
              </button>
            </div>
        </div>
      )}
    </div>
  )
}
