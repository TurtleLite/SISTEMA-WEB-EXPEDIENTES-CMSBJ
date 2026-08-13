import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Users } from './pages/Users'
import { Lists } from './pages/Lists'
import { ListDetail } from './pages/ListDetail'
import { Reports } from './pages/Reports'
import { DayList } from './pages/DayList'
import { EstadoCirugia } from './pages/EstadoCirugia'
import { Profile } from './pages/Profile'
import { Sessions } from './pages/Sessions'
import { AuditLog } from './pages/AuditLog'
import { Lock } from 'lucide-react'
import { ReactNode } from 'react'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center">Cargando...</div>
  if (!user) return <Navigate to="/login" />
  return <Layout>{children}</Layout>
}

function AccessDenied({ section }: { section: string }) {
  return (
    <div className="flex flex-1 items-center justify-center min-h-0">
      <div className="flex items-center gap-2.5 bg-rose-50 border-2 border-rose-200 text-rose-700 px-5 py-4 rounded-xl shadow-xl">
        <Lock size={16} className="shrink-0" />
        <p className="text-sm font-semibold">No tienes acceso a {section}</p>
      </div>
    </div>
  )
}

function RoleRoute({ children, roles, section }: { children: ReactNode; roles: string[]; section: string }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center">Cargando...</div>
  if (!user) return <Navigate to="/login" />
  if (!roles.includes(user.role)) return <Layout><AccessDenied section={section} /></Layout>
  return <Layout>{children}</Layout>
}

function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <NotificationProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/perfil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/users" element={<RoleRoute roles={['admin']} section="Usuarios"><Users /></RoleRoute>} />
          <Route path="/lists" element={<ProtectedRoute><Lists /></ProtectedRoute>} />
          <Route path="/lists/:id" element={<ProtectedRoute><ListDetail /></ProtectedRoute>} />
          <Route path="/reports" element={<RoleRoute roles={['direccion', 'direccion_medica']} section="Reportes"><Reports /></RoleRoute>} />
          <Route path="/listado-diario" element={<RoleRoute roles={['direccion', 'direccion_medica']} section="Listados Diarios"><DayList /></RoleRoute>} />
          <Route path="/estado-cirugia" element={<RoleRoute roles={['direccion', 'direccion_medica']} section="Estatus Cirugia"><EstadoCirugia /></RoleRoute>} />
          <Route path="/seguridad" element={<RoleRoute roles={['admin']} section="Sesiones"><Sessions /></RoleRoute>} />
          <Route path="/auditoria" element={<RoleRoute roles={['admin']} section="Auditoria"><AuditLog /></RoleRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
        </NotificationProvider>
      </AuthProvider>
    </HashRouter>
  )
}

export default App
