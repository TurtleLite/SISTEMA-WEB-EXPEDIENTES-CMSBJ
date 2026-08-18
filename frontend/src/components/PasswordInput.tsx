import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export function PasswordInput({ value, onChange, placeholder, className = '', disabled = false }: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        disabled={disabled}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A8694] hover:text-[#3F4D58] transition-colors duration-200 disabled:text-[#8E9AA6]"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}
