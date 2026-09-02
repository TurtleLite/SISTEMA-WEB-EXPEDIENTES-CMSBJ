import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { listsApi, surgeryStatusApi } from '../services/api'
import { ListRecord, ListDefinition } from '../types'
import { useNotification } from '../contexts/NotificationContext'
import { useAuth } from '../contexts/AuthContext'
import { Search, ChevronDown, Settings2, Plus, Pencil, Trash2, Check } from 'lucide-react'
import { areSimilarNames, normalizeText } from '../utils/format'

const STATUS_OPTIONS = ['En lista', 'En espera', 'Reprogramar', 'Cancelado', 'Fuera de perfil San Benito', 'Operado', 'No apto para cirugía', 'No se presentó']
const PAGE_SIZE = 50

const statusStyles: Record<string, string> = {
  'En lista': 'bg-blue-100 text-blue-600 border-blue-200',
  'Operado': 'bg-emerald-100 text-emerald-600 border-emerald-200',
  'Fuera de perfil San Benito': 'bg-red-100 text-red-600 border-red-200',
  'No apto para cirugía': 'bg-rose-100 text-rose-700 border-rose-200',
  'En espera': 'bg-yellow-100 text-yellow-600 border-yellow-200',
  'Reprogramar': 'bg-orange-100 text-orange-600 border-orange-200',
  'Cancelado': 'bg-[#EEF1F5] text-[#5F6C79] border-[#D5DBE3]',
  'No se presentó': 'bg-violet-100 text-violet-600 border-violet-200',
  'Fuera de perfil': 'bg-red-100 text-red-600 border-red-200',
}

interface SurgeryStatus {
  name: string
  count: number
}

