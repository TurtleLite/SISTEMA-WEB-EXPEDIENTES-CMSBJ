import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formattedDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function NacimientoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  const [view, setView] = useState<Date>(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00')
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1)
    }
    const h = new Date()
    return new Date(h.getFullYear(), h.getMonth(), 1)
  })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false)
      }
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [])

  const today = isoDate(new Date())

  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
  const firstWeekday = new Date(view.getFullYear(), view.getMonth(), 1).getDay()
  const monthLabel = view.toLocaleDateString('es-HN', { month: 'long', year: 'numeric' })

  const cells: (string | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoDate(new Date(view.getFullYear(), view.getMonth(), d)))

  const goMonth = (delta: number) => {
    const m = view.getMonth() + delta
    const y = view.getFullYear() + (m < 0 ? -1 : m > 11 ? 1 : 0)
    const mm = ((m % 12) + 12) % 12
    setView(new Date(y, mm, 1))
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShow(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={value ? formattedDate(value) : ''}
          placeholder="DD/MM/AAAA"
          className="flex-1 px-3 py-2 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79]"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="px-3 py-2 text-sm text-[#115E59] bg-white border border-[#E4E8EE] rounded-lg hover:bg-[#F7F8FA] transition-colors flex items-center gap-1.5"
        >
          <CalendarDays size={16} />
          <span className="hidden sm:inline">Calendario</span>
        </button>
      </div>
      {show && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-xl border border-[#E4E8EE] p-3 w-72">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              className="p-1.5 text-[#7A8694] hover:text-[#1E2A32] rounded-lg hover:bg-[#F7F8FA] transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold text-[#1E2A32]">{monthLabel}</span>
            <button
              type="button"
              onClick={() => goMonth(1)}
              className="p-1.5 text-[#7A8694] hover:text-[#1E2A32] rounded-lg hover:bg-[#F7F8FA] transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((wd, i) => (
              <span key={i} className="text-center text-[0.625rem] font-semibold text-[#7A8694] uppercase">{wd}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, i) => {
              if (!cell) return <span key={i} />
              const isSelected = cell === value
              const isToday = cell === today
              const dayNum = Number(cell.slice(8))
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(cell); setShow(false) }}
                  title={isToday ? 'Hoy' : ''}
                  className={`relative flex flex-col items-center justify-center rounded-lg py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-[#0F766E] text-white font-semibold shadow-sm'
                      : isToday
                        ? 'bg-[#EEF7F5] text-[#0F766E] font-semibold hover:bg-[#D8EFEA]'
                        : 'text-[#3F4D58] hover:bg-[#F7F8FA]'
                  }`}
                >
                  <span>{dayNum}</span>
                  {isToday && !isSelected && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#0F766E]" />
                  )}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex items-center justify-between text-[0.6875rem] text-[#7A8694]">
            <button
              type="button"
              onClick={() => { onChange(''); setShow(false) }}
              className="text-[#7A8694] hover:text-[#1E2A32] underline underline-offset-2"
            >
              Limpiar
            </button>
            <span>Seleccione la fecha de nacimiento del paciente</span>
            <button
              type="button"
              onClick={() => setShow(false)}
              className="text-[#7A8694] hover:text-[#1E2A32] underline underline-offset-2"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
