import { useState, useEffect } from 'react'
import { usersApi } from '../services/api'
import { User } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { Pencil, Trash2, UserPlus, Unlock, RefreshCw, UserX, UserCheck } from 'lucide-react'
import { RoleAvatar } from '../components/RoleAvatar'
import { PasswordInput } from '../components/PasswordInput'
import { formatPhone, isValidPhone } from '../utils/format'

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  direccion: 'Dirección',
  direccion_medica: 'Dirección Médica',
  medico: 'Médico',
  carga_px: 'Carga Px',
}

const capitalizeName = (value: string) =>
  value.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

const TITLE_RE = /^(Dr|Dra|Lic)\.?\s+(.*)$/i

const emptyForm = () => ({ username: '', telefono: '', nombres: '', apellidos: '', password: '', role: 'medico', titulo: '' })

export function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const { user: currentUser } = useAuth()
  const { toast, confirm } = useNotification()

  const loadUsers = async () => {
    try {
      const res = await usersApi.list()
      setUsers(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    await loadUsers()
    setRefreshing(false)
  }

  useEffect(() => {
    loadUsers()
    const id = setInterval(loadUsers, 15000)
    const onFocus = () => loadUsers()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const handleSave = async () => {
    if (saving) return
    if (!isValidPhone(form.telefono)) {
      toast('El teléfono debe tener el formato 0000-0000', 'error')
      return
    }
    setSaving(true)
    try {
      const payload: any = { ...form }
      const fullName = [payload.nombres, payload.apellidos].map((p) => (p || '').trim()).filter(Boolean).join(' ')
      payload.full_name = payload.titulo ? `${payload.titulo} ${fullName}` : fullName
      if (editingUser && !payload.password) delete payload.password
      if (editingUser) {
        await usersApi.update(editingUser.id, payload)
      } else {
        await usersApi.create(payload)
      }
      setShowModal(false)
      setEditingUser(null)
      setForm(emptyForm())
      loadUsers()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al guardar usuario', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const target = users.find((x) => x.id === id)
    if (!await confirm(`¿Eliminar al usuario ${target?.username || 'seleccionado'}? Esta acción no se puede deshacer.`)) return
    try {
      await usersApi.delete(id)
      loadUsers()
      toast('Usuario eliminado correctamente', 'success')
    } catch (err) {
      toast('Error al eliminar usuario', 'error')
    }
  }

  const isLocked = (u: User) => !!u.locked_until && new Date(u.locked_until).getTime() > Date.now()

  const handleUnlock = async (u: User) => {
    if (!await confirm(`¿Desbloquear la cuenta de ${u.username}? Podrá iniciar sesión de nuevo.`)) return
    try {
      await usersApi.unlock(u.id)
      loadUsers()
      toast('Usuario desbloqueado', 'success')
    } catch (err) {
      toast('Error al desbloquear usuario', 'error')
    }
  }

  const handleDeactivate = async (u: User) => {
    if (!await confirm(`¿Desactivar a ${u.full_name} (${u.username})? El médico ya no podrá iniciar sesión y se cerrarán sus sesiones activas. Podrá reactivarlo después.`)) return
    try {
      await usersApi.deactivate(u.id)
      loadUsers()
      toast(`Usuario ${u.username} desactivado`, 'success')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al desactivar usuario', 'error')
    }
  }

  const handleActivate = async (u: User) => {
    if (!await confirm(`¿Reactivar a ${u.full_name} (${u.username})? Podrá iniciar sesión de nuevo.`)) return
    try {
      await usersApi.activate(u.id)
      loadUsers()
      toast(`Usuario ${u.username} activado`, 'success')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al activar usuario', 'error')
    }
  }

  const openEdit = (user: User) => {
    const match = user.full_name.match(TITLE_RE)
    const name = (match ? match[2] : user.full_name).trim().split(/\s+/).filter(Boolean)
    const half = Math.ceil(name.length / 2)
    setEditingUser(user)
    setForm({
      username: user.username,
      telefono: formatPhone(user.telefono),
      nombres: name.slice(0, half).join(' '),
      apellidos: name.slice(half).join(' '),
      password: '',
      role: user.role,
      titulo: match ? `${match[1].charAt(0).toUpperCase() + match[1].slice(1)}.` : '',
    })
    setShowModal(true)
  }

  return (
    <div className="h-full flex flex-col gap-5">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-serif text-[26px] font-bold text-[#1E2A32] tracking-tight">Usuarios</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefresh}
            title="Actualizar lista"
            className="flex items-center justify-center bg-white border border-[#E4E8EE] text-[#0F766E] px-3.5 py-2.5 rounded-xl hover:bg-[#F7F8FA] hover:border-[#D5DBE3] shadow-sm transition-all duration-200"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => {
                setEditingUser(null)
                setForm(emptyForm())
                setShowModal(true)
              }}
              className="flex items-center gap-2 bg-[#0F766E] text-white px-5 py-2.5 rounded-xl hover:bg-[#115E59] shadow-sm hover:shadow-md transition-all duration-200 text-[15px] font-semibold"
            >
              <UserPlus size={18} />
              Nuevo Usuario
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E4E8EE] flex flex-col min-h-0 flex-1 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: '280px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '180px' }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#F8FAFC] border-b-2 border-[#E4E8EE]">
              <th className="text-left px-5 py-3.5 text-xs font-bold text-[#64748B] uppercase tracking-wider">Nombre</th>
              <th className="text-left px-3 py-3.5 text-xs font-bold text-[#64748B] uppercase tracking-wider">Usuario</th>
              <th className="text-left px-3 py-3.5 text-xs font-bold text-[#64748B] uppercase tracking-wider">Teléfono</th>
              <th className="text-left px-4 py-3.5 text-xs font-bold text-[#64748B] uppercase tracking-wider">Rol</th>
              <th className="text-left px-4 py-3.5 text-xs font-bold text-[#64748B] uppercase tracking-wider">Estado</th>
              <th className="text-right px-5 py-3.5 text-xs font-bold text-[#64748B] uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-[#F1F5F9] transition-all duration-150 hover:bg-[#F8FAFC] h-[68px] group">
                <td className="px-5 py-4 text-[15px] font-semibold text-[#1E2A32] truncate">
                  <div className="flex items-center gap-3">
                    <RoleAvatar role={u.role} size="md" />
                    <span className="truncate leading-tight">{u.full_name}</span>
                  </div>
                </td>
                <td className="px-3 py-4 text-[14px] text-[#334155] font-mono truncate">{u.username}</td>
                <td className="px-3 py-4 text-[14px] text-[#334155] truncate font-medium">{u.telefono}</td>
                <td className="px-4 py-4">
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F1F5F9] text-[#475569] whitespace-nowrap border border-[#E2E8F0]">
                    {roleLabels[u.role] || u.role}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {!u.is_active ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 whitespace-nowrap border border-red-200">Inactivo</span>
                  ) : isLocked(u) ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 whitespace-nowrap border border-amber-200">Bloqueado</span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 whitespace-nowrap border border-emerald-200">Activo</span>
                  )}
                </td>
                <td className="px-5 py-4 text-right">
                  {currentUser?.role === 'admin' && (
                    <div className="flex items-center justify-end gap-1 opacity-90 group-hover:opacity-100">
                      {isLocked(u) && (
                        <button onClick={() => handleUnlock(u)} title="Desbloquear" className="p-2 hover:bg-amber-100 rounded-xl transition-all duration-200 border border-transparent hover:border-amber-200">
                          <Unlock size={16} className="text-amber-600" />
                        </button>
                      )}
                      {!u.is_active ? (
                        <button onClick={() => handleActivate(u)} title="Activar" className="p-2 hover:bg-emerald-100 rounded-xl transition-all duration-200 border border-transparent hover:border-emerald-200">
                          <UserCheck size={16} className="text-emerald-600" />
                        </button>
                      ) : u.id !== currentUser?.id && (
                        <button onClick={() => handleDeactivate(u)} title="Desactivar" className="p-2 hover:bg-orange-100 rounded-xl transition-all duration-200 border border-transparent hover:border-orange-200">
                          <UserX size={16} className="text-orange-600" />
                        </button>
                      )}
                      <button onClick={() => openEdit(u)} className="p-2 hover:bg-[#EEF1F5] rounded-xl transition-all duration-200 border border-transparent hover:border-[#E4E8EE]" title="Editar">
                        <Pencil size={16} className="text-[#475569]" />
                      </button>
                      <button onClick={() => handleDelete(u.id)} className="p-2 hover:bg-red-50 rounded-xl transition-all duration-200 border border-transparent hover:border-red-200" title="Eliminar">
                        <Trash2 size={16} className="text-red-500" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-[#0F172A]/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl px-5 py-3 w-[95vw] max-w-5xl shadow-2xl">
            <h2 className="font-serif text-lg font-bold mb-4 text-[#1E2A32]">
              {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
            </h2>
            <div className="space-y-3">
              <div className="flex gap-2">
                <select
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className="w-28 shrink-0 px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                >
                  <option value="">Sin título</option>
                  <option value="Dr.">Dr.</option>
                  <option value="Dra.">Dra.</option>
                  <option value="Lic.">Lic.</option>
                </select>
                <input
                  placeholder="Nombres"
                  value={form.nombres}
                  onChange={(e) => setForm({ ...form, nombres: capitalizeName(e.target.value) })}
                  className="flex-1 min-w-0 px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                />
              </div>
              <input
                placeholder="Apellidos"
                value={form.apellidos}
                onChange={(e) => setForm({ ...form, apellidos: capitalizeName(e.target.value) })}
                className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
              />
              <input
                placeholder="Usuario"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
              />
              <input
                placeholder="0000-0000"
                type="tel"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: formatPhone(e.target.value) })}
                className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
              />
              <PasswordInput
                placeholder={editingUser ? 'Nueva contraseña (dejar vacío)' : 'Contraseña'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
              />
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
              >
                <option value="medico">Médico</option>
                <option value="direccion_medica">Dirección Médica</option>
                <option value="direccion">Dirección</option>
                <option value="carga_px">Carga Px</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] shadow-sm hover:shadow-md transition-all duration-200 font-medium disabled:opacity-50">
                {saving ? 'Guardando...' : editingUser ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