export function EstadoCirugia() {
  const { user } = useAuth()
  const [records, setRecords] = useState<ListRecord[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [statusDraft, setStatusDraft] = useState('')
  const [comment, setComment] = useState('')
  const [listId, setListId] = useState<string | null>(null)
  const { toast } = useNotification()
  const pageRef = useRef(1)
  const reqRef = useRef(0)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [allStatuses, setAllStatuses] = useState<SurgeryStatus[]>([])
  const [editingStatus, setEditingStatus] = useState<SurgeryStatus | null>(null)
  const [newStatusName, setNewStatusName] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusSearch, setStatusSearch] = useState('')
  const [creatingStatus, setCreatingStatus] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; count: number } | null>(null)
  const [replaceValue, setReplaceValue] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [dismissedStatusGroups, setDismissedStatusGroups] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('sbj_status_similar_dismissed') || '[]')
    } catch { return [] }
  })

  const loadPage = useCallback(async (reset = false) => {
    if (!listId) return false
    const next = reset ? 1 : pageRef.current + 1
    const reqId = ++reqRef.current
    setLoadingMore(true)
    try {
      const params: Record<string, any> = { page: next, page_size: PAGE_SIZE }
      if (filter) params.estatus_cirugia = filter
      if (search.trim()) params.search = search.trim()
      const res = await listsApi.getRecords(listId, params)
      if (reqId !== reqRef.current) return false
      const data = res.data
      pageRef.current = data.page
      setTotal(data.total)
      setHasMore(data.page * data.page_size < data.total)
      setRecords(reset ? data.items : (prev) => [...prev, ...data.items])
      return true
    } catch {
      if (reqId === reqRef.current) toast('Error al cargar registros', 'error')
      return false
    } finally {
      if (reqId === reqRef.current) setLoadingMore(false)
    }
  }, [listId, filter, search])

  useEffect(() => {
    let cancelled = false
    async function setup() {
      try {
        const listsRes = await listsApi.list()
        const lists: ListDefinition[] = listsRes.data
        const system = lists.find((l) => l.is_system)
        if (!cancelled && system) {
          setListId(system.id)
          return
        }
        if (!cancelled) toast('No se encontró la lista de expedientes', 'error')
      } catch {
        if (!cancelled) toast('Error al cargar registros', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    setup()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!listId) return
    setLoading(true)
    setRecords([])
    pageRef.current = 0
    const t = setTimeout(() => {
      loadPage(true).then((fresh) => {
        if (fresh) setLoading(false)
      })
    }, 300)
    return () => { clearTimeout(t) }
  }, [listId, filter, search])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 150) {
      if (hasMore && !loadingMore && !loading) loadPage(false)
    }
  }

  const updateStatus = async (recordId: string, status: string) => {
    if (!listId) return
    try {
      const record = records.find((r) => r.id === recordId)
      if (!record) return
      await listsApi.updateRecord(listId, recordId, {
        data: {
          ...record.data,
          estatus_cirugia: status,
          observacion_estatus: comment.trim(),
        },
      })
      setEditingId(null)
      setStatusDraft('')
      setComment('')
      toast('Estatus actualizado', 'success')
      loadPage(true)
    } catch {
      toast('Error al actualizar', 'error')
    }
  }

  const loadAllStatuses = async () => {
    try {
      const res = await surgeryStatusApi.list()
      setAllStatuses(res.data)
    } catch {
      toast('Error al cargar estatus', 'error')
    }
  }

  const openStatusModal = () => {
    setShowStatusModal(true)
    setEditingStatus(null)
    setCreatingStatus(false)
    setNewStatusName('')
    setStatusSearch('')
    loadAllStatuses()
  }

  const handleCreateStatus = async () => {
    if (!newStatusName.trim()) {
      toast('El nombre del estatus es obligatorio', 'error')
      return
    }
    try {
      setStatusSaving(true)
      const res = await surgeryStatusApi.create(newStatusName.trim())
      toast(res.data?.message || 'Estatus creado', 'success')
      setCreatingStatus(false)
      setNewStatusName('')
      await loadAllStatuses()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al crear el estatus', 'error')
    } finally {
      setStatusSaving(false)
    }
  }

  const handleRenameStatus = async () => {
    if (!editingStatus || !newStatusName.trim()) {
      toast('El nombre nuevo es obligatorio', 'error')
      return
    }
    try {
      setStatusSaving(true)
      const res = await surgeryStatusApi.rename(editingStatus.name, newStatusName.trim())
      toast(res.data?.message || 'Estatus editado', 'success')
      setEditingStatus(null)
      await loadAllStatuses()
      loadPage(true)
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al editar el estatus', 'error')
    } finally {
      setStatusSaving(false)
    }
  }

  const handleDeleteStatus = async (s: SurgeryStatus) => {
    setDeleteTarget({ name: s.name, count: s.count })
    setReplaceValue('')
  }

  const confirmDeleteStatus = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      const replacement = replaceValue.trim()
      const res = await surgeryStatusApi.remove(deleteTarget.name, replacement)
      toast(res.data?.message || 'Estatus eliminado', 'success')
      setDeleteTarget(null)
      setReplaceValue('')
      await loadAllStatuses()
      loadPage(true)
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al eliminar', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const groupKey = (names: string[]): string => [...names].sort((a, b) => a.localeCompare(b, 'es')).join('|')

  const similarStatuses = (items: SurgeryStatus[] = allStatuses): { names: string[] }[] => {
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

  const filteredStatuses = statusSearch.trim()
    ? allStatuses.filter((s) => normalizeText(s.name).includes(normalizeText(statusSearch.trim())))
    : allStatuses

  const allStatusOptions = useMemo(
    () => Array.from(new Set([...STATUS_OPTIONS, ...allStatuses.map((s) => s.name)])),
    [allStatuses],
  )

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#1E2A32]">Estatus de Cirugía</h1>
        </div>
        {user?.role === 'admin' && (
          <button
            onClick={openStatusModal}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#3F4D58] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#F7F8FA] transition-colors duration-150"
            title="Administrar estatus de cirugía"
          >
            <Settings2 size={15} />
            Gestionar estatus
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E4E8EE] p-3 shrink-0 transition-shadow duration-200 hover:shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8694] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por paciente, especialidad o perfil..."
              className="w-full pl-9 pr-3 py-2 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
            />
          </div>
          <div className="relative">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 pr-8 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200 appearance-none"
            >
              <option value="">Todos los estatus</option>
              {allStatusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A8694] pointer-events-none" />
          </div>
          <span className="text-sm text-[#5F6C79] ml-auto">
            <span className="font-medium text-[#2B3A45]">{total}</span> registros
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E4E8EE] flex flex-col min-h-0 flex-1 transition-shadow duration-200 hover:shadow-md">
        <div className="flex-1 min-h-0 overflow-y-auto" onScroll={handleScroll}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#EEF1F5] border-b border-[#E4E8EE]">
                <th className="text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Paciente</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Especialidad</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Perfil</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Estatus de Cirugía</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-[#7A8694]">
                      <div className="w-5 h-5 border-2 border-[#5F6C79] border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Cargando...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-[#7A8694] text-sm">No hay cirugías que mostrar con los filtros actuales.</td></tr>
              ) : records.map((r, idx) => (
                <tr key={r.id} className={`border-b border-[#EEF1F5] transition-all duration-150 hover:bg-[#EEF1F5] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#EEF1F5]'}`}>
                  <td className="px-6 py-4 font-medium text-[#1E2A32] max-w-[240px] truncate" title={`${r.data?.nombre || ''} ${r.data?.apellido || ''}`}>
                    {`${r.data?.nombre || ''} ${r.data?.apellido || ''}`}
                  </td>
                  <td className="px-6 py-4 text-[#3F4D58] max-w-[200px] truncate" title={r.data?.especialidad || ''}>{r.data?.especialidad || <span className="text-[#8E9AA6]">-</span>}</td>
                  <td className="px-6 py-4 text-[#3F4D58]">{r.data?.perfil || <span className="text-[#8E9AA6]">-</span>}</td>
                  <td className="px-6 py-4">
                    {editingId === r.id ? (
                      <div className="space-y-1.5">
                        <select
                          autoFocus
                          value={statusDraft}
                          onChange={(e) => setStatusDraft(e.target.value)}
                          className="px-2 py-1.5 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                        >
                          <option value="">Sin estatus</option>
                          {allStatusOptions.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Observación (opcional)"
                          className="w-64 px-2.5 py-1.5 border border-[#E4E8EE] rounded-xl text-xs bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => updateStatus(r.id, statusDraft)}
                            className="px-2.5 py-1 text-xs font-medium bg-[#0F766E] text-white rounded-lg hover:bg-[#115E59] transition-colors"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setStatusDraft(''); setComment('') }}
                            className="px-2.5 py-1 text-xs font-medium text-[#3F4D58] bg-[#EEF1F5] rounded-lg hover:bg-[#D5DBE3] transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <button
                          onClick={() => {
                            setEditingId(r.id)
                            setStatusDraft(r.data?.estatus_cirugia || '')
                            setComment(r.data?.observacion_estatus || '')
                          }}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-200 ${
                            statusStyles[r.data?.estatus_cirugia] || 'bg-white text-[#7A8694] border-[#E4E8EE] hover:border-[#E4E8EE]'
                          }`}
                        >
                          {r.data?.estatus_cirugia || 'Asignar'}
                        </button>
                        {r.data?.observacion_estatus && (
                          <p className="max-w-[260px] truncate text-xs text-[#5F6C79]" title={r.data.observacion_estatus}>
                            {r.data.observacion_estatus}
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && hasMore && (
            <div className="flex items-center justify-center gap-2 py-3 border-t border-[#E4E8EE]">
              {loadingMore ? (
                <div className="w-5 h-5 border-2 border-[#5F6C79] border-t-transparent rounded-full animate-spin" />
              ) : (
                <button
                  onClick={() => loadPage(false)}
                  className="px-3 py-1.5 text-xs font-medium text-[#115E59] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#F7F8FA] transition-colors"
                >
                  Cargar más
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showStatusModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowStatusModal(false)}>
          <div className="bg-white rounded-2xl w-[95vw] max-w-xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E8EE] shrink-0">
              <h2 className="font-serif text-lg font-bold text-[#1E2A32]">Administrar estatus de cirugía</h2>
              <button onClick={() => setShowStatusModal(false)} className="text-[#7A8694] hover:text-[#3F4D58] text-xl leading-none p-1 rounded-full hover:bg-[#EEF1F5]">×</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-2">
              {editingStatus ? (
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="text"
                    value={newStatusName}
                    onChange={(e) => setNewStatusName(e.target.value)}
                    autoFocus
                    placeholder={`Nuevo nombre para "${editingStatus.name}"`}
                    className="flex-1 px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                  />
                  <button
                    onClick={handleRenameStatus}
                    disabled={statusSaving}
                    className="px-4 py-2 text-sm bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] transition-all duration-200 font-medium disabled:opacity-50"
                  >
                    {statusSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button onClick={() => setEditingStatus(null)} className="px-3 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200">
                    Cancelar
                  </button>
                </div>
              ) : (
                <>
                  {creatingStatus ? (
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="text"
                        value={newStatusName}
                        onChange={(e) => setNewStatusName(e.target.value)}
                        autoFocus
                        placeholder="Nombre del nuevo estatus"
                        className="flex-1 px-3 py-2 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                      />
                      <button
                        onClick={handleCreateStatus}
                        disabled={statusSaving}
                        className="px-4 py-2 text-sm bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] transition-all duration-200 font-medium disabled:opacity-50"
                      >
                        {statusSaving ? 'Guardando...' : 'Crear'}
                      </button>
                      <button
                        onClick={() => { setCreatingStatus(false); setNewStatusName('') }}
                        className="px-3 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setCreatingStatus(true); setNewStatusName('') }}
                      className="mb-3 flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#115E59] bg-[#F7F8FA] border border-[#E4E8EE] rounded-xl hover:bg-[#EEF1F5] transition-all duration-200"
                    >
                      <Plus size={15} />
                      Nuevo estatus
                    </button>
                  )}
                  <div className="relative mb-3">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8694]" />
                    <input
                      type="text"
                      value={statusSearch}
                      onChange={(e) => setStatusSearch(e.target.value)}
                      placeholder="Buscar estatus..."
                      className="w-full pl-9 pr-3 py-2 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                    />
                  </div>
                  {(() => {
                    const groups = similarStatuses(filteredStatuses).filter((g) => !dismissedStatusGroups.includes(groupKey(g.names)))
                    if (groups.length === 0) return null
                    const markAsRead = () => {
                      const keys = similarStatuses(filteredStatuses).map((g) => groupKey(g.names))
                      const merged = Array.from(new Set([...dismissedStatusGroups, ...keys]))
                      setDismissedStatusGroups(merged)
                      localStorage.setItem('sbj_status_similar_dismissed', JSON.stringify(merged))
                      toast('Advertencia marcada como leída', 'success')
                    }
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Advertencia</p>
                          <button
                            onClick={markAsRead}
                            className="flex items-center gap-1 text-[0.6875rem] font-semibold text-amber-700 hover:text-amber-900 transition-colors duration-200 shrink-0"
                          >
                            <Check size={12} />
                            Marcar como leída
                          </button>
                        </div>
                        <p className="text-xs text-amber-700 mt-1">
                          Se detectaron {groups.length} grupo(s) de estatus con nombres similares:
                        </p>
                        <ul className="mt-2 space-y-1">
                          {groups.map((g, gi) => (
                            <li key={gi} className="text-xs text-amber-800">
                              • {g.names.join('  /  ')}
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-amber-600 mt-2">
                          Considere unificarlos renombrando para evitar duplicados. Si ya los revisó, márquelos como leídos para ocultar esta advertencia.
                        </p>
                      </div>
                    )
                  })()}
                  {filteredStatuses.map((s) => (
                    <div key={s.name} className="flex items-center justify-between gap-3 px-4 py-3 bg-[#F7F8FA] border border-[#E4E8EE] rounded-xl">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1E2A32] truncate">{s.name}</p>
                        <p className="text-xs text-[#7A8694]">{s.count} expediente(s)</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setEditingStatus(s); setNewStatusName(s.name) }}
                          className="p-2 text-[#5F6C79] hover:text-[#2B3A45] hover:bg-[#EEF1F5] rounded-lg transition-colors duration-200"
                          title="Renombrar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteStatus(s)}
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
              {allStatuses.length === 0 && !editingStatus && (
                <p className="text-sm text-[#7A8694] text-center py-8">Aún no hay estatus registrados. Agrega el primero con «Nuevo estatus».</p>
              )}
              {!editingStatus && statusSearch.trim() && filteredStatuses.length === 0 && (
                <p className="text-sm text-[#7A8694] text-center py-8">Sin resultados para "{statusSearch}"</p>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <h3 className="font-serif text-lg font-bold text-[#1E2A32] mb-2">
              Eliminar estatus "{deleteTarget.name}"
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
              {allStatuses
                .map((x) => x.name)
                .filter((n) => n !== deleteTarget.name)
                .map((n) => (
                  <option key={n} value={n} />
                ))}
            </datalist>
            <p className="mt-2 text-xs text-[#7A8694]">
              Si lo deja vacío, el estatus se quitará de los expedientes sin reemplazo.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200"
              >
                Cancelar
              </button>
              <button
                onClick={() => void confirmDeleteStatus()}
                disabled={deleting || replaceValue.trim() === deleteTarget.name}
                className="px-5 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 shadow-sm transition-all duration-200 disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
