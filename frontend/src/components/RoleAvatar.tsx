import { ShieldCheck, Building2, Stethoscope, HeartPulse, UserCircle2 } from 'lucide-react'
import { ROLE_META } from '../constants'

const ROLE_ICONS: Record<string, React.ReactNode> = {
  admin: <ShieldCheck />,
  direccion: <Building2 />,
  direccion_medica: <Stethoscope />,
  medico: <HeartPulse />,
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'from-violet-600 to-violet-900',
  direccion: 'from-[#0F766E] to-[#115E59]',
  direccion_medica: 'from-sky-600 to-sky-800',
  medico: 'from-emerald-600 to-emerald-800',
}

const SIZES = {
  sm: 'w-8 h-8 text-[11px] rounded-lg',
  md: 'w-11 h-11 text-sm rounded-xl',
  lg: 'w-16 h-16 text-2xl rounded-2xl',
}

export function RoleAvatar({ role, size = 'md' }: { role?: string; size?: 'sm' | 'md' | 'lg' }) {
  const meta = ROLE_META[role || ''] || ROLE_META.medico
  return (
    <div className={`bg-gradient-to-br ${ROLE_COLORS[role || ''] || meta.gradient} text-white flex items-center justify-center shadow-md shrink-0 ${SIZES[size]}`}>
      {ROLE_ICONS[role || ''] || <UserCircle2 />}
    </div>
  )
}
