import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { usersApi } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import { ROLE_META } from '../constants'
import { RoleAvatar } from '../components/RoleAvatar'
import { PasswordInput } from '../components/PasswordInput'
import { formatPhone, isValidPhone } from '../utils/format'

const capitalizeName = (value: string) =>
  value.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

const TITLE_RE = /^(Dr|Dra|Lic)\.?\s+(.*)$/i

const parseName = (fullName: string) => {
  const match = fullName.match(TITLE_RE)
  const name = (match ? match[2] : fullName).trim().split(/\s+/).filter(Boolean)
  const half = Math.ceil(name.length / 2)
  return {
    titulo: match ? `${match[1].charAt(0).toUpperCase() + match[1].slice(1)}.` : '',
    nombres: name.slice(0, half).join(' '),
    apellidos: name.slice(half).join(' '),
  }
}

const inputClass =
  'w-full px-3.5 py-2 border border-[#E4E8EE] rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200'
const labelClass =
  'block text-[0.6875rem] font-semibold uppercase tracking-wider text-[#5F6C79] mb-1'

export function Profile() {
  const { user, updateUser } = useAuth()
  const { toast } = useNotification()
  const [nameParts, setNameParts] = useState(() => parseName(user?.full_name || ''))
  const [telefono, setTelefono] = useState(() => formatPhone(user?.telefono || ''))
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [saving, setSaving] = useState(false)

  if (!user) return null
  const meta = ROLE_META[user.role] || ROLE_META.medico

  const handleSave = async () => {
    const fullName = [nameParts.nombres, nameParts.apellidos].map((p) => (p || '').trim()).filter(Boolean).join(' ')
    if (!fullName || !telefono.trim()) {
      toast('El nombre y el teléfono son obligatorios', 'error')
      return
    }
    if (!isValidPhone(telefono)) {
      toast('El teléfono debe tener el formato 0000-0000', 'error')
      return
    }
    try {
      setSaving(true)
      const payload: any = {
        full_name: nameParts.titulo ? `${nameParts.titulo} ${fullName}` : fullName,
        telefono: telefono.trim(),
      }
      if (password) {
        if (!currentPassword) {
          toast('Ingresa tu contraseña actual para cambiarla', 'error')
          return
        }
        payload.password = password
        payload.current_password = currentPassword
      }
      const res = await usersApi.updateMe(payload)
      updateUser(res.data)
      setPassword('')
      setCurrentPassword('')
      toast('Perfil actualizado correctamente', 'success')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al actualizar el perfil', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col gap-5 min-h-0">
      <div className="flex items-center gap-4 shrink-0">
        <RoleAvatar role={user.role} size="lg" />
        <div className="min-w-0">
          <h1 className="font-serif text-xl font-bold text-[#1E2A32] truncate">{user.full_name}</h1>
          <div className="mt-1.5 flex items-center gap-2.5">
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold border ${meta.badge}`}>
              {meta.label}
            </span>
            <span className="text-xs text-[#7A8694]">@{user.username}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 min-h-0">
        <section className="bg-white rounded-xl border border-[#E4E8EE] shadow-sm px-6 py-5 flex flex-col min-h-0">
          <h2 className="text-sm font-semibold text-[#1E2A32]">Datos personales</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className={labelClass}>Nombre y apellidos</label>
              <div className="flex gap-2.5">
                <select
                  value={nameParts.titulo}
                  onChange={(e) => setNameParts({ ...nameParts, titulo: e.target.value })}
                  className="w-20 shrink-0 px-2.5 py-2 border border-[#E4E8EE] rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                >
                  <option value="">Sin título</option>
                  <option value="Dr.">Dr.</option>
                  <option value="Dra.">Dra.</option>
                  <option value="Lic.">Lic.</option>
                </select>
                <input
                  value={nameParts.nombres}
                  onChange={(e) => setNameParts({ ...nameParts, nombres: capitalizeName(e.target.value) })}
                  placeholder="Nombres"
                  className={inputClass}
                />
                <input
                  value={nameParts.apellidos}
                  onChange={(e) => setNameParts({ ...nameParts, apellidos: capitalizeName(e.target.value) })}
                  placeholder="Apellidos"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelClass}>Teléfono</label>
                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(formatPhone(e.target.value))}
                  placeholder="0000-0000"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Usuario</label>
                <div className="px-3.5 py-2 border border-[#EEF1F5] bg-[#EEF1F5] rounded-lg text-sm text-[#5F6C79] truncate">
                  {user.username}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-[#E4E8EE] shadow-sm px-6 py-5 flex flex-col min-h-0">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-[#1E2A32]">Contraseña</h2>
            <p className="text-xs text-[#7A8694]">Opcional, solo si deseas cambiarla</p>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <label className={labelClass}>Actual</label>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder=""
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Nueva</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=""
                className={inputClass}
              />
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-auto pt-5 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[#115E59] to-[#0F766E] hover:shadow-md transition-all duration-200 active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </section>
      </div>
    </div>
  )
}
