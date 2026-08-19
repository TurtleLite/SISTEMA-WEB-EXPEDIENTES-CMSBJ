import { ReactNode, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useMessages } from '../contexts/MessagesContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { listsApi, notificationsApi } from '../services/api'
import { Notification } from '../types'
import {
  LayoutDashboard, Users, FolderOpen, FileText, LogOut, Activity, UserCircle2, Lock, ClipboardList,
  ShieldCheck, ScrollText, Bell, CheckCheck,
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
      { label: 'Expedientes', path: '/lists', icon: <FolderOpen size={18} />, roles: ['admin', 'direccion', 'direccion_medica', 'medico'] },
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
  const { unread, refresh } = useMessages()
  const navigate = useNavigate()
  const location = useLocation()
  const [denied, setDenied] = useState<string | null>(null)
  const [bellOpen, setBellOpen] = useState(false)
  const [recentNotes, setRecentNotes] = useState<Notification[]>([])

  useEffect(() => {
    if (!bellOpen) return
    notificationsApi.list({ limit: 5 })
      .then(res => setRecentNotes(res.data || []))
      .catch(() => setRecentNotes([]))
  }, [bellOpen])

  useEffect(() => {
    if (bellOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBellOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bellOpen])

  const openNotifications = () => {
    setBellOpen(false)
    navigate('/notificaciones')
  }

  const markOneRead = async (n: Notification) => {
    if (!n.is_read) {
      try {
        await notificationsApi.markRead(n.id)
        refresh()
      } catch { /* silencioso */ }
    }
    setRecentNotes(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
  }

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
    <div className="h-screen bg-[#F7F8FA] flex overflow-hidden">
      {denied && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex items-center gap-2.5 bg-rose-50 border-2 border-rose-200 text-rose-700 px-5 py-4 rounded-xl shadow-xl animate-pulse">
          <Lock size={16} className="shrink-0" />
          <p className="text-sm font-semibold">No tienes acceso a {denied}</p>
        </div>
      )}
      <aside className="w-48 bg-white flex flex-col shrink-0 h-screen sticky top-0 border-r border-[#E4E8EE]">
        <div className="px-5 pt-3 pb-2 border-b border-[#E4E8EE] flex items-center justify-center">
          <img src="/logo_sbj.png" alt="Logo SBJ Cirugias" className="w-36 h-auto mx-auto" />
        </div>
        <nav className="flex-1 px-3 py-2 flex flex-col justify-between overflow-y-auto">
          {visibleSections.map((section) => (
            <div key={section.title} className="mb-1">
              <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8794A1]">
                {section.title}
              </p>
              {section.items.map((item) => {
                const target = item.path === '/lists' && systemListId ? `/lists/${systemListId}` : item.path
                const isActive = location.pathname === target || (item.path === '/lists' && location.pathname.startsWith('/lists'))
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNavClick(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150 relative ${
                      isActive
                        ? 'bg-[#0F766E] text-white font-semibold shadow-sm'
                        : 'text-[#5F6C79] font-medium hover:text-[#0F766E] hover:bg-[#F7F8FA]'
                    }`}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    {item.label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-[#E4E8EE]">
          <button
            onClick={() => navigate('/perfil')}
            className="w-full flex items-center gap-3 mb-2 text-left group"
          >
            <div>
              <RoleAvatar role={user?.role} size="sm" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1E2A32] truncate">
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
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#5F6C79] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-150"
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-gradient-to-r from-[#0B2A26] via-[#0F3832] to-[#115E59] px-12 py-2 flex items-center">
          <div className="flex-1 flex items-center justify-center gap-3">
            <span className="font-serif font-bold text-[15px] tracking-[0.08em] text-white">CENTRO MÉDICO SAN BENITO JOSÉ</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setBellOpen(o => !o)}
                className="relative p-2 rounded-lg text-white/85 hover:text-white hover:bg-white/10 transition-colors duration-150"
                title="Notificaciones"
              >
                <Bell size={17} />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
              {bellOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setBellOpen(false)} />
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-[#E4E8EE] z-30 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#E4E8EE] bg-[#F7F8FA]">
                      <p className="text-sm font-bold text-[#1E2A32]">Notificaciones</p>
                      <div className="flex items-center gap-2">
                        {unread > 0 && (
                          <button
                            onClick={async () => { try { await notificationsApi.markAllRead(); refresh(); setRecentNotes(prev => prev.map(x => ({ ...x, is_read: true }))) } catch { /* silencioso */ } }}
                            className="flex items-center gap-1 text-[11px] font-medium text-[#0F766E] hover:text-[#115E59]"
                          >
                            <CheckCheck size={13} /> Leer todas
                          </button>
                        )}
                        <button
                          onClick={openNotifications}
                          className="text-[11px] font-medium text-[#0F766E] hover:text-[#115E59]"
                        >
                          Ver todas
                        </button>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {recentNotes.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-[#7A8694]">No tienes mensajes por ahora.</p>
                      ) : (
                        recentNotes.map(n => (
                          <button
                            key={n.id}
                            onClick={() => markOneRead(n)}
                            className={`w-full text-left px-4 py-3 border-b border-[#F0F2F5] hover:bg-[#F7F8FA] transition-colors duration-150 ${n.is_read ? '' : 'bg-teal-50/60'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-sm ${n.is_read ? 'text-[#3F4D58] font-medium' : 'text-[#1E2A32] font-bold'}`}>{n.title}</p>
                              {!n.is_read && <span className="mt-1 w-2 h-2 rounded-full bg-[#0F766E] shrink-0" />}
                            </div>
                            <p className="text-xs text-[#5F6C79] mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-[#8E9AA6] mt-1">
                              {new Date(n.created_at).toLocaleString('es-HN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${ROLE_META[user?.role || '']?.badge || ''}`}>
              {roleLabels[user?.role || '']}
            </span>
          </div>
        </header>
        <main className="flex-1 p-6 flex flex-col overflow-y-auto min-h-0 relative">
          <div className="flex-1 min-h-0">{children}</div>
        </main>
        <footer className="pt-[7px] text-center text-xs text-[#8794A1]">
          © {new Date().getFullYear()} TurtleLite · Centro Médico San Benito José
        </footer>
        <div className="fixed bottom-1.5 right-3 z-[1] text-[11px] font-medium text-[#8E9AA6] select-none pointer-events-none tracking-wide">
          Versión 1.0
        </div>
      </div>
    </div>
  )
}
