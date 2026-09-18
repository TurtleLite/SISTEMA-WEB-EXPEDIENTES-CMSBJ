import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { normalizeText } from '../utils/format'

interface Props {
  value: string
  onChange: (value: string) => void
  options: string[]
  disabled?: boolean
  placeholder?: string
  emptyMessage?: string
}

export default function SearchableSelect({ value, onChange, options, disabled, placeholder, emptyMessage }: Props) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)

  const query = normalizeText(value || '')
  const filtered = query
    ? options.filter((o) => normalizeText(o).includes(query))
    : options

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    setHighlight(-1)
  }, [value, options])

  const select = (option: string) => {
    onChange(option)
    setOpen(false)
  }

  const normalizeOnBlur = () => {
    const typed = (value || '').trim()
    if (!typed) return
    const exact = options.find((o) => normalizeText(o) === normalizeText(typed))
    if (exact && exact !== value) {
      onChange(exact)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1 >= filtered.length ? (filtered.length ? 0 : -1) : h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h <= 0 ? filtered.length - 1 : h - 1))
    } else if (e.key === 'Enter') {
      const item = filtered[highlight >= 0 ? highlight : 0]
      if (item) {
        e.preventDefault()
        select(item)
      }
    } else if (e.key === 'Tab' && filtered[highlight]) {
      select(filtered[highlight])
    }
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={normalizeOnBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full px-3 py-2 pr-9 border border-[#E4E8EE] rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] disabled:bg-[#F7F8FA] disabled:text-[#7A8694] disabled:cursor-not-allowed"
        />
        <ChevronDown
          size={15}
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-[#8E9AA6] pointer-events-none transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </div>
      {open && !disabled && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-full bg-white border border-[#E4E8EE] rounded-xl shadow-sm overflow-hidden">
          <div className="max-h-[288px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[#7A8694]">{emptyMessage || 'Sin coincidencias'}</p>
            ) : (
              filtered.map((opt, i) => {
                const selected = opt === value || normalizeText(opt) === query
                const highlighted = i === highlight
                return (
                  <button
                    key={opt}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => select(opt)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                      highlighted || selected
                        ? 'bg-[#EEF1F5] text-[#0F766E] font-medium'
                        : 'text-[#3F4D58] hover:bg-[#EEF1F5]'
                    }`}
                  >
                    <span className="truncate">{opt}</span>
                    {opt === value && <Check size={15} className="shrink-0" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
