import { useState, useEffect, useCallback, useRef } from 'react'
import { listsApi } from '../services/api'
import { ListRecord, ListDefinition } from '../types'
import { useNotification } from '../contexts/NotificationContext'
import { Search, ChevronDown } from 'lucide-react'

const STATUS_OPTIONS = ['En espera', 'Reprogramar', 'Cancelado', 'Fuera de perfil San Benito', 'Operado', 'No apto para cirugía', 'No se presentó']
const PAGE_SIZE = 50

const statusStyles: Record<string, string> = {
  'Operado': 'bg-emerald-100 text-emerald-600 border-emerald-200',
  'Fuera de perfil San Benito': 'bg-red-100 text-red-600 border-red-200',
  'No apto para cirugía': 'bg-rose-100 text-rose-700 border-rose-200',
  'En espera': 'bg-yellow-100 text-yellow-600 border-yellow-200',
  'Reprogramar': 'bg-orange-100 text-orange-600 border-orange-200',
  'Cancelado': 'bg-[#EEF1F5] text-[#5F6C79] border-[#D5DBE3]',
  'No se presentó': 'bg-violet-100 text-violet-600 border-violet-200',
  'Fuera de perfil': 'bg-red-100 text-red-600 border-red-200',
}

export function EstadoCirugia() {
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

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#1E2A32]">Estatus de Cirugía</h1>
        </div>
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
              {STATUS_OPTIONS.map((s) => (
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
                <th className="text-left px-6 py-4 text-xs font-semibold text-[#7A8694] uppercase tracking-wider">Paciente</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-[#7A8694] uppercase tracking-wider">Especialidad</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-[#7A8694] uppercase tracking-wider">Perfil</th>
                <th className="text-left px-6 py-4 text-xs font-semibold text-[#7A8694] uppercase tracking-wider">Estatus de Cirugía</th>
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
                <tr><td colSpan={4} className="px-4 py-12 text-center text-[#7A8694] text-sm">Sin registros</td></tr>
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
                          {STATUS_OPTIONS.map((s) => (
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
    </div>
  )
}
