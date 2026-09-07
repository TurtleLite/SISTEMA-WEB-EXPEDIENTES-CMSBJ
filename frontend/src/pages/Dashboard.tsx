import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { listsApi } from '../services/api'
import { can } from '../constants'
import {
  Users, FileText, FolderOpen, Lock,
  UserCircle2, Activity, ClipboardList, ShieldCheck, ScrollText,
} from 'lucide-react'

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  direccion: 'Dirección',
  direccion_medica: 'Dirección Médica',
  medico: 'Médico',
  carga_px: 'Carga Px',
  ofthalmologia: 'Oftalmología',
}

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [systemListId, setSystemListId] = useState<string | null>(null)
  const [denied, setDenied] = useState<string | null>(null)

  useEffect(() => {
    listsApi.list()
      .then((res) => {
        const system = res.data.find((l: any) => l.is_system)
        if (system) setSystemListId(system.id)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!denied) return
    const t = setTimeout(() => setDenied(null), 3500)
    return () => clearTimeout(t)
  }, [denied])

  const role = user?.role || 'medico'
  const canEstatus = can(role, 'estatus')
  const canReports = can(role, 'reportes')
  const canLists = can(role, 'listados')
  const canSecurity = can(role, 'auditoria')
  const canExpedientes = can(role, 'expedientes')

  const goExpedientes = () => {
    if (systemListId) {
      navigate(`/lists/${systemListId}`)
      return
    }
    listsApi.list()
      .then((res) => {
        const system = res.data.find((l: any) => l.is_system)
        navigate(system ? `/lists/${system.id}` : '/lists')
      })
      .catch(() => navigate('/lists'))
  }

  const options: { label: string; icon: React.ReactNode; color: string; allowed: boolean; onClick: () => void }[] = [
    {
      label: 'Mi Perfil',
      icon: <UserCircle2 size={22} />,
      color: 'bg-sky-500',
      allowed: true,
      onClick: () => navigate('/perfil'),
    },
    {
      label: 'Expedientes',
      icon: <FolderOpen size={22} />,
      color: 'bg-violet-500',
      allowed: canExpedientes,
      onClick: goExpedientes,
    },
    {
      label: 'Listados',
      icon: <ClipboardList size={22} />,
      color: 'bg-indigo-500',
      allowed: canLists,
      onClick: () => navigate('/listado-diario'),
    },
    {
      label: 'Estatus',
      icon: <Activity size={22} />,
      color: 'bg-rose-500',
      allowed: canEstatus,
      onClick: () => navigate('/estado-cirugia'),
    },
    {
      label: 'Reportes',
      icon: <FileText size={22} />,
      color: 'bg-[#10322C]',
      allowed: canReports,
      onClick: () => navigate('/reports'),
    },
    {
      label: 'Usuarios',
      icon: <Users size={22} />,
      color: 'bg-[#115E59]',
      allowed: role === 'admin',
      onClick: () => navigate('/users'),
    },
    {
      label: 'Sesiones',
      icon: <ShieldCheck size={22} />,
      color: 'bg-teal-600',
      allowed: canSecurity,
      onClick: () => navigate('/seguridad'),
    },
    {
      label: 'Auditoría',
      icon: <ScrollText size={22} />,
      color: 'bg-cyan-600',
      allowed: canSecurity,
      onClick: () => navigate('/auditoria'),
    },
  ]

  const hoy = new Date().toLocaleDateString('es-HN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="h-full flex flex-col min-h-0">
      {denied && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex items-center gap-2.5 bg-rose-50 border-2 border-rose-200 text-rose-700 px-5 py-4 rounded-xl shadow-xl animate-pulse">
          <Lock size={16} className="shrink-0" />
          <p className="text-sm font-semibold">No tienes acceso a {denied}</p>
        </div>
      )}
      <header className="shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[#0F766E] text-xs font-semibold uppercase tracking-[0.18em] truncate">
              Centro Médico San Benito José
            </p>
            <p className="text-[#7A8694] text-sm capitalize truncate">{hoy}</p>
          </div>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#F0FDFA] border border-[#99F6E4] text-xs font-medium text-[#0F766E] shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6]" />
            Sesión activa
          </span>
        </div>

        <h1 className="font-serif text-3xl font-bold tracking-tight text-[#1E2A32] mt-6">{greeting}, {(() => {
          const raw = user?.full_name || user?.username || ''
          return raw.replace(/^(Dr|Dra|Lic)\s+/i, '$1. ')
        })()}</h1>
        <p className="text-[#5F6C79] text-sm mt-1">{roleLabels[role]}</p>
      </header>

      <div className="flex-1 flex items-center min-h-0 mt-7">
        <div className="w-full grid grid-cols-2 lg:grid-cols-4 gap-4">
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => (opt.allowed ? opt.onClick() : setDenied(opt.label))}
              className="h-44 flex flex-col items-center justify-center gap-3 rounded-xl bg-white border border-[#E4E8EE] hover:border-[#0F766E]/40 hover:shadow-md hover:shadow-[#0B2A26]/5 transition-all duration-150 group"
            >
              <div className={`w-11 h-11 rounded-lg ${opt.color} text-white flex items-center justify-center shadow-sm transition-transform duration-150 group-hover:translate-y-[-2px]`}>
                {opt.icon}
              </div>
              <span className="text-[0.9375rem] font-semibold text-[#2B3A45]">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
