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
  // Mostrar lo que el usuario escribe con plecas fijas en posiciones 2 y 5
  // Si no hay dígitos en una posición, mostrar espacio
  return (d[0] || ' ') + (d[1] || ' ') + '/' + (d[2] || ' ') + (d[3] || ' ') + '/' + (d[4] || ' ') + (d[5] || ' ') + (d[6] || ' ') + (d[7] || ' ')
}

function maskToIso(masked: string): string | null {
  const d = masked.replace(/\D/g, '')
  if (d.length !== 8) return null
  let mm = d.slice(0, 2)
  let dd = d.slice(2, 4)
  const yyyy = d.slice(4, 8)
  let m = parseInt(mm, 10)
  let day = parseInt(dd, 10)
  const y = parseInt(yyyy, 10)
  if (y < 1900 || y > 2100) return null

  // Si mes > 12, asumir formato DD/MM/YYYY e intercambiar
  if (m > 12) {
    const temp = mm
    mm = dd
    dd = temp
    m = parseInt(mm, 10)
    day = parseInt(dd, 10)
  }

  if (m < 1 || m > 12) return null
  if (day < 1 || day > 31) return null
  const iso = `${yyyy}-${mm}-${dd}`
  const date = new Date(iso + 'T00:00:00')
  if (isNaN(date.getTime())) return null
  if (date.getMonth() + 1 !== m || date.getDate() !== day) return null
  return iso
}

function formatDisplay(value: string): string {
  if (!value) return ''
  if (value.includes('/')) return value
  if (/^\d{1,8}$/.test(value)) return formatMask(value)
  return formatMdp(value)
}

export function NacimientoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [inputValue, setInputValue] = useState(() => formatDisplay(value))

  useEffect(() => {
    setInputValue(formatDisplay(value))
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 8)
    const formatted = formatMask(raw)
    setInputValue(formatted)
    if (formatted === '') {
      onChange('')
      return
    }
    const iso = maskToIso(formatted)
    if (iso) {
      onChange(iso)
    }
    // Durante la digitación (formato mask incompleto), no enviar al parent
    // El parent recibirá el valor solo cuando la fecha esté completa (ISO válido)
    // Esto evita cálculos de edad con valores intermedios inválidos
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={inputValue}
      onChange={handleChange}
      placeholder="MM/DD/AAAA"
      maxLength={10}
      className="w-full px-3 py-2 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] text-center font-mono tracking-wide"
    />
  )
}

export { maskToIso }
