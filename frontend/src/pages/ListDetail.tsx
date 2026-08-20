import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listsApi, default as api } from '../services/api'
import { ListDefinition, ListRecord } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { Plus, Upload, Search, Pencil, Trash2, Download, Stethoscope, CheckSquare, Square, Settings2, Eye, MapPin, X, Info, Check, ChevronDown } from 'lucide-react'
import { ExpedienteForm, SECTIONS } from '../components/ExpedienteForm'
import { specialtiesApi, localitiesApi } from '../services/api'
import { areSimilarNames, normalizeText, shortName } from '../utils/format'
import { TIPO_LOCALIDAD_OPTIONS } from '../constants'
import { ConfirmDangerModal } from '../components/ConfirmDangerModal'
import { TrashModal } from '../components/TrashModal'

const RECORD_COLUMNS = ['nombre', 'edad', 'diagnostico', 'perfil', 'domicilio', 'telefono', 'albergue', 'nombre_medico']
const COLUMN_WIDTHS: Record<string, string> = {
  nombre: 'w-[16%]',
  edad: 'w-[7%]',
  diagnostico: 'w-[19%]',
  perfil: 'w-[8%]',
  domicilio: 'w-[17%]',
  telefono: 'w-[11%]',
  albergue: 'w-[9%]',
  nombre_medico: 'w-[13%]',
}
const PAGE_SIZE = 50

interface Specialty {
  name: string
  count: number
}

