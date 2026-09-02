import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { listsApi, dayListsApi } from '../services/api'
import { ListRecord, ListDefinition } from '../types'
import { useNotification } from '../contexts/NotificationContext'
import {
  Search, Plus, Trash2, Save, GripVertical,
  ChevronLeft, ChevronRight, X, ClipboardList, FileSpreadsheet, CalendarDays,
} from 'lucide-react'

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function patientName(r: ListRecord): string {
  const d = r.data || {}
  return [d.nombre, d.apellido].filter(Boolean).join(' ').trim() || 'Sin nombre'
}

const EXCLUDED_STATUSES = ['Operado', 'Fuera de perfil San Benito', 'No apto para cirugía', 'En lista']
const PAGE_SIZE = 50

export function DayList() {
  const { toast } = useNotification()
  const [listId, setListId] = useState<string | null>(null)
  const [available, setAvailable] = useState<ListRecord[]>([])
  const [availableTotal, setAvailableTotal] = useState(0)
  const [availablePage, setAvailablePage] = useState(1)
  const [availableHasMore, setAvailableHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cart, setCart] = useState<ListRecord[]>([])
  const [date, setDate] = useState<string>(isoDate(new Date()))
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('En espera')
  const [loadingDate, setLoadingDate] = useState(false)
  const [saved, setSaved] = useState(false)
  const availableScrollRef = useRef<HTMLDivElement>(null)
  const reqRef = useRef(0)
  const [savedLists, setSavedLists] = useState<Record<string, number>>({})
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const calendarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const listsRes = await listsApi.list()
        const lists: ListDefinition[] = listsRes.data
        const system = lists.find((l) => l.is_system)
        if (system && !cancelled) setListId(system.id)
      } catch {
        if (!cancelled) toast('Error al cargar expedientes', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const loadSavedLists = useCallback(async () => {
    try {
      const res = await dayListsApi.list()
      const map: Record<string, number> = {}
      const list: any[] = Array.isArray(res.data) ? res.data : []
      list.forEach((dl: any) => {
        if (dl?.date && dl?.count != null) map[dl.date] = dl.count
      })
      setSavedLists(map)
    } catch {
      setSavedLists({})
    }
  }, [])

  useEffect(() => {
    loadSavedLists()
  }, [loadSavedLists])

  useEffect(() => {
    if (!showCalendar) return
    const handler = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setShowCalendar(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCalendar])

  const loadAvailable = useCallback(async (reset = false) => {
    if (!listId) return false
    const next = reset ? 1 : availablePage + 1
    const reqId = ++reqRef.current
    setLoadingMore(true)
    try {
      const excluded = EXCLUDED_STATUSES.filter((s) => s !== statusFilter)
      const params: Record<string, any> = {
        page: next,
        page_size: PAGE_SIZE,
        exclude_statuses: excluded.join(','),
      }
      if (statusFilter === 'En espera') params.waiting_only = true
      else if (statusFilter !== 'all') params.estatus_cirugia = statusFilter
      if (search.trim()) params.search = search.trim()
      const res = await listsApi.getRecords(listId, params)
      if (reqId !== reqRef.current) return false
      const data = res.data
      setAvailablePage(data.page)
      setAvailableTotal(data.total)
      setAvailableHasMore(data.page * data.page_size < data.total)
      setAvailable(reset ? data.items : (prev) => [...prev, ...data.items])
      return true
    } catch {
      if (reqId === reqRef.current) toast('Error al cargar expedientes', 'error')
      return false
    } finally {
      if (reqId === reqRef.current) setLoadingMore(false)
    }
  }, [listId, availablePage, search, statusFilter])

  useEffect(() => {
    if (!listId) return
    setLoading(true)
    setAvailable([])
    setAvailablePage(0)
    loadAvailable(true).then((fresh) => {
      if (fresh) setLoading(false)
    })
  }, [listId, search, statusFilter])

  const handleAvailableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      if (availableHasMore && !loadingMore) loadAvailable(false)
    }
  }

  useEffect(() => {
    if (!date || !listId) return
    let cancelled = false
    setLoadingDate(true)
    dayListsApi.get(date)
      .then(async (res) => {
        if (cancelled) return
        const ids: string[] = (res.data?.record_ids || []).map(String)
        const order: Record<string, number> = {}
        ids.forEach((id: string, idx: number) => { order[id] = idx })
        let items: ListRecord[] = []
        if (ids.length > 0) {
          try {
            const recRes = await listsApi.getRecordsByIds(listId, ids)
            const byId: Record<string, ListRecord> = {}
            recRes.data.forEach((r: ListRecord) => { byId[r.id] = r })
            items = ids
              .map((id: string) => byId[id])
              .filter((r): r is ListRecord => Boolean(r))
              .filter((r) => !(r.data?.estatus_cirugia && EXCLUDED_STATUSES.includes(r.data.estatus_cirugia)))
          } catch {
            items = []
          }
        }
        if (cancelled) return
        items.sort((a: ListRecord, b: ListRecord) => (order[a.id] ?? 0) - (order[b.id] ?? 0))
        setCart(items)
        setSaved(res.data?.id != null)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingDate(false) })
    return () => { cancelled = true }
  }, [date, listId])

  const visibleAvailable = useMemo(() =>
    available.filter((r) => !cart.some((c) => c.id === r.id)),
  [available, cart])

  const add = (r: ListRecord) => {
    if (cart.some((c) => c.id === r.id)) return
    setCart((prev) => [...prev, r])
    setSaved(false)
  }

  const remove = (id: string) => {
    setCart((prev) => prev.filter((r) => r.id !== id))
    setSaved(false)
  }

  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDrop = (targetId: string) => {
    setDragOverId(null)
    if (!dragId || dragId === targetId) { setDragId(null); return }
    setCart((prev) => {
      const from = prev.findIndex((r) => r.id === dragId)
      const to = prev.findIndex((r) => r.id === targetId)
      if (from < 0 || to < 0) return prev
      const esp = prev[from].data?.especialidad || 'Sin especialidad'
      if ((prev[to].data?.especialidad || 'Sin especialidad') !== esp) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      const adjustedTo = next.findIndex((r) => r.id === targetId)
      if (adjustedTo < 0) return prev
      next.splice(adjustedTo, 0, item)
      return next
    })
    setDragId(null)
    setSaved(false)
  }

  const save = async () => {
    if (!date) return
    try {
      await dayListsApi.save(date, cart.map((r) => r.id))
      setSaved(true)
      loadSavedLists()
      toast('Listado guardado', 'success')
    } catch {
      toast('Error al guardar el listado', 'error')
    }
  }

  const clear = async () => {
    try {
      await dayListsApi.delete(date)
      setCart([])
      setSaved(true)
      loadSavedLists()
      toast('Listado del día vaciado', 'success')
    } catch {
      setCart([])
      setSaved(true)
    }
  }

  const exportExcel = async () => {
    if (cart.length === 0) {
      toast('El listado está vacío', 'error')
      return
    }
    try {
      await dayListsApi.save(date, cart.map((r) => r.id))
      const res = await dayListsApi.exportExcel(date)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `LISTADO_${date}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
      setSaved(true)
      toast('Excel generado correctamente', 'success')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al generar Excel', 'error')
    }
  }

  const shift = (n: number) => {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + n)
    setDate(isoDate(d))
  }

  const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('es-HN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const startWeekday = firstDay.getDay()
    const cells: (string | null)[] = []
    for (let i = 0; i < startWeekday; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(isoDate(new Date(year, month, d)))
    return cells
  }, [calendarMonth])

  const calendarTitle = calendarMonth.toLocaleDateString('es-HN', {
    month: 'long', year: 'numeric',
  })

  const hasSavedListInMonth = useMemo(() => {
    const prefix = isoDate(calendarMonth).slice(0, 7)
    return Object.keys(savedLists).some((d) => d.startsWith(prefix))
  }, [savedLists, calendarMonth])
  const countByEspecialidad = useMemo(() => {
    const m: Record<string, number> = {}
    cart.forEach((r) => {
      const k = r.data?.especialidad || 'Sin especialidad'
      m[k] = (m[k] || 0) + 1
    })
    return m
  }, [cart])

  const grouped = useMemo(() => {
    const sections: { esp: string; items: { r: ListRecord; gi: number }[] }[] = []
    const map = new Map<string, typeof sections[number]>()
    cart.forEach((r, gi) => {
      const esp = r.data?.especialidad || 'Sin especialidad'
      let sec = map.get(esp)
      if (!sec) {
        sec = { esp, items: [] }
        map.set(esp, sec)
        sections.push(sec)
      }
      sec.items.push({ r, gi })
    })
    return sections
  }, [cart])

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <h1 className="font-serif text-2xl font-bold text-[#1E2A32]">Listado Diario de Cirugías</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-[#5F6C79] hidden sm:block">Fecha del listado:</label>
          <div className="flex items-center gap-1 bg-white border border-[#E4E8EE] rounded-xl px-1.5 py-1 shadow-sm">
            <button onClick={() => shift(-1)} className="p-1 text-[#7A8694] hover:text-[#1E2A32] rounded-lg hover:bg-[#F7F8FA] transition-colors">
              <ChevronLeft size={16} />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm text-[#2B3A45] bg-transparent focus:outline-none"
            />
            <button onClick={() => shift(1)} className="p-1 text-[#7A8694] hover:text-[#1E2A32] rounded-lg hover:bg-[#F7F8FA] transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            onClick={() => setDate(isoDate(new Date()))}
            className="px-2.5 py-1.5 text-xs font-medium text-[#115E59] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#F7F8FA] transition-colors"
          >
            Hoy
          </button>
          <button
            onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); setDate(isoDate(d)) }}
            className="px-2.5 py-1.5 text-xs font-medium text-[#115E59] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#F7F8FA] transition-colors"
          >
            Mañana
          </button>
          <div className="relative" ref={calendarRef}>
            <button
              onClick={() => setShowCalendar((v) => !v)}
              title="Calendario de listados"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#115E59] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#F7F8FA] transition-colors"
            >
              <CalendarDays size={14} />
              <span className="hidden sm:inline">Calendario</span>
              {Object.keys(savedLists).length > 0 && (
                <span className="w-2 h-2 rounded-full bg-[#0F766E]" />
              )}
            </button>
            {showCalendar && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-xl border border-[#E4E8EE] p-3 w-72">
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                    className="p-1 text-[#7A8694] hover:text-[#1E2A32] rounded-lg hover:bg-[#F7F8FA] transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-semibold text-[#1E2A32] capitalize">{calendarTitle}</span>
                  <button
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                    className="p-1 text-[#7A8694] hover:text-[#1E2A32] rounded-lg hover:bg-[#F7F8FA] transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((wd, i) => (
                    <span key={i} className="text-center text-[0.625rem] font-semibold text-[#7A8694] uppercase">{wd}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((cell, i) => {
                    if (!cell) return <span key={i} />
                    const count = savedLists[cell]
                    const isSelected = cell === date
                    const isToday = cell === isoDate(new Date())
                    return (
                      <button
                        key={i}
                        onClick={() => { setDate(cell); setShowCalendar(false) }}
                        title={count != null ? `Listado: ${count} paciente(s)` : 'Sin listado'}
                        className={`relative flex flex-col items-center justify-center rounded-lg py-1 text-xs transition-colors ${
                          isSelected
                            ? 'bg-[#0F766E] text-white font-semibold'
                            : count != null
                              ? 'bg-[#EEF7F5] text-[#0F766E] font-semibold hover:bg-[#D8EFEA]'
                              : 'text-[#3F4D58] hover:bg-[#F7F8FA]'
                        }`}
                      >
                        <span>{Number(cell.slice(8))}</span>
                        {count != null && (
                          <span className={`text-[0.5625rem] leading-none ${isSelected ? 'text-white/80' : 'text-[#0F766E]'}`}>
                            {count}
                          </span>
                        )}
                        {isToday && count == null && <span className="text-[0.5625rem] leading-none text-[#8E9AA6]">hoy</span>}
                      </button>
                    )
                  })}
                </div>
                {hasSavedListInMonth && (
                  <div className="mt-2 pt-2 border-t border-[#E4E8EE] flex items-center gap-2 text-[0.6875rem] text-[#5F6C79]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E]" />
                    Días con listado guardado (número = pacientes)
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 grid lg:grid-cols-2 gap-4 min-h-0 mt-4">
        {/* Panel pacientes disponibles */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E4E8EE] flex flex-col min-h-0">
          <div className="p-3 border-b border-[#E4E8EE] space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#1E2A32]">Pacientes disponibles</h2>
              <span className="text-xs text-[#7A8694]">{availableTotal} pacientes</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8694] pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar paciente, especialidad, perfil..."
                  className="w-full pl-8 pr-3 py-2 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                title="Filtrar por estatus de cirugía"
                className="px-2.5 py-2 border border-[#E4E8EE] rounded-xl text-xs text-[#3F4D58] bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
              >
                <option value="En espera">En espera</option>
                <option value="En lista">En lista</option>
                <option value="Reprogramar">Reprogramar</option>
                <option value="Cancelado">Cancelado</option>
                <option value="No se presentó">No se presentó</option>
                <option value="all">Todos los estatus</option>
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0" onScroll={handleAvailableScroll} ref={availableScrollRef}>
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-[#7A8694] py-12">
                <div className="w-5 h-5 border-2 border-[#5F6C79] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Cargando...</span>
              </div>
            ) : visibleAvailable.length === 0 ? (
              <p className="text-sm text-[#7A8694] text-center py-12">
                {search || statusFilter !== 'all' ? 'No encontramos pacientes con ese criterio. Revisa el nombre o el filtro.' : 'No hay pacientes sin asignar para esta fecha. Prueba con otra fecha.'}
              </p>
            ) : (
              <ul className="divide-y divide-[#E4E8EE]">
                {visibleAvailable.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => add(r)}
                      className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-[#F7F8FA] transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1E2A32] truncate">{patientName(r)}</p>
                        <p className="text-xs text-[#5F6C79] truncate">
                          {[r.data?.especialidad, r.data?.perfil].filter(Boolean).join(' · ') || <span className="text-[#8E9AA6]">Sin datos</span>}
                        </p>
                      </div>
                      <StatusBadge status={r.data?.estatus_cirugia} />
                      <span className="w-7 h-7 rounded-lg bg-[#0F766E] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Plus size={15} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!loading && (
              <div className="flex flex-col items-center gap-2 py-3">
                {loadingMore ? (
                  <div className="w-5 h-5 border-2 border-[#5F6C79] border-t-transparent rounded-full animate-spin" />
                ) : availableHasMore ? (
                  <button
                    onClick={() => loadAvailable(false)}
                    className="px-3 py-1.5 text-xs font-medium text-[#115E59] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#F7F8FA] transition-colors"
                  >
                    Cargar más
                  </button>
                ) : null}
                {visibleAvailable.length > 0 && (
                  <p className="text-xs text-[#7A8694]">
                    Mostrando {visibleAvailable.length} de {availableTotal}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Panel carrito del día */}
        <div className="bg-white rounded-xl shadow-sm border border-[#E4E8EE] flex flex-col min-h-0">
          <div className="p-3 border-b border-[#E4E8EE] flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-[#1E2A32]">
              Listado del día <span className="text-[#0F766E]">· {dayLabel}</span>
            </h2>
            {loadingDate && <div className="w-4 h-4 border-2 border-[#0F766E] border-t-transparent rounded-full animate-spin" />}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={save}
                disabled={loadingDate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0F766E] text-white rounded-xl text-xs font-medium hover:bg-[#115E59] transition-colors disabled:opacity-50"
              >
                <Save size={14} />
                {saved ? 'Guardado' : 'Guardar'}
              </button>
              <button
                onClick={exportExcel}
                disabled={cart.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF1F5] text-[#3F4D58] rounded-xl text-xs font-medium border border-[#E4E8EE] hover:bg-[#EEF1F5] transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                <FileSpreadsheet size={14} />
                Excel
              </button>
              {cart.length > 0 && (
                <button
                  onClick={clear}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-red-400 bg-red-50 rounded-xl text-xs font-medium hover:bg-red-100 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loadingDate ? (
              <div className="flex items-center justify-center gap-2 text-[#7A8694] py-12">
                <div className="w-5 h-5 border-2 border-[#5F6C79] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Cargando listado...</span>
              </div>
            ) : cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#7A8694]">
                <ClipboardList size={32} />
                <p className="text-sm">Agrega pacientes del panel izquierdo para armar el listado del día.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#E4E8EE]">
                {grouped.map((sec) => (
                  <div key={sec.esp}>
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#F7F8FA] border-y border-[#E4E8EE]">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#115E59]">{sec.esp}</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-[#0F766E] text-white text-[0.625rem] font-semibold">{sec.items.length}</span>
                    </div>
                    <ul className="divide-y divide-[#E4E8EE]">
                      {sec.items.map(({ r }, localIdx) => (
                        <li
                          key={r.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, r.id)}
                          onDragOver={(e) => { e.preventDefault(); setDragOverId(r.id) }}
                          onDrop={(e) => { e.preventDefault(); handleDrop(r.id) }}
                          onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                          className={`px-4 py-2.5 flex items-center gap-3 transition-colors ${dragOverId === r.id && dragId && dragId !== r.id ? 'bg-[#EEF1F5] ring-2 ring-inset ring-[#0F766E]/40 cursor-grabbing' : 'hover:bg-[#F7F8FA] cursor-grab'}`}
                        >
                          <span className="w-6 h-6 rounded-full bg-[#0F766E] text-white text-xs font-semibold flex items-center justify-center flex-none">
                            {localIdx + 1}
                          </span>
                          <GripVertical size={14} className="text-[#8E9AA6] flex-none" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#1E2A32] truncate">{patientName(r)}</p>
                            <p className="text-xs text-[#5F6C79] truncate">
                              {[r.data?.edad && `Edad: ${r.data.edad}`, r.data?.perfil, r.data?.diagnostico]
                                .filter(Boolean).join(' · ') || 'Sin datos'}
                            </p>
                          </div>
                          <StatusBadge status={r.data?.estatus_cirugia} />
                          <div className="flex items-center gap-0.5 flex-none">
                            <button onClick={() => remove(r.id)} className="p-1 text-red-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="p-3 border-t border-[#E4E8EE]">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5F6C79]">
                <span><span className="font-semibold text-[#1E2A32]">{cart.length}</span> pacientes</span>
                {Object.entries(countByEspecialidad).map(([esp, n]) => (
                  <span key={esp} className="px-2 py-0.5 rounded-full bg-[#F7F8FA] border border-[#E4E8EE] text-[#115E59]">
                    {esp}: {n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      </div>
  )
}

function StatusBadge({ status }: { status?: string }) {
  const styles: Record<string, string> = {
    'En lista': 'bg-blue-100 text-blue-600 border-blue-200',
    'Operado': 'bg-emerald-100 text-emerald-600 border-emerald-200',
    'En espera': 'bg-yellow-100 text-yellow-600 border-yellow-200',
    'Reprogramar': 'bg-orange-100 text-orange-600 border-orange-200',
    'Cancelado': 'bg-[#EEF1F5] text-[#5F6C79] border-[#D5DBE3]',
    'Fuera de perfil San Benito': 'bg-red-100 text-red-600 border-red-200',
    'No se presentó': 'bg-violet-100 text-violet-600 border-violet-200',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[0.625rem] font-medium border whitespace-nowrap ${styles[status || ''] || 'bg-white text-[#7A8694] border-[#E4E8EE]'}`}>
      {status || 'Sin estatus'}
    </span>
  )
}