import { useState, useEffect } from 'react'

function formatMdp(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

function formatMask(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

function maskToIso(masked: string): string | null {
  const d = masked.replace(/\D/g, '')
  if (d.length !== 8) return null
  const mm = d.slice(0, 2)
  const dd = d.slice(2, 4)
  const yyyy = d.slice(4, 8)
  const m = parseInt(mm, 10)
  const day = parseInt(dd, 10)
  const y = parseInt(yyyy, 10)
  if (m < 1 || m > 12) return null
  if (day < 1 || day > 31) return null
  if (y < 1900 || y > 2100) return null
  const iso = `${yyyy}-${mm}-${dd}`
  const date = new Date(iso + 'T00:00:00')
  if (isNaN(date.getTime())) return null
  // validar que no haya overflow (ej 02/31)
  if (date.getMonth() + 1 !== m || date.getDate() !== day) return null
  return iso
}

export function NacimientoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [inputValue, setInputValue] = useState(value ? formatMdp(value) : '')

  useEffect(() => {
    setInputValue(value ? formatMdp(value) : '')
  }, [value])

  return (
    <input
      type="text"
      inputMode="numeric"
      value={inputValue}
      onChange={(e) => {
        const formatted = formatMask(e.target.value)
        setInputValue(formatted)
        const iso = maskToIso(formatted)
        if (iso) {
          onChange(iso)
        } else if (formatted === '') {
          onChange('')
        }
        // si está incompleto no actualizamos value, edad se mantiene hasta completar
      }}
      placeholder="MM/DD/AAAA"
      maxLength={10}
      className="w-full px-3 py-2 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] text-center font-mono tracking-wide"
    />
  )
}