export function ListDetail() {
  const { id } = useParams() as { id: string }
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast, confirm } = useNotification()
  const [list, setList] = useState<ListDefinition | null>(null)
  const [records, setRecords] = useState<ListRecord[]>([])
  const [search, setSearch] = useState('')
  const [searchField, setSearchField] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showExpedienteForm, setShowExpedienteForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ListRecord | null>(null)
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [especialidades, setEspecialidades] = useState<string[]>([])
  const [especialidadFilter, setEspecialidadFilter] = useState('')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const catalogRef = useRef<HTMLDivElement>(null)
  const [compensadoFilter, setCompensadoFilter] = useState('')
  const [compStats, setCompStats] = useState<{ compensados: number; descompensados: number; sin_definir: number } | null>(null)
  const [savingCompensado, setSavingCompensado] = useState<string | null>(null)
  const canEditCompensado = user?.role === 'medico' || user?.role === 'direccion' || user?.role === 'direccion_medica'
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showEspModal, setShowEspModal] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [editingEsp, setEditingEsp] = useState<Specialty | null>(null)
  const [newEspName, setNewEspName] = useState('')
  const [espSaving, setEspSaving] = useState(false)
  const [previewRecord, setPreviewRecord] = useState<ListRecord | null>(null)
  const [showLocModal, setShowLocModal] = useState(false)
  const [localities, setLocalities] = useState<{ name: string; tipo: string; count: number; municipio: string; departamento: string }[]>([])
  const [editingLoc, setEditingLoc] = useState<{ name: string; tipo: string; count: number } | null>(null)
  const [newLocName, setNewLocName] = useState('')
  const [locSaving, setLocSaving] = useState(false)
  const [espSearch, setEspSearch] = useState('')
  const [locSearch, setLocSearch] = useState('')
  const [dismissedLocGroups, setDismissedLocGroups] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('sbj_loc_similar_dismissed') || '[]')
    } catch { return [] }
  })
  const [creatingEsp, setCreatingEsp] = useState(false)
  const [creatingLoc, setCreatingLoc] = useState(false)
  const [newLocTipo, setNewLocTipo] = useState('')
  const [draftNoticeClosed, setDraftNoticeClosed] = useState(() => {
    try { return localStorage.getItem('sbj_draft_notice_closed') === '1' } catch { return false }
  })

  const closeDraftNotice = () => {
    setDraftNoticeClosed(true)
    try { localStorage.setItem('sbj_draft_notice_closed', '1') } catch { /* ignore */ }
  }
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'esp' | 'loc'; name: string; count: number } | null>(null)
  const [replaceValue, setReplaceValue] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Papelera y borrado con doble confirmación
  const [deleteRecordsTarget, setDeleteRecordsTarget] = useState<{ count: number } | null>(null)
  const [deletingRecords, setDeletingRecords] = useState(false)

  // Edición concurrente (lock optimista)
  const [conflict, setConflict] = useState<{ recordId: string; message: string; who?: string } | null>(null)
  const conflictRef = useRef<{ data: Record<string, any>; force: boolean } | null>(null)

  const loadEspecialidades = async () => {
    try {
      const res = await listsApi.getEspecialidades(id)
      setEspecialidades(res.data)
    } catch { /* ignore */ }
  }

  const loadCompStats = async () => {
    try {
      const res = await listsApi.compensadoStats(id)
      setCompStats(res.data)
    } catch { /* ignore */ }
  }

  const handleSetCompensado = async (recordId: string, value: string) => {
    setSavingCompensado(recordId)
    try {
      await listsApi.setCompensado(id, recordId, value || null)
      setRecords((prev) => prev.map((r) => {
        if (r.id !== recordId) return r
        const data = { ...r.data }
        if (value) data.compensado = value
        else delete data.compensado
        return { ...r, data }
      }))
      loadCompStats()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al actualizar el estado', 'error')
    } finally {
      setSavingCompensado(null)
    }
  }

  const loadList = async () => {
    try {
      const res = await listsApi.get(id)
      setList(res.data)
    } catch (err) {
      if ((err as any)?.response?.status === 404) {
        navigate('/lists', { replace: true })
      }
    }
  }

  const loadRecords = useCallback(async (reset = false) => {
    const next = reset ? 1 : page + 1
    setLoadingMore(true)
    try {
      const params: any = { page: next, page_size: PAGE_SIZE }
      if (especialidadFilter) {
        params.search = especialidadFilter
        params.search_field = 'especialidad'
      } else if (search) {
        params.search = search
        if (searchField) params.search_field = searchField
      }
      if (compensadoFilter) params.compensado = compensadoFilter
      const res = await listsApi.getRecords(id, params)
      const data = res.data
      setPage(data.page)
      setTotal(data.total)
      setHasMore(data.page * data.page_size < data.total)
      setRecords(reset ? data.items : (prev) => [...prev, ...data.items])
      if (reset) {
        setSelectedIds(new Set())
        if (scrollRef.current) scrollRef.current.scrollTop = 0
      }
    } catch (err) { console.error(err) }
    finally { setLoadingMore(false) }
  }, [id, page, search, searchField, especialidadFilter, compensadoFilter])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el || loadingMore || !hasMore) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      loadRecords(false)
    }
  }

  useEffect(() => {
    if (id) loadList()
  }, [id])

  useEffect(() => {
    if (id) loadRecords(true)
  }, [id, search, searchField, especialidadFilter, compensadoFilter])

  useEffect(() => {
    if (id && list?.is_system) loadEspecialidades()
    if (id) loadCompStats()
  }, [id, list?.is_system])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (catalogRef.current && !catalogRef.current.contains(e.target as Node)) setCatalogOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleSelect = (recordId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(recordId)) next.delete(recordId)
      else next.add(recordId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(records.map((r) => r.id)))
    }
  }

  const handleExportSelected = async () => {
    if (selectedIds.size === 0) return
    try {
      const ids = Array.from(selectedIds)
      let filename = 'lote_expedientes.xlsx'
      if (ids.length === 1) {
        const record = records.find(r => r.id === ids[0])
        if (record) {
          const nombre = record.data?.nombre || 'expediente'
          const apellido = record.data?.apellido || ''
          const especialidad = record.data?.especialidad || ''
          const nameParts = [nombre, apellido].filter(Boolean).join(' ')
          filename = `${nameParts}_${especialidad}.xlsx`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        }
      }
      const res = await api.post(`/lists/${id}/export-expediente-selected`, { ids }, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch { toast('Error al exportar', 'error') }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const res = await listsApi.importExcel(id, file)
      toast(res.data.message, 'success')
      loadRecords()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al importar', 'error')
    }
  }

  const handleSaveRecord = async (force = false) => {
    try {
      if (editingRecord) {
        const payload: any = { data: formData }
        if (!force && editingRecord.updated_at) {
          payload.expected_updated_at = editingRecord.updated_at
        }
        await listsApi.updateRecord(id, editingRecord.id, payload)
      } else {
        await listsApi.createRecord(id, { data: formData })
      }
      setShowModal(false)
      setEditingRecord(null)
      setFormData({})
      setConflict(null)
      conflictRef.current = null
      loadRecords()
    } catch (err: any) {
      if (err.response?.status === 409) {
        const detail = err.response.data?.detail
        setConflict({
          recordId: String(editingRecord?.id || ''),
          message: typeof detail === 'string' ? detail : (detail?.message || 'Este expediente fue modificado por otra persona.'),
          who: typeof detail === 'object' && detail ? detail.updated_by_name : undefined,
        })
        conflictRef.current = { data: formData, force: false }
        return
      }
      toast(err.response?.data?.detail || 'Error al guardar registro', 'error')
    }
  }

  const openEditRecord = (record: any) => {
    setEditingRecord(record)
    setFormData(record.data)
    setShowModal(true)
  }

  const handlePreviewSelected = () => {
    const record = records.find(r => selectedIds.has(r.id))
    if (record) setPreviewRecord(record)
  }

  const handleEditSelected = () => {
    const record = records.find(r => selectedIds.has(r.id))
    if (!record) return
    if (user?.role === 'medico' && record.created_by && String(record.created_by) !== String(user.id)) {
      toast('Solo puedes editar expedientes creados por ti', 'error')
      return
    }
    setSelectedIds(new Set())
    if (list?.is_system) {
      setEditingRecord(record)
      setShowExpedienteForm(true)
    } else {
      openEditRecord(record)
    }
  }

  const handleDeleteSelected = () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setDeleteRecordsTarget({ count: ids.length })
  }

  const confirmDeleteRecords = async () => {
    if (!deleteRecordsTarget || deletingRecords) return
    setDeletingRecords(true)
    try {
      const ids = Array.from(selectedIds)
      const res = await api.post(`/lists/${id}/records/bulk-delete`, { ids })
      setSelectedIds(new Set())
      setDeleteRecordsTarget(null)
      loadRecords()
      toast(res.data.message, 'success')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al eliminar', 'error')
    } finally {
      setDeletingRecords(false)
    }
  }

  const formatEditedBy = (r: ListRecord) => {
    if (!r.updated_at) return null
    const d = new Date(r.updated_at)
    const diff = Date.now() - d.getTime()
    const ago = diff < 60000 ? 'hace un momento'
      : diff < 3600000 ? `hace ${Math.floor(diff / 60000)} min`
      : diff < 86400000 ? `hace ${Math.floor(diff / 3600000)} h`
      : `hace ${Math.floor(diff / 86400000)} días`
    return `Editado ${ago}`
  }

  const loadSpecialties = async () => {
    try {
      const res = await specialtiesApi.list()
      setSpecialties(res.data)
    } catch {
      toast('Error al cargar especialidades', 'error')
    }
  }

  const openEspModal = () => {
    setShowEspModal(true)
    setEditingEsp(null)
    setCreatingEsp(false)
    setNewEspName('')
    setEspSearch('')
    loadSpecialties()
  }

  const handleCreateEsp = async () => {
    if (!newEspName.trim()) {
      toast('El nombre de la especialidad es obligatorio', 'error')
      return
    }
    try {
      setEspSaving(true)
      const res = await specialtiesApi.create(newEspName.trim())
      toast(res.data?.message || 'Especialidad creada', 'success')
      setCreatingEsp(false)
      setNewEspName('')
      await loadSpecialties()
      await loadEspecialidades()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al crear la especialidad', 'error')
    } finally {
      setEspSaving(false)
    }
  }

  const handleRenameEsp = async () => {
    if (!editingEsp || !newEspName.trim()) {
      toast('El nombre nuevo es obligatorio', 'error')
      return
    }
    try {
      setEspSaving(true)
      const res = await specialtiesApi.rename(editingEsp.name, newEspName.trim())
      toast(res.data?.message || 'Especialidad editada', 'success')
      setEditingEsp(null)
      await loadSpecialties()
      await loadEspecialidades()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al editar la especialidad', 'error')
    } finally {
      setEspSaving(false)
    }
  }

  const handleDeleteEsp = async (s: Specialty) => {
    setDeleteTarget({ type: 'esp', name: s.name, count: s.count })
    setReplaceValue('')
  }

  const loadLocalities = async () => {
    try {
      const res = await localitiesApi.list()
      setLocalities(res.data)
    } catch {
      toast('Error al cargar localidades', 'error')
    }
  }

  const openLocModal = () => {
    setShowLocModal(true)
    setEditingLoc(null)
    setCreatingLoc(false)
    setNewLocName('')
    setNewLocTipo('')
    setLocSearch('')
    loadLocalities()
  }

  const handleCreateLoc = async () => {
    if (!newLocName.trim()) {
      toast('El nombre de la localidad es obligatorio', 'error')
      return
    }
    try {
      setLocSaving(true)
      const res = await localitiesApi.create(newLocName.trim(), newLocTipo)
      toast(res.data?.message || 'Localidad creada', 'success')
      setCreatingLoc(false)
      setNewLocName('')
      setNewLocTipo('')
      await loadLocalities()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al crear la localidad', 'error')
    } finally {
      setLocSaving(false)
    }
  }

  const handleRenameLoc = async () => {
    if (!editingLoc || !newLocName.trim()) {
      toast('El nombre nuevo es obligatorio', 'error')
      return
    }
    try {
      setLocSaving(true)
      const res = await localitiesApi.rename(editingLoc.name, newLocName.trim())
      toast(res.data?.message || 'Localidad editada', 'success')
      setEditingLoc(null)
      await loadLocalities()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al editar la localidad', 'error')
    } finally {
      setLocSaving(false)
    }
  }

  const handleDeleteLoc = async (l: { name: string; tipo: string; count: number }) => {
    setDeleteTarget({ type: 'loc', name: l.name, count: l.count })
    setReplaceValue('')
  }

  const confirmDeleteWithReplacement = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      const replacement = replaceValue.trim()
      if (deleteTarget.type === 'esp') {
        const res = await specialtiesApi.remove(deleteTarget.name, replacement)
        toast(res.data?.message || 'Especialidad eliminada', 'success')
        await loadSpecialties()
        await loadEspecialidades()
      } else {
        const res = await localitiesApi.remove(deleteTarget.name, replacement)
        toast(res.data?.message || 'Localidad eliminada', 'success')
        await loadLocalities()
      }
      setDeleteTarget(null)
      setReplaceValue('')
      loadRecords(true)
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al eliminar', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const similarLocalities = (items: { name: string; tipo: string; count: number; municipio: string; departamento: string }[] = localities): { names: string[] }[] => {
    const groups: { names: string[] }[] = []
    const used = new Set<number>()
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue
      const group = [items[i]]
      used.add(i)
      for (let j = i + 1; j < items.length; j++) {
        if (used.has(j)) continue
        if (areSimilarNames(items[i].name, items[j].name)) {
          group.push(items[j])
          used.add(j)
        }
      }
      if (group.length > 1) groups.push({ names: group.map((g) => g.name) })
    }
    return groups
  }

  const domicilioPreview = (d: Record<string, any>): string => {
    const parts: string[] = []
    if (d.localidad) parts.push(d.tipo_localidad ? `${d.localidad} (${d.tipo_localidad})` : d.localidad)
    if (d.municipio) parts.push(d.municipio)
    if (d.departamento) parts.push(d.departamento)
    return parts.filter(Boolean).join(', ') || d.domicilio || ''
  }

  const filteredSpecialties = espSearch.trim()
    ? specialties.filter((s) => normalizeText(s.name).includes(normalizeText(espSearch.trim())))
    : specialties

  const filteredLocalities = locSearch.trim()
    ? localities.filter((l) => normalizeText(l.name).includes(normalizeText(locSearch.trim())))
    : localities

  const selectedRecord = records.find((r) => selectedIds.has(r.id))
  const canEditSelected = user?.role === 'direccion' || user?.role === 'direccion_medica'
    || (user?.role === 'medico' && !!selectedRecord?.created_by && String(selectedRecord.created_by) === String(user.id))

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#1E2A32]">{list?.name || 'Cargando...'}</h1>
          {list?.description && <p className="text-sm text-[#3F4D58] mt-1">{list.description}</p>}
        </div>
        <div className="flex gap-2">
          {list?.is_system ? (
            user?.role !== 'admin' && (
            <button
              onClick={() => { setEditingRecord(null); setShowExpedienteForm(true) }}
              className="flex items-center gap-1.5 bg-[#0F766E] text-white px-5 py-2.5 rounded-xl hover:bg-[#115E59] shadow-sm hover:shadow-md transition-all duration-200  text-sm font-medium"
            >
              <Stethoscope size={16} />
              Nuevo
            </button>
            )
          ) : (
            <button
              onClick={() => {
                setEditingRecord(null)
                const empty: Record<string, any> = {}
                list?.columns_config.forEach(c => { empty[c.key] = '' })
                setFormData(empty)
                setShowModal(true)
              }}
              className="flex items-center gap-1.5 bg-[#0F766E] text-white px-5 py-2.5 rounded-xl hover:bg-[#115E59] shadow-sm hover:shadow-md transition-all duration-200  text-sm font-medium"
            >
              <Plus size={16} />
              Nuevo
            </button>
          )}
        </div>
      </div>

      {user?.role === 'medico' && list?.is_system && !draftNoticeClosed && (
        <div className="shrink-0 flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-xl px-4 py-2.5 text-sky-800">
          <Info size={15} className="shrink-0" />
          <p className="text-xs font-medium flex-1">
            <b>Novedad:</b> mientras escribe un expediente, el sistema guarda un <b>borrador automático</b> en su navegador. Si se va la luz o cierra la ventana por accidente, al volver a abrir el expediente se restauran sus datos.
          </p>
          <button
            onClick={closeDraftNotice}
            className="p-1 text-sky-500 hover:text-sky-700 hover:bg-sky-100 rounded-lg transition-colors duration-200 shrink-0"
            title="Cerrar aviso"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-[#E4E8EE] flex flex-col min-h-0 flex-1 transition-shadow duration-200 hover:shadow-md">
        <div className="p-3 border-b border-[#E4E8EE] space-y-2.5 shrink-0 bg-[#EEF1F5]">
        <div className="flex gap-2.5 flex-wrap">
              <select
                value={searchField}
                onChange={(e) => setSearchField(e.target.value)}
                className="px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
              >
                <option value="">Todos los campos</option>
                {list?.columns_config.map((col) => (
                  <option key={col.key} value={col.key}>{col.label}</option>
                ))}
              </select>
              <div className="relative flex-1 min-w-[180px]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8694]" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                />
              </div>
              <span className="ml-auto self-center text-xs text-[#7A8694] whitespace-nowrap">
                {total.toLocaleString()} expediente{total === 1 ? '' : 's'}
              </span>
            </div>
            {list?.is_system && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#7A8694] shrink-0">Catálogo</span>
                  <div ref={catalogRef} className="relative">
                    <button
                      onClick={() => setCatalogOpen((v) => !v)}
                      className={`flex items-center gap-2 pl-3 pr-2.5 py-2 text-sm rounded-xl border transition-all duration-200 ${
                        especialidadFilter
                          ? 'bg-[#0F766E] text-white border-[#0F766E]'
                          : 'bg-white text-[#3F4D58] border-[#E4E8EE] hover:border-[#8E9AA6]'
                      }`}
                    >
                      <span className="max-w-[220px] truncate">
                        {especialidadFilter || 'Todas las especialidades'}
                      </span>
                      {especialidadFilter ? (
                        <span
                          onClick={(e) => { e.stopPropagation(); setEspecialidadFilter(''); setSelectedIds(new Set()); setCatalogOpen(false) }}
                          className="hover:bg-white/20 rounded p-0.5 leading-none"
                          title="Quitar filtro"
                        >
                          <X size={13} />
                        </span>
                      ) : (
                        <ChevronDown size={14} className={`text-[#8E9AA6] transition-transform duration-200 ${catalogOpen ? 'rotate-180' : ''}`} />
                      )}
                    </button>
                    {catalogOpen && (
                      <div className="absolute left-0 top-full mt-1.5 z-50 w-64 max-h-72 overflow-y-auto bg-white border border-[#E4E8EE] rounded-xl shadow-xl py-1.5">
                        <button
                          onClick={() => { setEspecialidadFilter(''); setSelectedIds(new Set()); setCatalogOpen(false) }}
                          className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 transition-colors duration-150 ${
                            especialidadFilter === '' ? 'text-[#0F766E] font-medium bg-[#EEF1F5]' : 'text-[#3F4D58] hover:bg-[#F7F8FA]'
                          }`}
                        >
                          Todas las especialidades
                          {especialidadFilter === '' && <Check size={14} />}
                        </button>
                        <div className="mx-3 my-1 border-t border-[#E4E8EE]" />
                        {especialidades.map((esp) => (
                          <button
                            key={esp}
                            onClick={() => { setEspecialidadFilter(esp === especialidadFilter ? '' : esp); setSelectedIds(new Set()); setCatalogOpen(false) }}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 transition-colors duration-150 ${
                              especialidadFilter === esp ? 'text-[#0F766E] font-medium bg-[#EEF1F5]' : 'text-[#3F4D58] hover:bg-[#F7F8FA]'
                            }`}
                          >
                            <span className="truncate">{esp}</span>
                            {especialidadFilter === esp && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <span className="w-px h-7 bg-[#D5DBE3] shrink-0" />

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#7A8694]">Estado clínico</span>
                  <div className="flex items-center gap-1 bg-white border border-[#E4E8EE] p-1 rounded-xl">
                    <button
                      onClick={() => { setCompensadoFilter(''); setSelectedIds(new Set()) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        compensadoFilter === '' ? 'bg-[#EEF1F5] text-[#1E2A32]' : 'text-[#5F6C79] hover:text-[#1E2A32]'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => { setCompensadoFilter(compensadoFilter === 'Sí' ? '' : 'Sí'); setSelectedIds(new Set()) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
                        compensadoFilter === 'Sí' ? 'bg-emerald-100 text-emerald-700' : 'text-[#5F6C79] hover:text-[#1E2A32]'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Compensados
                      {compensadoFilter === 'Sí' && (
                        <span
                          onClick={(e) => { e.stopPropagation(); setCompensadoFilter(''); setSelectedIds(new Set()) }}
                          className="hover:bg-emerald-200 rounded p-0.5 leading-none"
                          title="Quitar filtro"
                        >
                          <X size={11} />
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => { setCompensadoFilter(compensadoFilter === 'No' ? '' : 'No'); setSelectedIds(new Set()) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
                        compensadoFilter === 'No' ? 'bg-red-100 text-red-700' : 'text-[#5F6C79] hover:text-[#1E2A32]'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      Descompensados
                      {compensadoFilter === 'No' && (
                        <span
                          onClick={(e) => { e.stopPropagation(); setCompensadoFilter(''); setSelectedIds(new Set()) }}
                          className="hover:bg-red-200 rounded p-0.5 leading-none"
                          title="Quitar filtro"
                        >
                          <X size={11} />
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-2 flex-wrap">
              {user?.role === 'admin' && (
                <>
                  <button
                    onClick={openEspModal}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#3F4D58] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#F7F8FA] transition-all duration-200"
                    title="Administrar especialidades"
                  >
                    <Settings2 size={15} />
                    Especialidades
                  </button>
                  <button
                    onClick={openLocModal}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#3F4D58] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#F7F8FA] transition-all duration-200"
                    title="Administrar localidades"
                  >
                    <MapPin size={15} />
                    Localidades
                  </button>
                </>
              )}
              {(list?.is_system
                ? (user?.role === 'direccion' || user?.role === 'direccion_medica')
                : (user?.role === 'admin' || user?.role === 'direccion' || user?.role === 'direccion_medica')
              ) && (
                <button
                  onClick={() => setShowTrash(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#3F4D58] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#F7F8FA] transition-all duration-200"
                  title="Expedientes eliminados (restaurables por 15 días)"
                >
                  <Trash2 size={15} />
                  Papelera
                </button>
              )}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {!list?.is_system || user?.role !== 'admin' ? (
                    <button
                      onClick={handleExportSelected}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] shadow-sm hover:shadow-md transition-all duration-200  text-sm font-medium"
                    >
                      <Download size={16} />
                      Exportar {selectedIds.size} seleccionados
                    </button>
                  ) : null}
                  {selectedIds.size === 1 && canEditSelected && (
                    <button
                      onClick={handleEditSelected}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] shadow-sm hover:shadow-md transition-all duration-200  text-sm font-medium"
                    >
                      <Pencil size={16} />
                      Editar
                    </button>
                  )}
                  {selectedIds.size === 1 && (
                    <button
                      onClick={handlePreviewSelected}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] shadow-sm hover:shadow-md transition-all duration-200  text-sm font-medium"
                    >
                      <Eye size={16} />
                      Vista previa
                    </button>
                  )}
                  {(list?.is_system
                    ? (user?.role === 'direccion' || user?.role === 'direccion_medica')
                    : (user?.role === 'admin' || user?.role === 'direccion' || user?.role === 'direccion_medica')
                  ) ? (
                    <button
                      onClick={handleDeleteSelected}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 shadow-sm hover:shadow-md transition-all duration-200  text-sm font-medium"
                    >
                      <Trash2 size={16} />
                      Eliminar
                    </button>
                  ) : null}
                </div>
              )}
              </div>
            </div>
          )}
        </div>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full table-fixed border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#EEF1F5] border-b border-[#E4E8EE]">
                {list?.is_system && (
                  <th className="w-10 px-3 py-4 border-r border-[#E4E8EE]">
                    <button onClick={toggleSelectAll} className="text-[#7A8694] hover:text-[#3F4D58] transition-colors duration-200">
                      {selectedIds.size === records.length && records.length > 0
                        ? <CheckSquare size={16} className="text-[#3F4D58]" />
                        : <Square size={16} />}
                    </button>
                  </th>
                )}
                {list?.columns_config.filter(c => RECORD_COLUMNS.includes(c.key)).map((col, ci, arr) => (
                  <th key={col.key} className={`text-left px-3 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider ${COLUMN_WIDTHS[col.key] || ''} ${ci < arr.length - 1 ? 'border-r border-[#E4E8EE]' : ''}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record, idx) => (
                <tr key={record.id} className={`border-b border-[#EEF1F5] transition-all duration-150 hover:bg-[#EEF1F5] ${selectedIds.has(record.id) ? 'bg-[#EEF1F5]' : idx % 2 === 0 ? 'bg-white' : 'bg-[#EEF1F5]'}`}>
                  {list?.is_system && (
                    <td className="w-10 px-3 py-4 border-r border-[#EEF1F5]">
                      <button onClick={() => toggleSelect(record.id)} className="text-[#8E9AA6] hover:text-[#5F6C79] transition-colors duration-200">
                        {selectedIds.has(record.id) ? <CheckSquare size={16} className="text-[#5F6C79]" /> : <Square size={16} />}
                      </button>
                    </td>
                  )}
                  {list?.columns_config.filter(c => RECORD_COLUMNS.includes(c.key)).map((col, ci, arr) => (
                    <td
                      key={col.key}
                      title={String(col.key === 'domicilio' ? domicilioPreview(record.data) : (record.data[col.key] ?? ''))}
                      className={`px-3 py-4 text-sm text-[#2B3A45] truncate ${COLUMN_WIDTHS[col.key] || ''} ${ci < arr.length - 1 ? 'border-r border-[#EEF1F5]' : ''}`}
                    >
                      {col.key === 'telefono'
                        ? [record.data.telefono, record.data.telefono2, record.data.telefono3]
                            .filter(Boolean)
                            .join(' / ') || <span className="text-[#8E9AA6]">-</span>
                        : col.key === 'domicilio'
                          ? domicilioPreview(record.data) || <span className="text-[#8E9AA6]">-</span>
                          : col.key === 'nombre_medico'
                            ? shortName(record.data.nombre_medico) || <span className="text-[#8E9AA6]">-</span>
                            : record.data[col.key] || <span className="text-[#8E9AA6]">-</span>
                      }
                    </td>
                  ))}
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={100} className="px-4 py-12 text-center text-[#7A8694] text-sm">
                    {search || especialidadFilter ? 'No encontramos expedientes con ese criterio. Prueba con otro nombre, número o diagnóstico.' : 'Aún no hay expedientes registrados. Crea el primero con el botón «Nuevo».'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-center gap-2 py-4">
            {loadingMore ? (
              <span className="text-sm text-[#7A8694]">Cargando...</span>
            ) : hasMore ? (
              <button
                onClick={() => loadRecords(false)}
                className="text-sm font-medium text-[#0F766E] hover:underline"
              >
                Cargar más
              </button>
            ) : records.length > 0 ? (
              <span className="text-xs text-[#7A8694]">Fin de la lista</span>
            ) : null}
          </div>
        </div>
      </div>

      {showExpedienteForm && (
        <ExpedienteForm
          listId={id}
          role={user?.role}
          medicoName={user?.full_name}
          editingRecord={editingRecord || undefined}
          expectedUpdatedAt={editingRecord?.updated_at || null}
          onClose={() => { setShowExpedienteForm(false); setEditingRecord(null) }}
          onSaved={() => loadRecords(true)}
        />
      )}
      {showModal && (
        <div className="fixed inset-0 bg-[#0F172A]/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl px-5 py-3 w-[95vw] max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <h2 className="font-serif text-lg font-bold mb-4 shrink-0 text-[#1E2A32]">
              {editingRecord ? 'Editar Registro' : 'Nuevo Registro'}
            </h2>
            <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
              {list?.columns_config.map((col) => (
                <div key={col.key}>
                  <label className="block text-sm font-medium text-[#2B3A45] mb-1">{col.label}</label>
                  {col.type === 'date' ? (
                    <input
                      type="date"
                      value={formData[col.key] || ''}
                      onChange={(e) => setFormData({ ...formData, [col.key]: e.target.value })}
                      className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                    />
                  ) : col.type === 'number' ? (
                    <input
                      type="number"
                      value={formData[col.key] || ''}
                      onChange={(e) => setFormData({ ...formData, [col.key]: e.target.value })}
                      className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                    />
                  ) : (
                    <input
                      type="text"
                      value={formData[col.key] || ''}
                      onChange={(e) => setFormData({ ...formData, [col.key]: e.target.value })}
                      className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4 shrink-0">
              <button onClick={() => { setShowModal(false); setEditingRecord(null) }} className="px-4 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200">
                Cancelar
              </button>
              <button onClick={() => void handleSaveRecord()} className="px-4 py-2 text-sm bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] shadow-sm hover:shadow-md transition-all duration-200 font-medium">
                {editingRecord ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteRecordsTarget && (
        <ConfirmDangerModal
          title={`Eliminar ${deleteRecordsTarget.count} expediente(s)`}
          message={
            <span>
              Los expedientes seleccionados se enviarán a la <b>papelera</b> y podrán
              restaurarse durante <b>15 días</b> desde la papelera en la sección de Listas.
            </span>
          }
          loading={deletingRecords}
          onCancel={() => setDeleteRecordsTarget(null)}
          onConfirm={() => void confirmDeleteRecords()}
        />
      )}

      {showTrash && (
        <TrashModal
          open={showTrash}
          onClose={() => setShowTrash(false)}
          listId={id}
          title="Papelera (15 días)"
        />
      )}

      {conflict && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
            <h3 className="font-serif text-lg font-bold text-[#1E2A32] mb-2">No se pudo guardar</h3>
            <p className="text-sm text-[#3F4D58] leading-relaxed">
              {conflict.message}
              {conflict.who && (
                <span className="block mt-1 text-xs text-[#5F6C79]">Última edición por: <b>{conflict.who}</b></span>
              )}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => {
                  setConflict(null)
                  setShowModal(false)
                  setEditingRecord(null)
                  setFormData({})
                  loadRecords(true)
                }}
                className="w-full px-4 py-2.5 text-sm font-medium bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] transition-all duration-200"
              >
                Ver la versión actualizada
              </button>
              <button
                onClick={() => {
                  setConflict(null)
                  void handleSaveRecord(true)
                }}
                className="w-full px-4 py-2.5 text-sm font-medium bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all duration-200"
              >
                Sobrescribir de todas formas
              </button>
              <button
                onClick={() => setConflict(null)}
                className="w-full px-4 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showEspModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowEspModal(false)}>
          <div className="bg-white rounded-2xl w-[95vw] max-w-xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E8EE] shrink-0">
              <h2 className="font-serif text-lg font-bold text-[#1E2A32]">Administrar especialidades</h2>
              <button onClick={() => setShowEspModal(false)} className="text-[#7A8694] hover:text-[#3F4D58] text-xl leading-none p-1 rounded-full hover:bg-[#EEF1F5]">×</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-2">
              {editingEsp ? (
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="text"
                    value={newEspName}
                    onChange={(e) => setNewEspName(e.target.value)}
                    autoFocus
                    placeholder={`Nuevo nombre para "${editingEsp.name}"`}
                    className="flex-1 px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                  />
                  <button
                    onClick={handleRenameEsp}
                    disabled={espSaving}
                    className="px-4 py-2 text-sm bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] transition-all duration-200 font-medium disabled:opacity-50"
                  >
                    {espSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button onClick={() => setEditingEsp(null)} className="px-3 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200">
                    Cancelar
                  </button>
                </div>
              ) : (
                <>
                  {creatingEsp ? (
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="text"
                        value={newEspName}
                        onChange={(e) => setNewEspName(e.target.value)}
                        autoFocus
                        placeholder="Nombre de la nueva especialidad"
                        className="flex-1 px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                      />
                      <button
                        onClick={handleCreateEsp}
                        disabled={espSaving}
                        className="px-4 py-2 text-sm bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] transition-all duration-200 font-medium disabled:opacity-50"
                      >
                        {espSaving ? 'Guardando...' : 'Crear'}
                      </button>
                      <button
                        onClick={() => { setCreatingEsp(false); setNewEspName('') }}
                        className="px-3 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setCreatingEsp(true); setNewEspName('') }}
                      className="mb-3 flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#115E59] bg-[#F7F8FA] border border-[#E4E8EE] rounded-xl hover:bg-[#EEF1F5] transition-all duration-200"
                    >
                      <Plus size={15} />
                      Nueva especialidad
                    </button>
                  )}
                  <div className="relative mb-3">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8694]" />
                    <input
                      type="text"
                      value={espSearch}
                      onChange={(e) => setEspSearch(e.target.value)}
                      placeholder="Buscar especialidad..."
                      className="w-full pl-9 pr-3 py-2 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                    />
                  </div>
                  {filteredSpecialties.map((s) => (
                    <div key={s.name} className="flex items-center justify-between gap-3 px-4 py-3 bg-[#F7F8FA] border border-[#E4E8EE] rounded-xl">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1E2A32] truncate">{s.name}</p>
                        <p className="text-xs text-[#7A8694]">{s.count} expediente(s)</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setEditingEsp(s); setNewEspName(s.name) }}
                          className="p-2 text-[#5F6C79] hover:text-[#2B3A45] hover:bg-[#EEF1F5] rounded-lg transition-colors duration-200"
                          title="Renombrar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteEsp(s)}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors duration-200"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {specialties.length === 0 && !editingEsp && (
                <p className="text-sm text-[#7A8694] text-center py-8">Aún no hay especialidades registradas. Agrega la primera con «Nueva especialidad».</p>
              )}
              {!editingEsp && espSearch.trim() && filteredSpecialties.length === 0 && (
                <p className="text-sm text-[#7A8694] text-center py-8">Sin resultados para "{espSearch}"</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showLocModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowLocModal(false)}>
          <div className="bg-white rounded-2xl w-[95vw] max-w-xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E8EE] shrink-0">
              <h2 className="font-serif text-lg font-bold text-[#1E2A32]">Administrar localidades</h2>
              <button onClick={() => setShowLocModal(false)} className="text-[#7A8694] hover:text-[#3F4D58] text-xl leading-none p-1 rounded-full hover:bg-[#EEF1F5]">×</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-2">
              {!editingLoc && (
                creatingLoc ? (
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={newLocName}
                      onChange={(e) => setNewLocName(e.target.value)}
                      autoFocus
                      placeholder="Nombre de la nueva localidad"
                      className="flex-1 px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                    />
                    <select
                      value={newLocTipo}
                      onChange={(e) => setNewLocTipo(e.target.value)}
                      className="px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                    >
                      <option value="">Tipo</option>
                      {TIPO_LOCALIDAD_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleCreateLoc}
                      disabled={locSaving}
                      className="px-4 py-2 text-sm bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] transition-all duration-200 font-medium disabled:opacity-50"
                    >
                      {locSaving ? 'Guardando...' : 'Crear'}
                    </button>
                    <button
                      onClick={() => { setCreatingLoc(false); setNewLocName(''); setNewLocTipo('') }}
                      className="px-3 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => { setCreatingLoc(true); setNewLocName(''); setNewLocTipo('') }}
                      className="mb-3 flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#115E59] bg-[#F7F8FA] border border-[#E4E8EE] rounded-xl hover:bg-[#EEF1F5] transition-all duration-200"
                    >
                      <Plus size={15} />
                      Nueva localidad
                    </button>
                    <div className="relative mb-3">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8694]" />
                      <input
                        type="text"
                        value={locSearch}
                        onChange={(e) => setLocSearch(e.target.value)}
                        placeholder="Buscar localidad..."
                        className="w-full pl-9 pr-3 py-2 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                      />
                    </div>
                  </>
                )
              )}
              {(() => {
                const groups = similarLocalities(filteredLocalities).filter((g) => !dismissedLocGroups.includes(g.names.join('|')))
                if (groups.length === 0) return null
                const markAsRead = () => {
                  const keys = similarLocalities(filteredLocalities).map((g) => g.names.join('|'))
                  const merged = Array.from(new Set([...dismissedLocGroups, ...keys]))
                  setDismissedLocGroups(merged)
                  localStorage.setItem('sbj_loc_similar_dismissed', JSON.stringify(merged))
                  toast('Advertencia marcada como leída', 'success')
                }
                return (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Advertencia</p>
                    <button
                      onClick={markAsRead}
                      className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-900 transition-colors duration-200 shrink-0"
                    >
                      <Check size={12} />
                      Marcar como leída
                    </button>
                  </div>
                  <p className="text-xs text-amber-700 mt-1">
                    Se detectaron {groups.length} grupo(s) de localidades con nombres similares:
                  </p>
                  <ul className="mt-2 space-y-1">
                    {groups.map((g, gi) => (
                      <li key={gi} className="text-xs text-amber-800">
                        • {g.names.join('  /  ')}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-600 mt-2">
                    Considere unificarlas renombrando para evitar duplicados. Si ya las revisó, márquelas como leídas para ocultar esta advertencia.
                  </p>
                </div>
                )
              })()}
              {editingLoc ? (
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="text"
                    value={newLocName}
                    onChange={(e) => setNewLocName(e.target.value)}
                    autoFocus
                    placeholder={`Nuevo nombre para "${editingLoc.name}"`}
                    className="flex-1 px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                  />
                  <button
                    onClick={handleRenameLoc}
                    disabled={locSaving}
                    className="px-4 py-2 text-sm bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] transition-all duration-200 font-medium disabled:opacity-50"
                  >
                    {locSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button onClick={() => setEditingLoc(null)} className="px-3 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200">
                    Cancelar
                  </button>
                </div>
              ) : (
                filteredLocalities.map((l) => (
                  <div key={`${l.name}-${l.tipo}`} className="flex items-center justify-between gap-3 px-4 py-3 bg-[#F7F8FA] border border-[#E4E8EE] rounded-xl">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1E2A32] truncate">{l.name}</p>
                      <p className="text-xs text-[#7A8694]">
                        {l.tipo ? `${l.tipo} · ` : ''}
                        {l.municipio ? `${l.municipio} · ` : ''}
                        {l.departamento ? `${l.departamento} · ` : ''}
                        {l.count} expediente(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { setEditingLoc(l); setNewLocName(l.name) }}
                        className="p-2 text-[#5F6C79] hover:text-[#2B3A45] hover:bg-[#EEF1F5] rounded-lg transition-colors duration-200"
                        title="Renombrar"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteLoc(l)}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors duration-200"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
              {localities.length === 0 && !editingLoc && (
                <p className="text-sm text-[#7A8694] text-center py-8">Aún no hay localidades registradas. Agrega la primera con «Nueva localidad».</p>
              )}
              {!editingLoc && locSearch.trim() && filteredLocalities.length === 0 && (
                <p className="text-sm text-[#7A8694] text-center py-8">Sin resultados para "{locSearch}"</p>
              )}
            </div>
            <p className="px-5 py-3 text-xs text-[#7A8694] border-t border-[#E4E8EE] shrink-0">
              Puede crear localidades aquí o escribirlas directamente en el formulario del expediente. Tipos: {TIPO_LOCALIDAD_OPTIONS.join(' · ')}.
            </p>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <h3 className="font-serif text-lg font-bold text-[#1E2A32] mb-2">
              Eliminar {deleteTarget.type === 'esp' ? 'especialidad' : 'localidad'} "{deleteTarget.name}"
            </h3>
            <p className="text-sm text-[#3F4D58] leading-relaxed mb-4">
              Está en <b>{deleteTarget.count}</b> expediente(s). Indique qué valor se asignará en su lugar:
            </p>
            <input
              type="text"
              list="reemplazos-sugeridos"
              value={replaceValue}
              onChange={(e) => setReplaceValue(e.target.value)}
              autoFocus
              placeholder="Escriba el reemplazo o seleccione uno existente"
              className="w-full px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
            />
            <datalist id="reemplazos-sugeridos">
              {(deleteTarget.type === 'esp' ? specialties : localities)
                .map((x) => x.name)
                .filter((n) => n !== deleteTarget.name)
                .map((n) => (
                  <option key={n} value={n} />
                ))}
            </datalist>
            <p className="mt-2 text-xs text-[#7A8694]">
              Si lo deja vacío, {deleteTarget.type === 'esp' ? 'la especialidad' : 'la localidad'} se quitará de los expedientes sin reemplazo.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200"
              >
                Cancelar
              </button>
              <button
                onClick={() => void confirmDeleteWithReplacement()}
                disabled={deleting || replaceValue.trim() === deleteTarget.name}
                className="px-5 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 shadow-sm transition-all duration-200 disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewRecord && (
        <div className="fixed inset-0 bg-[#0F172A]/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-[95vw] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl shadow-2xl">
            <div className="px-5 py-4 border-b border-[#E4E8EE] flex items-center justify-between shrink-0">
              <div>
                <h2 className="font-serif text-lg font-bold text-[#1E2A32]">
                  {`${previewRecord.data?.nombre || ''} ${previewRecord.data?.apellido || ''}`.trim() || 'Expediente'}
                </h2>
                <p className="text-xs text-[#5F6C79] mt-0.5">
                  Expediente Nº {previewRecord.data?.expediente || '—'} · {previewRecord.data?.especialidad || 'Sin especialidad'}
                  {formatEditedBy(previewRecord) && <span className="ml-2 text-[#7A8694]">{formatEditedBy(previewRecord)}</span>}
                </p>
              </div>
              <button onClick={() => setPreviewRecord(null)} className="text-[#7A8694] hover:text-[#3F4D58] transition-colors duration-200">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-3">
              {SECTIONS.map((section) => (
                <div key={section.title} className="border border-[#E4E8EE] rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#F7F8FA] border-b border-[#E4E8EE]">
                    <h3 className="text-sm font-semibold text-[#1E2A32]">{section.title}</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2.5 px-4 py-3">
                    {section.fields.map((f) => {
                      let value = previewRecord.data?.[f.key] || ''
                      if (f.key === 'telefono') {
                        value = [previewRecord.data?.telefono, previewRecord.data?.telefono2, previewRecord.data?.telefono3].filter(Boolean).join(' / ')
                      }
                      return (
                        <div key={f.key} className={['localidad', 'diagnostico', 'historia_enfermedad', 'examen_fisico', 'domicilio'].includes(f.key) ? 'sm:col-span-2' : ''}>
                          <p className="text-[11px] font-medium text-[#7A8694] uppercase tracking-wider">{f.label}</p>
                          <p className="text-sm text-[#1E2A32] mt-0.5 break-words whitespace-pre-wrap">
                            {value || <span className="text-[#8E9AA6]">—</span>}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end px-5 py-3 border-t border-[#E4E8EE] bg-white shrink-0">
              <button onClick={() => setPreviewRecord(null)} className="px-4 py-2 text-sm bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] shadow-sm transition-all duration-200 font-medium">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
