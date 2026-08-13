import { ReactNode, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { listsApi } from '../services/api'
import {
  LayoutDashboard, Users, FileText, Table2, LogOut, Activity, UserCircle2, Lock, ClipboardList,
  ShieldCheck, ScrollText,
} from 'lucide-react'
import { ROLE_META } from '../constants'
import { RoleAvatar } from './RoleAvatar'

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  direccion: 'Dirección',
  direccion_medica: 'Dirección Médica',
  medico: 'Médico',
}

interface NavItem {
  label: string
  path: string
  icon: ReactNode
  roles: string[]
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { label: 'Inicio', path: '/dashboard', icon: <LayoutDashboard size={18} />, roles: ['admin', 'direccion', 'direccion_medica', 'medico'] },
      { label: 'Mi Perfil', path: '/perfil', icon: <UserCircle2 size={18} />, roles: ['admin', 'direccion', 'direccion_medica', 'medico'] },
      { label: 'Expedientes', path: '/lists', icon: <Table2 size={18} />, roles: ['admin', 'direccion', 'direccion_medica', 'medico'] },
    ],
  },
  {
    title: 'Estadísticas',
    items: [
      { label: 'Reportes', path: '/reports', icon: <FileText size={18} />, roles: ['direccion', 'direccion_medica'] },
      { label: 'Listados', path: '/listado-diario', icon: <ClipboardList size={18} />, roles: ['direccion', 'direccion_medica'] },
      { label: 'Estatus', path: '/estado-cirugia', icon: <Activity size={18} />, roles: ['direccion', 'direccion_medica'] },
    ],
  },
  {
    title: 'Seguridad',
    items: [
      { label: 'Usuarios', path: '/users', icon: <Users size={18} />, roles: ['admin'] },
      { label: 'Sesiones', path: '/seguridad', icon: <ShieldCheck size={18} />, roles: ['admin'] },
      { label: 'Auditoría', path: '/auditoria', icon: <ScrollText size={18} />, roles: ['admin'] },
    ],
  },
]

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [denied, setDenied] = useState<string | null>(null)

  const visibleSections = navSections

  useEffect(() => {
    if (!denied) return
    const t = setTimeout(() => setDenied(null), 3500)
    return () => clearTimeout(t)
  }, [denied])

  const [systemListId, setSystemListId] = useState<string | null>(null)
  useEffect(() => {
    listsApi.list()
      .then(res => {
        const system = res.data.find((l: any) => l.is_system)
        if (system) setSystemListId(system.id)
      })
      .catch(() => {})
  }, [])

  const handleNavClick = (item: NavItem) => {
    if (!item.roles.includes(user?.role || '')) {
      setDenied(item.label)
      return
    }
    if (item.path !== '/lists') {
      navigate(item.path)
      return
    }
    if (systemListId) {
      navigate(`/lists/${systemListId}`)
      return
    }
    listsApi.list()
      .then(res => {
        const system = res.data.find((l: any) => l.is_system)
        navigate(system ? `/lists/${system.id}` : '/lists')
      })
      .catch(() => navigate('/lists'))
  }

  return (
    <div className="h-screen bg-[#F8F9FA] flex overflow-hidden">
      {denied && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex items-center gap-2.5 bg-rose-50 border-2 border-rose-200 text-rose-700 px-5 py-4 rounded-xl shadow-xl animate-pulse">
          <Lock size={16} className="shrink-0" />
          <p className="text-sm font-semibold">No tienes acceso a {denied}</p>
        </div>
      )}
      <aside className="w-48 bg-white flex flex-col shrink-0 h-screen sticky top-0 shadow-lg">
        <div className="px-5 pt-3 pb-2 border-b border-[#E3E6EB] flex items-center justify-center">
          <img src="/logo_sbj.png" alt="Logo SBJ Cirugias" className="w-36 h-auto mx-auto" />
        </div>
        <nav className="flex-1 px-3 py-2 flex flex-col justify-between overflow-y-auto">
          {visibleSections.map((section) => (
            <div key={section.title} className="mb-1">
              <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#98A0AC]">
                {section.title}
              </p>
              {section.items.map((item) => {
                const target = item.path === '/lists' && systemListId ? `/lists/${systemListId}` : item.path
                const isActive = location.pathname === target || (item.path === '/lists' && location.pathname.startsWith('/lists'))
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNavClick(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 relative ${
                      isActive
                        ? 'bg-[#EDF0F4] text-[#3F4650]'
                        : 'text-[#6F7682] hover:text-[#3F4650] hover:bg-[#F8F9FA]'
                    }`}
                  >
                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#A6AEB8] rounded-full" />}
                    <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-[#E3E6EB]">
          <button
            onClick={() => navigate('/perfil')}
            className="w-full flex items-center gap-3 mb-2 text-left group"
          >
            <div className="transition-transform duration-200 group-hover:scale-110">
              <RoleAvatar role={user?.role} size="sm" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#3F4650] truncate">
                {(() => {
                  const raw = user?.full_name || ''
                  const titleMatch = raw.match(/^(Dr|Dra|Lic)\.?\s+/i)
                  const title = titleMatch ? titleMatch[0].trim().replace(/\.?$/, '.') : ''
                  const rest = (titleMatch ? raw.slice(titleMatch[0].length) : raw).trim().split(/\s+/).filter(Boolean)
                  const first = rest[0] || ''
                  const last = rest.length >= 3 ? rest[2] : rest[1] || ''
                  return [title, first, last]
                    .filter(Boolean)
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(' ')
                })()}
              </p>
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${ROLE_META[user?.role || '']?.badge || ''}`}>
                {roleLabels[user?.role || '']}
              </span>
            </div>
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#6F7682] hover:text-red-500 hover:bg-[#F8F9FA] rounded-lg transition-colors duration-200"
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-gradient-to-r from-[#5F6B80] via-[#6E7B91] to-[#A6AEB8] px-12 py-1.5 flex items-center shadow-md">
          <div className="flex-1 flex items-center justify-center gap-4">
            <span className="font-serif font-bold text-base text-white">Centro Médico San Benito José</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${ROLE_META[user?.role || '']?.badge || ''}`}>
              {roleLabels[user?.role || '']}
            </span>
          </div>
        </header>
        <main className="flex-1 p-6 flex flex-col overflow-y-auto min-h-0 relative">
          <div className="flex-1 min-h-0">{children}</div>
        </main>
        <footer className="pt-[7px] text-center text-xs text-[#8A919C]">
          © {new Date().getFullYear()} TurtleLite · Centro Médico San Benito José
        </footer>
        <div className="fixed bottom-1.5 right-3 z-[1] text-[11px] font-medium text-slate-400/70 select-none pointer-events-none tracking-wide">
          Versión 1.0
        </div>
      </div>
    </div>
  )
}
