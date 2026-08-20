import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface ScrollSelectOption {
  value: string
  label: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: ScrollSelectOption[]
  placeholder?: string
  disabled?: boolean
  allowEmpty?: boolean
  buttonClassName?: string
  panelClassName?: string
}

export default function ScrollSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccione...',
  disabled,
  allowEmpty = false,
  buttonClassName,
  panelClassName,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  const selected = options.find((o) => o.value === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center justify-between gap-2 bg-white text-left disabled:opacity-50 disabled:cursor-not-allowed ${
          open ? 'ring-2 ring-[#8E9AA6] border-[#5F6C79]' : ''
        } ${
          buttonClassName ||
          'w-full px-3 py-2 border border-[#E4E8EE] rounded-lg text-sm'
        }`}
      >
        <span className={`truncate ${selected ? 'text-[#1E2A32]' : 'text-[#7A8694]'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`text-[#8E9AA6] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className={`absolute left-0 top-full mt-1 z-50 min-w-full bg-white border border-[#E4E8EE] rounded-xl shadow-sm overflow-hidden ${panelClassName || ''}`}
        >
          <div className="max-h-[288px] overflow-y-auto py-1">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  value === '' ? 'text-[#0F766E] font-medium' : 'text-[#3F4D58] hover:bg-[#EEF1F5]'
                }`}
              >
                <span className="truncate">{placeholder}</span>
                {value === '' && <Check size={15} className="shrink-0" />}
              </button>
            )}
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  o.value === value ? 'text-[#0F766E] font-medium' : 'text-[#3F4D58] hover:bg-[#EEF1F5]'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check size={15} className="shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}