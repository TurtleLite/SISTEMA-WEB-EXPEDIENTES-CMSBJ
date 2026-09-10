import { useState, useEffect } from 'react'

function parseMdp(raw: string): string | null {
  if (!raw) return null
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const mm = String(m[1]).padStart(2, '0')
  const dd = String(m[2]).padStart(2, '0')
  const yyyy = m[3]
  const iso = `${yyyy}-${mm}-${dd}`
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  return iso
}

function formatMdp(iso: string): string {
  if (!iso) return ''
  if (iso.includes('-')) {
    const d = new Date(iso + 'T00:00:00')
    if (isNaN(d.getTime())) return ''
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${mm}/${dd}/${d.getFullYear()}`
  }
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
      value={inputValue}
      onChange={(e) => {
        const raw = e.target.value
        setInputValue(raw)
        const parsed = parseMdp(raw)
        if (parsed) onChange(parsed)
      }}
      onFocus={() => setInputValue(value ? formatMdp(value) : '')}
      placeholder="MM/DD/AAAA"
      className="flex-1 px-3 py-2 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] text-center font-mono tracking-wide"
    />
  )
}
